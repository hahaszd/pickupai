#!/usr/bin/env node
/**
 * Enrich license-imported prospects with mobile numbers.
 *
 * Many state licensing registers (NSW Fair Trading, VBA, QBCC) give us
 * business name + suburb but no phone. This script does:
 *
 *   For each target prospect (no AU mobile + has business_name + suburb):
 *     1. Look up "<business_name> <suburb>" via DuckDuckGo Lite (primary)
 *        with Bing as fallback; return the first non-directory URL.
 *     2. Fetch likely contact pages on that website and extract a mobile
 *        (mirrors recover-mobiles-from-websites.mjs logic).
 *     3. If found, UPDATE prospects SET phone = <mobile>, status = 'new'
 *        when previously 'not_mobile'. Log channel='website_enrichment'.
 *
 * Defaults:
 *   --max-enrichments 100     Hard cap on lookups per run.
 *   --source license_nsw      Restrict to one source (omit to enrich all
 *                             license_* sources).
 *   Dry-run by default, --apply to write.
 *
 * Cost: A$0. Both DuckDuckGo Lite and Bing are free HTML endpoints; no
 * per-call billing. --max-enrichments is just a politeness/runtime ceiling.
 *
 * Soft-block handling: if either backend starts returning challenge pages
 * (DDG: 202 + homepage shell; Bing: captcha) for 5 consecutive queries,
 * that backend is disabled for the rest of the run and the other one
 * carries the load. Both disabled → script exits early.
 */

import initSqlJs from "sql.js";
import pg from "pg";
import { randomUUID } from "node:crypto";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL env var required. Run via: node --env-file=.env scripts/enrich-prospects-from-website.mjs");
  process.exit(1);
}

// ── CLI ──────────────────────────────────────────────────────────────────────
const APPLY = process.argv.includes("--apply");
const argIdx = (flag) => process.argv.indexOf(flag);
const intArg = (flag, dflt) => argIdx(flag) > -1 ? parseInt(process.argv[argIdx(flag) + 1] ?? String(dflt), 10) : dflt;
const strArg = (flag, dflt) => argIdx(flag) > -1 ? (process.argv[argIdx(flag) + 1] ?? dflt) : dflt;

const MAX_ENRICHMENTS = intArg("--max-enrichments", 100);
const SOURCE_FILTER   = strArg("--source", null);  // e.g. "license_nsw"

// ── Phone helpers ────────────────────────────────────────────────────────────
function toE164Au(raw) {
  if (raw === null || raw === undefined) return "";
  const s = String(raw).replace(/[\s\-()]+/g, "");
  if (!s) return "";
  if (s.startsWith("+61") && s.length === 12) return s;
  if (s.startsWith("61") && s.length === 11) return "+" + s;
  if (s.startsWith("0") && s.length === 10) return "+61" + s.slice(1);
  if (/^[2-9]\d{8}$/.test(s)) return "+61" + s;
  if (s.startsWith("+")) return s;
  return s;
}
const isAuMobile = (e164) => /^\+614\d{8}$/.test(e164);

let lookupCalls = 0;
// Per-backend health: once a backend hits a soft-block streak of N, stop
// calling it for the rest of this run and use whichever backend is left.
const BACKEND_BLOCK_STREAK_LIMIT = 5;
const backendStreaks = { duckduckgo: 0, bing: 0 };
const backendDisabled = { duckduckgo: false, bing: false };

// Hosts to skip across all search backends — directories aren't useful (we
// want the business's own website so the website-crawler step can mine the
// contact page). Search-engine hosts also filtered to drop self-links.
const SKIP_RESULT_HOSTS = [
  "facebook.com", "instagram.com", "linkedin.com", "twitter.com", "x.com",
  "youtube.com", "tiktok.com",
  "hipages.com.au", "oneflare.com.au", "serviceseeking.com.au",
  "yellowpages.com.au", "truelocal.com.au", "localsearch.com.au",
  "hotfrog.com.au", "startlocal.com.au",
  "google.com", "bing.com", "duckduckgo.com", "yahoo.com",
  "wikipedia.org", "abr.business.gov.au", "asic.gov.au",
];

function acceptHref(href) {
  try {
    if (href.startsWith("//")) href = "https:" + href;
    const u = new URL(href);
    if (!/^https?:$/.test(u.protocol)) return null;
    if (SKIP_RESULT_HOSTS.some((h) => u.hostname === h || u.hostname.endsWith("." + h))) return null;
    return href;
  } catch { return null; }
}

// ── DuckDuckGo Lite search (primary backend) ─────────────────────────────────
//
// As of Apr 2026 the html.duckduckgo.com endpoint POST returns the DDG
// homepage shell instead of search results (server-side bot mitigation).
// lite.duckduckgo.com still accepts POST and returns a plain HTML results
// page with anchors of the form:
//   <a rel="nofollow" href="https://example.com/" class='result-link'>...</a>
// Note `class=` appears AFTER `href=` here, so we parse anchors in two
// passes (find tag → check class → extract href) instead of with one regex
// that assumes attribute order.
//
// DDG also IP-throttles aggressively — repeated rapid queries cause it to
// return a 202 + homepage shell for ~hours. We detect this and switch to
// Bing for the rest of the run (see bingLookup + lookup orchestrator).
const DDG_URL = "https://lite.duckduckgo.com/lite/";

async function duckDuckGoLookup(query) {
  try {
    const resp = await fetch(DDG_URL, {
      method: "POST",
      headers: {
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xhtml+xml",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: `q=${encodeURIComponent(query)}&kl=au-en`,
    });
    const html = await resp.text();
    // Soft-block detection: 202 response or DDG homepage canonical link
    // (the body lite returns when it doesn't want to serve results).
    if (resp.status === 202 || /canonical"\s+href="https:\/\/duckduckgo\.com\/"/.test(html.slice(0, 800))) {
      return { website: null, blocked: true };
    }
    if (!resp.ok) return null;

    const tagRe = /<a\b[^>]*>/gi;
    let tag;
    while ((tag = tagRe.exec(html)) !== null) {
      const t = tag[0];
      if (!/\bclass=["'][^"']*\b(?:result-link|result__a)\b[^"']*["']/i.test(t)) continue;
      const hrefM = t.match(/\bhref=["']([^"']+)["']/i);
      if (!hrefM) continue;
      let href = hrefM[1];
      const uddg = href.match(/[?&]uddg=([^&]+)/);
      if (uddg) href = decodeURIComponent(uddg[1]);
      const accepted = acceptHref(href);
      if (accepted) return { website: accepted };
    }
    return null;
  } catch {
    return null;
  }
}

// ── Bing fallback search ─────────────────────────────────────────────────────
//
// Bing's /search HTML page returns organic results inside <li class="b_algo">
// containers. Each result's href is wrapped in
//   https://www.bing.com/ck/a?...&u=a1<base64>&...
// where `a1<base64>` is `a1` + URL-safe-base64 of the destination URL.
// Bing is more lenient on automated traffic than DDG; we use it as the
// fallback when DDG soft-blocks.
const BING_URL = "https://www.bing.com/search";

function decodeBingRedirect(href) {
  // Returns the real destination URL, or null if href isn't a Bing redirect.
  try {
    const u = new URL(href, "https://www.bing.com/");
    if (u.hostname !== "www.bing.com" || !u.pathname.startsWith("/ck/")) return null;
    const uParam = u.searchParams.get("u");
    if (!uParam) return null;
    let raw = uParam;
    if (raw.startsWith("a1")) raw = raw.slice(2);
    const b64 = raw.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = Buffer.from(b64, "base64").toString("utf-8");
    return /^https?:\/\//.test(decoded) ? decoded : null;
  } catch { return null; }
}

async function bingLookup(query) {
  try {
    const url = `${BING_URL}?q=${encodeURIComponent(query)}&cc=AU&mkt=en-AU&setlang=en-AU`;
    const resp = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "en-AU,en;q=0.9",
      },
    });
    if (!resp.ok) return null;
    const html = await resp.text();
    if (/captcha|are you a robot|please verify/i.test(html.slice(0, 5000))) {
      return { website: null, blocked: true };
    }

    // Walk every b_algo block and try to extract the first decodable
    // non-skipped destination URL. We look at all anchors in the block
    // (h2 > a, tilk anchors, etc.) — the first acceptable one wins.
    const blockRe = /<li[^>]+class=["'][^"']*\bb_algo\b[^"']*["'][\s\S]*?(?=<li[^>]+class=["'][^"']*\bb_algo\b|<\/ol>)/gi;
    let blockM;
    while ((blockM = blockRe.exec(html)) !== null) {
      const block = blockM[0];
      const anchorRe = /<a[^>]+href=["']([^"']+)["']/gi;
      let aM;
      while ((aM = anchorRe.exec(block)) !== null) {
        // HTML-decode the href first (Bing emits &amp;).
        const href = aM[1].replace(/&amp;/g, "&");
        let dest = decodeBingRedirect(href);
        if (!dest && /^https?:\/\//.test(href)) dest = href;
        if (!dest) continue;
        const accepted = acceptHref(dest);
        if (accepted) return { website: accepted };
      }
    }
    return null;
  } catch {
    return null;
  }
}

// ── Orchestrated lookup: DDG → Bing fallback ─────────────────────────────────
//
// Each prospect spends one budget unit (lookupCalls) regardless of which
// backend served. If DDG/Bing soft-blocks N times in a row, that backend
// is disabled for the remainder of the run.
async function lookupWebsite(name, suburb) {
  if (lookupCalls >= MAX_ENRICHMENTS) return null;
  lookupCalls++;
  const query = `${name} ${suburb} australia`.trim();

  for (const backend of /** @type {const} */ (["duckduckgo", "bing"])) {
    if (backendDisabled[backend]) continue;
    const fn = backend === "duckduckgo" ? duckDuckGoLookup : bingLookup;
    const r = await fn(query);
    if (r?.website) {
      backendStreaks[backend] = 0;
      return { website: r.website, backend };
    }
    if (r?.blocked) {
      backendStreaks[backend]++;
      if (backendStreaks[backend] >= BACKEND_BLOCK_STREAK_LIMIT) {
        backendDisabled[backend] = true;
        console.warn(`  [warn] ${backend} disabled after ${BACKEND_BLOCK_STREAK_LIMIT} consecutive soft-blocks`);
      }
      // Try next backend on a block — don't waste the budget unit.
      continue;
    }
    // Genuine "no result" — don't try other backends, the query just has no
    // good first hit. (Otherwise we'd double the cost per unfindable target.)
    return null;
  }
  return null;
}

// ── Website crawl (mirrors recover-mobiles-from-websites.mjs) ────────────────
const FETCH_TIMEOUT_MS = 8000;
const MAX_BODY_BYTES = 200 * 1024;
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const PATH_CANDIDATES = ["/contact", "/contact-us", "/contact-us/", "/about", "/"];
const SKIP_HOSTS = [
  "facebook.com", "instagram.com", "linkedin.com", "twitter.com", "x.com",
  "youtube.com", "tiktok.com",
  "hipages.com.au", "oneflare.com.au", "serviceseeking.com.au", "yellowpages.com.au",
];

function normaliseRoot(rawUrl) {
  try {
    const u = new URL(rawUrl);
    if (!/^https?:$/.test(u.protocol)) return null;
    if (SKIP_HOSTS.some(h => u.hostname === h || u.hostname.endsWith("." + h))) return null;
    u.search = ""; u.hash = ""; u.pathname = "/";
    return u.toString().replace(/\/$/, "");
  } catch { return null; }
}

async function fetchHtml(url) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
  try {
    const resp = await fetch(url, {
      signal: ac.signal, redirect: "follow",
      headers: { "User-Agent": USER_AGENT, "Accept": "text/html,application/xhtml+xml" },
    });
    if (!resp.ok) return null;
    const ct = resp.headers.get("content-type") ?? "";
    if (!ct.includes("text/html") && !ct.includes("application/xhtml")) return null;
    const reader = resp.body?.getReader();
    if (!reader) return await resp.text();
    let received = 0; const chunks = [];
    while (received < MAX_BODY_BYTES) {
      const { value, done } = await reader.read();
      if (done) break;
      chunks.push(value); received += value.byteLength;
    }
    try { await reader.cancel(); } catch { /* ignore */ }
    return Buffer.concat(chunks.map(c => Buffer.from(c))).toString("utf-8");
  } catch { return null; }
  finally { clearTimeout(timer); }
}

function extractMobile(html) {
  if (!html) return null;
  const candidates = [];
  const telRe = /href\s*=\s*["']\s*tel:([^"']+)["']/gi;
  let m;
  while ((m = telRe.exec(html)) !== null) candidates.push(m[1]);
  const waRe = /(?:wa\.me|api\.whatsapp\.com\/send\?phone=|sms:)\s*\+?(\d[\d\s\-()]{6,})/gi;
  while ((m = waRe.exec(html)) !== null) candidates.push(m[1]);
  const plainRe = /(\+?61[\s\-]?4\d{2}[\s\-]?\d{3}[\s\-]?\d{3}|0\s*4\d{2}[\s\-]?\d{3}[\s\-]?\d{3})/g;
  while ((m = plainRe.exec(html)) !== null) candidates.push(m[1]);
  for (const c of candidates) {
    const e = toE164Au(c);
    if (isAuMobile(e)) return e;
  }
  return null;
}

async function crawlWebsite(websiteRaw) {
  const root = normaliseRoot(websiteRaw);
  if (!root) return null;
  for (const p of PATH_CANDIDATES) {
    const html = await fetchHtml(root + p);
    const mob = extractMobile(html);
    if (mob) return mob;
  }
  return null;
}

// ── Main ─────────────────────────────────────────────────────────────────────

const pool = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

try {
  console.log(`Mode:             ${APPLY ? "APPLY (writes to Neon)" : "DRY-RUN (no writes)"}`);
  console.log(`Source filter:    ${SOURCE_FILTER ?? "license_* + serviceseeking (default)"}`);
  console.log(`Lookup backends:  duckduckgo (primary) → bing (fallback). Free, no API keys.`);
  console.log(`Max enrichments:  ${MAX_ENRICHMENTS} (hard cap on lookups)`);
  console.log(`Cost estimate:    A$0 (HTML scraping; both engines tolerate slow polite traffic)`);
  console.log("");

  const res = await pool.query("SELECT data FROM sqlite_blob WHERE id = 'main'");
  if (!res.rows[0]) { console.error("No SQLite blob in Neon."); process.exit(1); }
  const SQL = await initSqlJs();
  const db = new SQL.Database(new Uint8Array(res.rows[0].data));

  // Default: enrich rows that came in with no usable phone — license
  // registers (which never include phone) and ServiceSeeking (phones gated).
  const sourceClause = SOURCE_FILTER
    ? `AND source = '${SOURCE_FILTER.replace(/'/g, "''")}'`
    : `AND (source LIKE 'license_%' OR source = 'serviceseeking')`;
  const sql = `
    SELECT prospect_id, business_name, suburb, status, source
    FROM prospects
    WHERE (status = 'not_mobile' OR phone IS NULL OR TRIM(phone) = '' OR phone NOT LIKE '+614%')
      ${sourceClause}
      AND business_name IS NOT NULL AND TRIM(business_name) <> ''
      AND status NOT IN ('do_not_contact','not_interested','replied','demo_booked','trial','paying')
    LIMIT ${MAX_ENRICHMENTS}
  `;
  const targets = [];
  const stmt = db.prepare(sql);
  while (stmt.step()) targets.push(stmt.getAsObject());
  stmt.free();

  console.log(`Eligible targets: ${targets.length}`);
  if (targets.length === 0) { console.log("Nothing to enrich."); process.exit(0); }
  console.log("");

  let foundCount = 0;
  let lookupMisses = 0;
  let websiteMisses = 0;
  let processed = 0;
  const enrichments = []; // { prospect_id, business_name, newPhone, oldStatus, website }

  // DuckDuckGo isn't billed but throttles aggressive scrapers; small delay
  // keeps us friendly.
  const perCallDelayMs = 1500;

  for (const p of targets) {
    if (lookupCalls >= MAX_ENRICHMENTS) {
      console.log(`Hit lookup cap (${MAX_ENRICHMENTS}). Stopping.`);
      break;
    }
    processed++;
    if (processed % 25 === 0) {
      console.log(`  [${processed}/${targets.length}] lookups=${lookupCalls} found=${foundCount} miss_lookup=${lookupMisses} miss_web=${websiteMisses}`);
    }

    const lookup = await lookupWebsite(p.business_name, p.suburb ?? "");
    if (!lookup || !lookup.website) { lookupMisses++; await new Promise((r) => setTimeout(r, perCallDelayMs)); continue; }

    const mobile = (await crawlWebsite(lookup.website)) ?? "";
    if (!mobile) { websiteMisses++; await new Promise((r) => setTimeout(r, perCallDelayMs)); continue; }

    foundCount++;
    enrichments.push({
      prospect_id: p.prospect_id,
      business_name: p.business_name,
      newPhone: mobile,
      oldStatus: p.status,
      website: lookup.website,
      backend: lookup.backend,
    });

    await new Promise((r) => setTimeout(r, perCallDelayMs));
  }

  console.log("");
  console.log("=== ENRICHMENT RESULTS ===");
  console.log(`  Targets processed:           ${processed}`);
  console.log(`  Lookups used:                ${lookupCalls}` +
    (backendDisabled.duckduckgo || backendDisabled.bing
      ? `  (disabled: ${[backendDisabled.duckduckgo && "duckduckgo", backendDisabled.bing && "bing"].filter(Boolean).join(", ")})`
      : ""));
  console.log(`  Mobiles recovered:           ${foundCount}`);
  console.log(`  Lookup returned no website:  ${lookupMisses}`);
  console.log(`  Website yielded no mobile:   ${websiteMisses}`);

  if (enrichments.length === 0) { console.log("\nNothing to update."); process.exit(0); }

  console.log("\nSample enrichments (first 10):");
  for (const e of enrichments.slice(0, 10)) {
    console.log(`  [${e.backend}] ${e.business_name} → ${e.newPhone}  [${e.website}]`);
  }

  if (!APPLY) {
    console.log(`\nDry-run only. Re-run with --apply to write ${enrichments.length} enrichments to Neon.`);
    process.exit(0);
  }

  let applied = 0;
  let collided = 0;
  for (const e of enrichments) {
    const dup = db.prepare("SELECT prospect_id FROM prospects WHERE phone = ? AND prospect_id <> ?");
    dup.bind([e.newPhone, e.prospect_id]);
    const isDup = dup.step();
    dup.free();
    if (isDup) { collided++; continue; }

    const newStatus = e.oldStatus === "not_mobile" ? "new" : e.oldStatus;
    const website = e.website ? e.website : null;
    const u = db.prepare(
      "UPDATE prospects SET phone = ?, status = ?, website = COALESCE(?, website) WHERE prospect_id = ?"
    );
    u.bind([e.newPhone, newStatus, website, e.prospect_id]);
    u.step(); u.free();

    const log = db.prepare(
      "INSERT INTO outreach_log (log_id, prospect_id, channel, message, status, sent_at) VALUES (?, ?, ?, ?, ?, ?)"
    );
    log.bind([
      randomUUID(), e.prospect_id, "website_enrichment",
      `enriched ${e.newPhone} via ${e.backend}+website${e.website ? ` (${e.website})` : ""}`,
      "ok", new Date().toISOString()
    ]);
    log.step(); log.free();
    applied++;
  }

  console.log(`\nApplied: ${applied} enrichments`);
  if (collided > 0) console.log(`Collisions skipped (mobile already on another prospect): ${collided}`);

  const data = db.export();
  await pool.query(
    `INSERT INTO sqlite_blob (id, data, updated_at) VALUES ('main', $1, NOW())
     ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at`,
    [Buffer.from(data)]
  );
  console.log("Database snapshot saved to Neon.");
} finally {
  await pool.end();
}
