#!/usr/bin/env node
/**
 * Suppression-list export.
 *
 * Dumps every prospect with `unsubscribed_at IS NOT NULL` to a CSV, suitable
 * for off-site backup or producing on demand for ACMA. Run on a schedule
 * (cron-style daily/weekly) to keep an immutable, dated history of who
 * opted out and when.
 *
 * The point is **legal record-keeping**: if ACMA queries why a particular
 * person was (or wasn't) suppressed, you can produce dated evidence.
 *
 * Read-only.
 *
 * Usage:
 *   DATABASE_URL=postgresql://... node scripts/export-suppression-list.mjs > suppression-2026-04-30.csv
 *   DATABASE_URL=... node scripts/export-suppression-list.mjs --out backups/suppression-$(date +%F).csv
 *
 * Suggested cron (server side, daily at 02:00 Sydney):
 *   0 2 * * * cd /app && DATABASE_URL=$DATABASE_URL node scripts/export-suppression-list.mjs --out /backups/suppression-$(date +\%F).csv
 */

import fs from "node:fs";
import initSqlJs from "sql.js";
import pg from "pg";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error("ERROR: DATABASE_URL env var required"); process.exit(1); }

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const val = argv[i + 1];
      if (val === undefined || val.startsWith("--")) { console.error(`ERROR: --${key} requires a value`); process.exit(1); }
      out[key] = val;
      i++;
    }
  }
  return out;
}
const args = parseArgs(process.argv);

function csvEsc(s) {
  if (s == null) return "";
  const str = String(s);
  if (/[",\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

const pool = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

try {
  const res = await pool.query("SELECT data FROM sqlite_blob WHERE id = 'main'");
  const SQL = await initSqlJs();
  const db = new SQL.Database(new Uint8Array(res.rows[0].data));

  const stmt = db.prepare(
    `SELECT prospect_id, business_name, phone, email, suburb, state, source,
            unsubscribed_at, last_contacted_at, status, created_at
     FROM prospects
     WHERE unsubscribed_at IS NOT NULL
     ORDER BY unsubscribed_at DESC`
  );
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();

  const header = ["prospect_id", "business_name", "phone", "email", "suburb", "state", "source", "unsubscribed_at", "last_contacted_at", "status", "created_at"];
  const lines = [header.join(",")];
  for (const r of rows) lines.push(header.map(h => csvEsc(r[h])).join(","));
  const csv = lines.join("\n") + "\n";

  if (args.out) {
    fs.writeFileSync(args.out, csv);
    console.error(`Wrote ${rows.length} suppression rows to ${args.out}`);
  } else {
    process.stdout.write(csv);
    console.error(`# Exported ${rows.length} suppression rows`);
  }

  // Also write a checksum so we can prove the file wasn't tampered with later
  if (args.out) {
    const { createHash } = await import("node:crypto");
    const hash = createHash("sha256").update(csv).digest("hex");
    fs.writeFileSync(`${args.out}.sha256`, `${hash}  ${args.out}\n`);
    console.error(`SHA-256: ${hash}`);
  }
} finally {
  await pool.end();
}
