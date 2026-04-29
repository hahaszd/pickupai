#!/usr/bin/env node
/**
 * Recover mobile numbers for prospects whose Google Places listing showed
 * a 1300/landline (or no number at all) but whose own website lists a
 * direct mobile (e.g. "Call Mike on 0412 345 678").
 *
 * Targets prospects that have a website AND
 *   (status = 'not_mobile' OR phone is empty OR phone doesn't start with +614).
 *
 * For each target:
 *   1. Fetch a few likely contact pages with low timeout + small body cap.
 *   2. Extract phone candidates in priority order:
 *        a. <a href="tel:..."> links (strongest signal)
 *        b. WhatsApp / SMS deep links (wa.me/61..., sms:...)
 *        c. Plain text 0412/+61 4 patterns
 *   3. Normalise each via toE164Au() and accept the first that passes
 *      isAuMobile().
 *   4. UPDATE the prospect: phone -> recovered mobile, and if its status
 *      was 'not_mobile' promote back to 'new'.
 *   5. Append an outreach_log row with channel='website_recovery' so we
 *      have an audit trail.
 *
 * Usage:
 *   node scripts/recover-mobiles-from-websites.mjs              # dry-run
 *   node scripts/recover-mobiles-from-websites.mjs --apply      # write to Neon
 *   node scripts/recover-mobiles-from-websites.mjs --limit 500  # cap targets
 */

import initSqlJs from "sql.js";
import pg from "pg";
import { randomUUID } from "node:crypto";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://neondb_owner:npg_p7TKVWbOQy2F@ep-long-mountain-a75ui4v2-pooler.ap-southeast-2.aws.neon.tech/neondb?sslmode=require";

const APPLY = process.argv.includes("--apply");
const LIMIT_IDX = process.argv.indexOf("--limit");
const LIMIT = LIMIT_IDX > -1 ? parseInt(process.argv[LIMIT_IDX + 1] ?? "0", 10) : 0;

// ── Phone helpers (kept in sync with src/utils/phone.ts) ─────────────────────
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

// ── Crawl config ─────────────────────────────────────────────────────────────
const FETCH_TIMEOUT_MS = 8000;
const MAX_BODY_BYTES = 200 * 1024;
const CONCURRENCY = 5;
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const SKIP_HOSTS = [
  "facebook.com", "fb.com", "instagram.com", "linkedin.com", "twitter.com", "x.com",
  "youtube.com", "tiktok.com",
  "hipages.com.au", "oneflare.com.au", "serviceseeking.com.au", "yellowpages.com.au",
  "truelocal.com.au", "localsearch.com.au", "startlocal.com.au", "hotfrog.com.au",
  "google.com", "maps.google.com",
];

const PATH_CANDIDATES = ["/contact", "/contact-us", "/contact-us/", "/about", "/", ""];

function normaliseRoot(rawUrl) {
  try {
    const u = new URL(rawUrl);
    if (!/^https?:$/.test(u.protocol)) return null;
    if (SKIP_HOSTS.some(h => u.hostname === h || u.hostname.endsWith("." + h))) return null;
    u.search = "";
    u.hash = "";
    u.pathname = "/";
    return u.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

async function fetchOne(url) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
  try {
    const resp = await fetch(url, {
      signal: ac.signal,
      redirect: "follow",
      headers: {
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "en-AU,en;q=0.9",
      },
    });
    if (!resp.ok) return null;
    const ct = resp.headers.get("content-type") ?? "";
    if (!ct.includes("text/html") && !ct.includes("application/xhtml")) return null;
    // Cap body size by streaming chunks
    const reader = resp.body?.getReader();
    if (!reader) return await resp.text();
    let received = 0;
    const chunks = [];
    while (received < MAX_BODY_BYTES) {
      const { value, done } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.byteLength;
      if (received >= MAX_BODY_BYTES) break;
    }
    try { await reader.cancel(); } catch { /* ignore */ }
    return Buffer.concat(chunks.map(c => Buffer.from(c))).toString("utf-8");
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Extract candidate phone strings in priority order.
function extractCandidates(html) {
  const out = [];
  if (!html) return out;

  // 1. tel: links (highest signal)
  const telRe = /href\s*=\s*["']\s*tel:([^"']+)["']/gi;
  let m;
  while ((m = telRe.exec(html)) !== null) out.push({ raw: m[1], src: "tel" });

  // 2. wa.me / api.whatsapp.com / sms: links
  const waRe = /(?:wa\.me|api\.whatsapp\.com\/send\?phone=|sms:)\s*\+?(\d[\d\s\-()]{6,})/gi;
  while ((m = waRe.exec(html)) !== null) out.push({ raw: m[1], src: "wa" });

  // 3. Plain-text AU mobile patterns
  //    +61 4xx xxx xxx, 04xx xxx xxx, 04xxxxxxxx
  const plainRe = /(\+?61[\s\-]?4\d{2}[\s\-]?\d{3}[\s\-]?\d{3}|0\s*4\d{2}[\s\-]?\d{3}[\s\-]?\d{3})/g;
  while ((m = plainRe.exec(html)) !== null) out.push({ raw: m[1], src: "text" });

  return out;
}

function pickMobile(candidates) {
  for (const c of candidates) {
    const e164 = toE164Au(c.raw);
    if (isAuMobile(e164)) return { phone: e164, src: c.src };
  }
  return null;
}

async function crawlOne(websiteRaw) {
  const root = normaliseRoot(websiteRaw);
  if (!root) return { status: "skip_invalid_url" };

  for (const path of PATH_CANDIDATES) {
    const url = root + path;
    const html = await fetchOne(url);
    if (!html) continue;
    const candidates = extractCandidates(html);
    const picked = pickMobile(candidates);
    if (picked) return { status: "found", url, phone: picked.phone, src: picked.src };
  }
  return { status: "no_mobile" };
}

// ── Concurrency-limited runner ───────────────────────────────────────────────
async function runWithLimit(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  async function pull() {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await worker(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: limit }, pull));
  return results;
}

// ── Main ─────────────────────────────────────────────────────────────────────
const pool = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

try {
  console.log(`Mode: ${APPLY ? "APPLY (writes to Neon)" : "DRY-RUN (no writes)"}`);
  if (LIMIT > 0) console.log(`Target limit: ${LIMIT}`);
  console.log("");

  const res = await pool.query("SELECT data FROM sqlite_blob WHERE id = 'main'");
  if (!res.rows[0]) { console.error("No SQLite blob in Neon."); process.exit(1); }

  const SQL = await initSqlJs();
  const db = new SQL.Database(new Uint8Array(res.rows[0].data));

  const targets = [];
  const stmt = db.prepare(`
    SELECT prospect_id, business_name, phone, website, status
    FROM prospects
    WHERE website IS NOT NULL AND TRIM(website) <> ''
      AND (
        status = 'not_mobile'
        OR phone IS NULL
        OR TRIM(phone) = ''
        OR phone NOT LIKE '+614%'
      )
      AND status NOT IN ('do_not_contact','not_interested','replied','demo_booked','trial','paying')
  `);
  while (stmt.step()) targets.push(stmt.getAsObject());
  stmt.free();

  let work = targets;
  if (LIMIT > 0 && work.length > LIMIT) work = work.slice(0, LIMIT);

  console.log(`Eligible prospects: ${targets.length}`);
  console.log(`Will crawl: ${work.length}`);
  console.log(`Concurrency: ${CONCURRENCY}, timeout/req: ${FETCH_TIMEOUT_MS}ms`);
  console.log("");

  let foundCount = 0;
  let skipInvalid = 0;
  let noMobile = 0;
  let processed = 0;
  const recoveries = []; // { prospect_id, business_name, oldPhone, newPhone, oldStatus, src, url }

  await runWithLimit(work, CONCURRENCY, async (p) => {
    const result = await crawlOne(p.website);
    processed++;
    if (processed % 100 === 0) {
      console.log(`  [${processed}/${work.length}] found=${foundCount} skip_invalid=${skipInvalid} no_mobile=${noMobile}`);
    }
    if (result.status === "skip_invalid_url") { skipInvalid++; return; }
    if (result.status === "no_mobile") { noMobile++; return; }
    foundCount++;
    recoveries.push({
      prospect_id: p.prospect_id,
      business_name: p.business_name,
      oldPhone: p.phone ?? "",
      newPhone: result.phone,
      oldStatus: p.status,
      src: result.src,
      url: result.url,
    });
  });

  console.log("");
  console.log("=== CRAWL RESULTS ===");
  console.log(`  Crawled:           ${processed}`);
  console.log(`  Mobiles recovered: ${foundCount}`);
  console.log(`  No mobile found:   ${noMobile}`);
  console.log(`  Invalid URL/skip:  ${skipInvalid}`);

  if (recoveries.length === 0) {
    console.log("\nNothing to update.");
    process.exit(0);
  }

  console.log("\nSample recoveries (first 10):");
  for (const r of recoveries.slice(0, 10)) {
    console.log(`  ${r.business_name} | ${r.oldPhone || "(empty)"} -> ${r.newPhone}  [${r.src}]`);
  }

  if (!APPLY) {
    console.log(`\nDry-run only. Re-run with --apply to write ${recoveries.length} recoveries to Neon.`);
    process.exit(0);
  }

  // Apply: dedupe against existing phones first to avoid UNIQUE-style collisions
  let applied = 0;
  let collided = 0;
  for (const r of recoveries) {
    const dup = db.prepare("SELECT prospect_id FROM prospects WHERE phone = ? AND prospect_id <> ?");
    dup.bind([r.newPhone, r.prospect_id]);
    const isDup = dup.step();
    dup.free();
    if (isDup) { collided++; continue; }

    const newStatus = r.oldStatus === "not_mobile" ? "new" : r.oldStatus;
    const u = db.prepare("UPDATE prospects SET phone = ?, status = ? WHERE prospect_id = ?");
    u.bind([r.newPhone, newStatus, r.prospect_id]);
    u.step(); u.free();

    const log = db.prepare(
      "INSERT INTO outreach_log (log_id, prospect_id, channel, message, status, sent_at) VALUES (?, ?, ?, ?, ?, ?)"
    );
    log.bind([
      randomUUID(), r.prospect_id, "website_recovery",
      `recovered ${r.newPhone} from ${r.url} (${r.src}); was ${r.oldPhone || "(empty)"}`,
      "ok", new Date().toISOString()
    ]);
    log.step(); log.free();
    applied++;
  }

  console.log(`\nApplied: ${applied} recoveries`);
  if (collided > 0) console.log(`Collisions skipped (mobile already on another prospect): ${collided}`);

  const data = db.export();
  const buf = Buffer.from(data);
  await pool.query(
    `INSERT INTO sqlite_blob (id, data, updated_at) VALUES ('main', $1, NOW())
     ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at`,
    [buf]
  );
  console.log("Database snapshot saved to Neon.");

  // Final breakdown
  console.log("\n=== STATUS BREAKDOWN (after) ===");
  const after = [];
  const s2 = db.prepare("SELECT status, COUNT(*) AS cnt FROM prospects GROUP BY status ORDER BY cnt DESC");
  while (s2.step()) after.push(s2.getAsObject());
  s2.free();
  for (const row of after) console.log(`  ${row.status}: ${row.cnt}`);
} finally {
  await pool.end();
}
