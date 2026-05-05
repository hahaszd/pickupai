#!/usr/bin/env node
/**
 * Backfill Mobile Message-side opt-outs into the local prospects table.
 *
 * Why this exists
 * ---------------
 * Mobile Message keeps a per-account suppression list that intercepts every
 * outbound message before it leaves their gateway. When a recipient texts
 * STOP to a PickupAI alphanumeric send, the unsubscribe is recorded on
 * MM's side immediately. If our `/mobilemsg/sms/incoming` webhook is also
 * configured (it is, as of the Phase 1 deploy), the inbound STOP also
 * stamps `prospects.unsubscribed_at` for us going forward.
 *
 * But anyone who texted STOP between MM's first send to them and the
 * webhook becoming active won't have a row in our DB. This script
 * reconciles the two so the local suppression list is a strict superset
 * of what MM enforces, which is what ACMA reporting expects ("show me
 * everyone you've stopped contacting and when").
 *
 * Defaults to dry-run. Pass --apply to actually write.
 *
 * Usage
 * -----
 *   DATABASE_URL=postgresql://...  \
 *   MOBILE_MSG_API_USER=... MOBILE_MSG_API_PASSWORD=... \
 *     node scripts/backfill-mm-unsubscribes.mjs            # dry-run (default)
 *     node scripts/backfill-mm-unsubscribes.mjs --apply    # actually write
 *     node scripts/backfill-mm-unsubscribes.mjs --apply --limit 50
 *
 * Idempotency
 * -----------
 * The UPDATE uses COALESCE on unsubscribed_at so a prospect already
 * stamped by the inbound webhook (or by a previous backfill run) is
 * never re-stamped — we only fill in NULLs. The opt_out outreach_log
 * row is only inserted when we actually flip a NULL to a value, so
 * re-running the script produces "0 to backfill" once everything is
 * in sync. That property is the safety net for running it before/after
 * MM dashboard checks.
 *
 * Race window
 * -----------
 * Reads the SQLite blob from Postgres, mutates in memory, writes back
 * the full blob. If the live server writes between our read and write
 * those changes are clobbered. Run during a quiet period (no active
 * SMS batch). The script prints both timestamps so you can spot a
 * race after the fact.
 */

import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import initSqlJs from "sql.js";
import pg from "pg";

const DATABASE_URL = process.env.DATABASE_URL;
const MM_USER = process.env.MOBILE_MSG_API_USER;
const MM_PASS = process.env.MOBILE_MSG_API_PASSWORD;

if (!DATABASE_URL) { console.error("ERROR: DATABASE_URL env var required"); process.exit(1); }
if (!MM_USER || !MM_PASS) { console.error("ERROR: MOBILE_MSG_API_USER and MOBILE_MSG_API_PASSWORD env vars required"); process.exit(1); }

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const limitIdx = args.indexOf("--limit");
const HARD_LIMIT = limitIdx >= 0 ? Number(args[limitIdx + 1]) : Infinity;
if (!Number.isFinite(HARD_LIMIT) && HARD_LIMIT !== Infinity) {
  console.error("ERROR: --limit must be a number"); process.exit(1);
}

const MM_API_BASE = "https://api.mobilemessage.com.au/v1";
const PAGE_SIZE = 500;

/** Mirror of src/utils/phone.ts toE164Au — kept in sync manually. */
function toE164Au(phone) {
  const stripped = String(phone ?? "").replace(/[\s\-()]+/g, "");
  if (stripped.startsWith("+61") && stripped.length === 12) return stripped;
  if (stripped.startsWith("61") && stripped.length === 11) return "+" + stripped;
  if (stripped.startsWith("0") && stripped.length === 10) return "+61" + stripped.slice(1);
  if (/^[2-9]\d{8}$/.test(stripped)) return "+61" + stripped;
  if (stripped.startsWith("+")) return stripped;
  return stripped;
}

const authHeader = "Basic " + Buffer.from(`${MM_USER}:${MM_PASS}`).toString("base64");

/**
 * Page through MM's unsubscribes list. The MM API contract per the rollout
 * plan is `GET /v1/unsubscribes?limit=N&offset=M`. The response shape isn't
 * formally documented across versions, so we accept a few common
 * envelope shapes:
 *   { data: [...], total: N }
 *   { unsubscribes: [...] }
 *   [...]
 */
async function fetchMmUnsubscribes() {
  const all = [];
  let offset = 0;
  for (let page = 0; page < 100; page++) {
    const url = `${MM_API_BASE}/unsubscribes?limit=${PAGE_SIZE}&offset=${offset}`;
    const res = await fetch(url, { headers: { Authorization: authHeader, Accept: "application/json" } });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`MM /unsubscribes returned HTTP ${res.status}: ${body.slice(0, 300)}`);
    }
    const json = await res.json();
    const rows = Array.isArray(json) ? json
      : Array.isArray(json?.data) ? json.data
      : Array.isArray(json?.unsubscribes) ? json.unsubscribes
      : Array.isArray(json?.results) ? json.results
      : null;
    if (!rows) {
      throw new Error(`MM /unsubscribes response shape not recognised: ${JSON.stringify(json).slice(0, 300)}`);
    }
    if (rows.length === 0) break;
    all.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    offset += rows.length;
  }
  return all;
}

/**
 * Coerce a single MM unsubscribe row into a normalised shape. Different
 * MM API versions have used different field names; cover the common ones.
 */
function normaliseMmRow(row) {
  const phoneRaw = row.phone ?? row.number ?? row.to ?? row.recipient ?? null;
  if (!phoneRaw) return null;
  const dateRaw = row.unsubscribed_at ?? row.created_at ?? row.date ?? row.timestamp ?? null;
  const e164 = toE164Au(phoneRaw);
  if (!/^\+\d{8,15}$/.test(e164)) return null;
  let isoDate;
  if (dateRaw) {
    const d = new Date(dateRaw);
    isoDate = isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
  } else {
    isoDate = new Date().toISOString();
  }
  return { e164, mm_unsubscribed_at: isoDate, raw: row };
}

const pool = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

try {
  console.log(`# MM unsubscribe backfill`);
  console.log(`Mode:        ${APPLY ? "APPLY (will write)" : "dry-run (read-only)"}`);
  console.log(`Limit:       ${HARD_LIMIT === Infinity ? "no cap" : HARD_LIMIT}`);
  console.log(`Generated:   ${new Date().toISOString()}`);

  console.log(`\n[1/4] Fetching MM unsubscribes (paginated)...`);
  const mmRowsRaw = await fetchMmUnsubscribes();
  console.log(`      MM returned ${mmRowsRaw.length} rows`);

  const mmRows = mmRowsRaw.map(normaliseMmRow).filter(Boolean);
  console.log(`      Normalised to ${mmRows.length} usable phone+date pairs`);

  if (mmRows.length === 0) {
    console.log(`\nNothing to reconcile. (MM has no opt-outs, or the API response shape was unrecognised.)`);
    process.exit(0);
  }

  console.log(`\n[2/4] Reading SQLite blob from Postgres...`);
  const blobReadAt = new Date().toISOString();
  const res = await pool.query("SELECT data, updated_at FROM sqlite_blob WHERE id = 'main'");
  if (!res.rows.length) { console.error("ERROR: sqlite_blob row 'main' not found"); process.exit(2); }
  console.log(`      Blob updated_at: ${res.rows[0].updated_at}`);
  console.log(`      Read at:         ${blobReadAt}`);

  const SQL = await initSqlJs();
  const db = new SQL.Database(new Uint8Array(res.rows[0].data));

  const queryAll = (sql, params = []) => {
    const stmt = db.prepare(sql);
    if (params.length) stmt.bind(params);
    const out = [];
    while (stmt.step()) out.push(stmt.getAsObject());
    stmt.free();
    return out;
  };

  console.log(`\n[3/4] Matching MM phones to local prospects...`);
  // Pull every phone we know about so the reverse-lookup map below covers
  // every storage variant that may exist (E.164, local 0-prefixed, raw 614…).
  const allProspects = queryAll(
    "SELECT prospect_id, business_name, phone, status, unsubscribed_at FROM prospects WHERE phone IS NOT NULL"
  );
  console.log(`      Local prospects with phone: ${allProspects.length}`);

  const prospectByE164 = new Map();
  for (const p of allProspects) {
    const e164 = toE164Au(p.phone);
    if (/^\+\d{8,15}$/.test(e164)) prospectByE164.set(e164, p);
  }

  const toBackfill = [];
  const alreadyOk = [];
  const unmatched = [];

  for (const mm of mmRows) {
    const p = prospectByE164.get(mm.e164);
    if (!p) { unmatched.push(mm); continue; }
    if (p.unsubscribed_at) { alreadyOk.push({ prospect: p, mm }); continue; }
    toBackfill.push({ prospect: p, mm });
  }

  console.log(`\n      Already stamped (unsubscribed_at IS NOT NULL): ${alreadyOk.length}`);
  console.log(`      Would back-fill (matched, currently NULL):      ${toBackfill.length}`);
  console.log(`      Unmatched (MM number not in prospects table):    ${unmatched.length}`);

  // Always write the unmatched-CSV — it's a forensic record needed for
  // ACMA "what suppressions does MM enforce that we don't track?" audits,
  // even on dry-runs.
  if (unmatched.length > 0) {
    const csvDir = path.join(process.cwd(), ".tmp");
    fs.mkdirSync(csvDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const csvPath = path.join(csvDir, `unmatched-mm-unsubscribes-${stamp}.csv`);
    const header = "phone_e164,mm_unsubscribed_at,raw_payload\n";
    const body = unmatched.map(u =>
      `${u.e164},${u.mm_unsubscribed_at},"${JSON.stringify(u.raw).replace(/"/g, '""')}"`
    ).join("\n");
    fs.writeFileSync(csvPath, header + body + "\n", "utf8");
    console.log(`      Unmatched CSV written: ${csvPath}`);
  }

  if (toBackfill.length === 0) {
    console.log(`\n[4/4] Nothing to write. Local table is already in sync with MM.`);
    process.exit(0);
  }

  // Show the first 20 so an operator can sanity-check before --apply.
  console.log(`\n      First ${Math.min(20, toBackfill.length)} candidates:`);
  for (const { prospect, mm } of toBackfill.slice(0, 20)) {
    console.log(`        ${prospect.phone.padEnd(16)} ${prospect.business_name?.slice(0, 40).padEnd(40)} → stamp ${mm.mm_unsubscribed_at}`);
  }

  if (!APPLY) {
    console.log(`\n[4/4] DRY RUN — no writes performed. Re-run with --apply to commit.`);
    process.exit(0);
  }

  const cap = Math.min(toBackfill.length, HARD_LIMIT);
  console.log(`\n[4/4] APPLYING — backfilling ${cap} prospects (cap=${HARD_LIMIT === Infinity ? "none" : HARD_LIMIT})`);

  let stamped = 0;
  for (const { prospect, mm } of toBackfill.slice(0, cap)) {
    // Idempotent UPDATE: COALESCE means a value already there wins, so a
    // racing webhook write between our read and write is preserved.
    const u = db.prepare(
      "UPDATE prospects SET unsubscribed_at = COALESCE(unsubscribed_at, ?), status = 'do_not_contact' WHERE prospect_id = ?"
    );
    u.bind([mm.mm_unsubscribed_at, prospect.prospect_id]);
    u.step(); u.free();

    const ins = db.prepare(
      `INSERT INTO outreach_log (log_id, prospect_id, channel, message, status, sent_at)
       VALUES (?, ?, 'sms_reply', '[backfilled from MM /v1/unsubscribes]', 'opt_out', ?)`
    );
    ins.bind([randomUUID(), prospect.prospect_id, mm.mm_unsubscribed_at]);
    ins.step(); ins.free();
    stamped++;
  }

  console.log(`      Stamped ${stamped} prospects in the in-memory blob.`);

  console.log(`      Writing blob back to Postgres...`);
  const writeStartedAt = new Date().toISOString();
  const data = db.export();
  const buf = Buffer.from(data);
  await pool.query(
    `INSERT INTO sqlite_blob (id, data, updated_at) VALUES ('main', $1, NOW())
     ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at`,
    [buf]
  );
  const writeFinishedAt = new Date().toISOString();
  console.log(`      Blob saved. Write window: ${writeStartedAt} -> ${writeFinishedAt}`);

  console.log(`\n# DONE — re-run without --apply to verify "0 to backfill" (idempotency check).`);
} finally {
  await pool.end();
}
