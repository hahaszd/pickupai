#!/usr/bin/env node
/**
 * Normalise prospect phone numbers to E.164 (+61…) and soft-mark prospects
 * without a valid AU mobile (+614XXXXXXXX) as status='not_mobile' so they
 * are excluded from SMS campaigns while their history is preserved.
 *
 * Default is dry-run. Pass --apply to write changes back to Neon.
 *
 * Usage:
 *   node scripts/normalize-and-mark-prospects.mjs            # dry-run
 *   node scripts/normalize-and-mark-prospects.mjs --apply    # write to Neon
 */

import initSqlJs from "sql.js";
import pg from "pg";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL env var required. Run via: node --env-file=.env scripts/normalize-and-mark-prospects.mjs");
  process.exit(1);
}

const APPLY = process.argv.includes("--apply");

// ── Phone helpers (kept in sync with src/utils/phone.ts) ──────────────────────
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

// Statuses we WILL flip to 'not_mobile' if the phone isn't a valid AU mobile.
// Anything else (replied, demo_booked, trial, paying, do_not_contact,
// not_interested, not_mobile already) is left alone to preserve history.
const MARKABLE_STATUSES = new Set(["new", "contacted"]);

const pool = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

try {
  console.log(`Mode: ${APPLY ? "APPLY (writes to Neon)" : "DRY-RUN (no writes)"}\n`);

  const res = await pool.query("SELECT data FROM sqlite_blob WHERE id = 'main'");
  if (!res.rows[0]) {
    console.error("No SQLite blob found in Neon (sqlite_blob.id='main').");
    process.exit(1);
  }

  const SQL = await initSqlJs();
  const db = new SQL.Database(new Uint8Array(res.rows[0].data));

  const rows = [];
  const stmt = db.prepare("SELECT prospect_id, phone, status FROM prospects");
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();

  console.log(`Total prospects: ${rows.length}`);

  let normalisedCount = 0;
  let alreadyMobile = 0;
  let toMark = 0;
  let preservedNonMobile = 0;
  let emptyPhone = 0;

  const updates = []; // { id, newPhone | null, newStatus | null }

  for (const row of rows) {
    const original = row.phone ?? "";
    const normalised = toE164Au(original);
    const phoneChanged = normalised !== (original ?? "") && normalised !== "";

    if (!normalised) emptyPhone++;
    if (phoneChanged) normalisedCount++;

    const mobile = normalised && isAuMobile(normalised);
    if (mobile) alreadyMobile++;

    let newStatus = null;
    if (!mobile) {
      if (MARKABLE_STATUSES.has(row.status)) {
        newStatus = "not_mobile";
        toMark++;
      } else {
        preservedNonMobile++;
      }
    }

    if (phoneChanged || newStatus) {
      updates.push({
        id: row.prospect_id,
        newPhone: phoneChanged ? normalised : null,
        newStatus,
      });
    }
  }

  console.log("\n=== ANALYSIS ===");
  console.log(`  Phone strings re-normalised: ${normalisedCount}`);
  console.log(`  Empty / null phones:         ${emptyPhone}`);
  console.log(`  Already valid AU mobile:     ${alreadyMobile}`);
  console.log(`  Will mark as not_mobile:     ${toMark}`);
  console.log(`  Non-mobile but preserved (already replied/paying/opt-out/etc.): ${preservedNonMobile}`);

  if (updates.length === 0) {
    console.log("\nNothing to update. Done.");
    process.exit(0);
  }

  console.log(`\nTotal rows that would change: ${updates.length}`);

  if (!APPLY) {
    console.log("\nDry-run only. Re-run with --apply to write changes to Neon.");

    // Show a sample of changes
    console.log("\nSample (first 10):");
    for (const u of updates.slice(0, 10)) {
      const parts = [];
      if (u.newPhone) parts.push(`phone -> ${u.newPhone}`);
      if (u.newStatus) parts.push(`status -> ${u.newStatus}`);
      console.log(`  ${u.id}: ${parts.join(", ")}`);
    }
    process.exit(0);
  }

  // Apply
  console.log(`\nApplying ${updates.length} updates…`);
  let applied = 0;
  for (const u of updates) {
    if (u.newPhone && u.newStatus) {
      const s = db.prepare("UPDATE prospects SET phone = ?, status = ? WHERE prospect_id = ?");
      s.bind([u.newPhone, u.newStatus, u.id]);
      s.step();
      s.free();
    } else if (u.newPhone) {
      const s = db.prepare("UPDATE prospects SET phone = ? WHERE prospect_id = ?");
      s.bind([u.newPhone, u.id]);
      s.step();
      s.free();
    } else if (u.newStatus) {
      const s = db.prepare("UPDATE prospects SET status = ? WHERE prospect_id = ?");
      s.bind([u.newStatus, u.id]);
      s.step();
      s.free();
    }
    applied++;
  }
  console.log(`Applied ${applied} updates.`);

  // Persist back to Neon
  const data = db.export();
  const buf = Buffer.from(data);
  await pool.query(
    `INSERT INTO sqlite_blob (id, data, updated_at) VALUES ('main', $1, NOW())
     ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at`,
    [buf]
  );
  console.log("Database snapshot saved to Neon.");

  // Final status breakdown
  console.log("\n=== STATUS BREAKDOWN (after) ===");
  const after = [];
  const s2 = db.prepare("SELECT status, COUNT(*) AS cnt FROM prospects GROUP BY status ORDER BY cnt DESC");
  while (s2.step()) after.push(s2.getAsObject());
  s2.free();
  for (const r of after) console.log(`  ${r.status}: ${r.cnt}`);

  const sendable = db.prepare(
    "SELECT COUNT(*) AS cnt FROM prospects WHERE phone LIKE '+614%' AND status NOT IN ('do_not_contact','not_interested','not_mobile')"
  );
  sendable.step();
  console.log(`\nSendable (mobile + eligible status): ${sendable.getAsObject().cnt}`);
  sendable.free();
} finally {
  await pool.end();
}
