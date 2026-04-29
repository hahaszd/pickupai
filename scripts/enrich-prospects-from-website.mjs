#!/usr/bin/env node
/**
 * Enrich license-imported prospects with mobile numbers.
 *
 * Many state licensing registers (NSW Fair Trading, VBA, QBCC) give us
 * business name + suburb but no phone. This script does:
 *
 *   For each target prospect (no AU mobile + has business_name + suburb):
 *     1. Look up "<business_name> <suburb>" via Google Places searchText
 *        (same API the collect-leads.ts script uses).
 *     2. If Places returns a website URI, fetch likely contact pages and
 *        extract a mobile (mirrors recover-mobiles-from-websites.mjs logic).
 *     3. If found, UPDATE prospects SET phone = <mobile>, status = 'new'
 *        when previously 'not_mobile'. Log channel='website_enrichment'.
 *
 * Defaults:
 *   --max-enrichments 1000    Hard cap on Places lookups per run (~$32 USD)
 *   --source license_nsw      Restrict to one source (omit to enrich all
 *                             license_* sources)
 *   Dry-run by default, --apply to write.
 *
 * Cost note (Google Places Pro tier ~$32/1k):
 *   1000 enrichments → ~$32 USD worst case (often $0 because the first
 *   5,000 Pro requests/month are free).
 */

import initSqlJs from "sql.js";
import pg from "pg";
import { randomUUID } from "node:crypto";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://neondb_owner:npg_p7TKVWbOQy2F@ep-long-mountain-a75ui4v2-pooler.ap-southeast-2.aws.neon.tech/neondb?sslmode=require";

const API_KEY = process.env.GOOGLE_PLACES_API_KEY;

// ── CLI ──────────────────────────────────────────────────────────────────────
const APPLY = process.argv.includes("--apply");
const argIdx = (flag) => process.argv.indexOf(flag);
const intArg = (flag, dflt) => argIdx(flag) > -1 ? parseInt(process.argv[argIdx(flag) + 1] ?? String(dflt), 10) : dflt;
const strArg = (flag, dflt) => argIdx(flag) > -1 ? (process.argv[argIdx(flag) + 1] ?? dflt) : dflt;

const MAX_ENRICHMENTS = intArg("--max-enrichments", 1000);
const SOURCE_FILTER   = strArg("--source", null); // e.g. "license_nsw"

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

// ── Google Places searchText (same shape collect-leads.ts uses) ──────────────
const PLACES_URL = "https://places.googleapis.com/v1/places:searchText";
let placesCalls = 0;

async function placesLookup(name, suburb) {
  if (placesCalls >= MAX_ENRICHMENTS) return null;
  placesCalls++;
  const query = `${name} ${suburb}`.trim();
  try {
    const resp = await fetch(PLACES_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": API_KEY,
        "X-Goog-FieldMask": [
          "places.displayName",
          "places.nationalPhoneNumber",
          "places.internationalPhoneNumber",
          "places.websiteUri",
        ].join(","),
      },
      body: JSON.stringify({
        textQuery: query,
        languageCode: "en",
        regionCode: "AU",
        pageSize: 1,
      }),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    const place = (data.places ?? [])[0];
    if (!place) return null;
    return {
      phone: place.internationalPhoneNumber ?? place.nationalPhoneNumber ?? "",
      website: place.websiteUri ?? "",
    };
  } catch {
    return null;
  }
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
if (!API_KEY) {
  console.error("Error: GOOGLE_PLACES_API_KEY required in .env (same key collect-leads.ts uses).");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

try {
  console.log(`Mode:             ${APPLY ? "APPLY (writes to Neon)" : "DRY-RUN (no writes)"}`);
  console.log(`Source filter:    ${SOURCE_FILTER ?? "all license_* sources"}`);
  console.log(`Max enrichments:  ${MAX_ENRICHMENTS} (hard cap on Places lookups)`);
  console.log("");

  const res = await pool.query("SELECT data FROM sqlite_blob WHERE id = 'main'");
  if (!res.rows[0]) { console.error("No SQLite blob in Neon."); process.exit(1); }
  const SQL = await initSqlJs();
  const db = new SQL.Database(new Uint8Array(res.rows[0].data));

  const sourceClause = SOURCE_FILTER
    ? `AND source = '${SOURCE_FILTER.replace(/'/g, "''")}'`
    : `AND source LIKE 'license_%'`;
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
  let placesMisses = 0;
  let websiteMisses = 0;
  let processed = 0;
  const enrichments = []; // { prospect_id, business_name, newPhone, oldStatus, website, src }

  for (const p of targets) {
    if (placesCalls >= MAX_ENRICHMENTS) {
      console.log(`Hit Places cap (${MAX_ENRICHMENTS}). Stopping.`);
      break;
    }
    processed++;
    if (processed % 25 === 0) {
      console.log(`  [${processed}/${targets.length}] places=${placesCalls} found=${foundCount} miss_places=${placesMisses} miss_web=${websiteMisses}`);
    }

    const lookup = await placesLookup(p.business_name, p.suburb ?? "");
    if (!lookup) { placesMisses++; continue; }

    // Direct Places phone first (no website fetch needed)
    let mobile = "";
    const placesPhone = toE164Au(lookup.phone);
    if (placesPhone && isAuMobile(placesPhone)) {
      mobile = placesPhone;
    } else if (lookup.website) {
      mobile = (await crawlWebsite(lookup.website)) ?? "";
    }

    if (!mobile) { websiteMisses++; continue; }

    foundCount++;
    enrichments.push({
      prospect_id: p.prospect_id,
      business_name: p.business_name,
      newPhone: mobile,
      oldStatus: p.status,
      website: lookup.website,
      src: placesPhone === mobile ? "places_phone" : "website",
    });
  }

  console.log("");
  console.log("=== ENRICHMENT RESULTS ===");
  console.log(`  Targets processed:         ${processed}`);
  console.log(`  Places lookups used:       ${placesCalls}`);
  console.log(`  Mobiles recovered:         ${foundCount}`);
  console.log(`  Places returned no match:  ${placesMisses}`);
  console.log(`  Website yielded no mobile: ${websiteMisses}`);

  if (enrichments.length === 0) { console.log("\nNothing to update."); process.exit(0); }

  console.log("\nSample enrichments (first 10):");
  for (const e of enrichments.slice(0, 10)) {
    console.log(`  ${e.business_name} → ${e.newPhone}  [${e.src}]`);
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
      `enriched ${e.newPhone} via ${e.src}${e.website ? ` (${e.website})` : ""}`,
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
