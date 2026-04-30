#!/usr/bin/env node
/**
 * Phase 5 — phone-call follow-up list.
 *
 * Identifies prospects from the A/B test who *engaged* (clicked the link
 * and/or replied) but didn't book a demo or sign up. These are the highest-
 * intent prospects in the funnel — calling them within 24hr of engagement
 * is the single most leveraged action in the whole campaign.
 *
 * Read-only. Outputs a CSV to stdout (or to --out <file>) with:
 *   business_name, phone (E.164 + display), suburb, variant, signal,
 *   sent_at, click_at, reply_at, reply_body
 *
 * Usage:
 *   DATABASE_URL=postgresql://... node scripts/build-followup-list.mjs
 *   DATABASE_URL=... node scripts/build-followup-list.mjs --variant A_reply_yes --out followups.csv
 *   DATABASE_URL=... node scripts/build-followup-list.mjs --days 14 --include-called
 */

import fs from "node:fs";
import initSqlJs from "sql.js";
import pg from "pg";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error("ERROR: DATABASE_URL env var required"); process.exit(1); }

function parseArgs(argv) {
  const out = { days: 14 };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--include-called") { out.includeCalled = true; continue; }
    if (a === "--include-signed-up") { out.includeSignedUp = true; continue; }
    if (a.startsWith("--")) {
      const key = a.slice(2).replace(/-([a-z])/g, (_m, c) => c.toUpperCase());
      const val = argv[i + 1];
      if (val === undefined || val.startsWith("--")) { console.error(`ERROR: --${a.slice(2)} requires a value`); process.exit(1); }
      out[key] = val;
      i++;
    }
  }
  return out;
}

const args = parseArgs(process.argv);
const days = Number(args.days);
const sinceIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
const variantFilter = args.variant;

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

  const queryAll = (sql, params = []) => {
    const stmt = db.prepare(sql);
    if (params.length) stmt.bind(params);
    const out = [];
    while (stmt.step()) out.push(stmt.getAsObject());
    stmt.free();
    return out;
  };

  // Engaged = clicked link OR replied (not opt_out)
  const engaged = queryAll(
    `SELECT o.log_id, o.prospect_id, o.variant, o.sent_at, o.link_clicked_at, o.replied_at, o.reply_body,
            p.business_name, p.phone, p.suburb, p.unsubscribed_at, p.status
     FROM outreach_log o
     JOIN prospects p ON p.prospect_id = o.prospect_id
     WHERE o.channel = 'sms'
       AND o.sent_at >= ?
       AND (o.link_clicked_at IS NOT NULL OR o.replied_at IS NOT NULL)
       AND (? = '' OR o.variant = ?)
       AND p.unsubscribed_at IS NULL`,
    [sinceIso, variantFilter ?? "", variantFilter ?? ""]
  );

  // Filter out those who already called the demo / signed up (unless --include-* set)
  const phones = [...new Set(engaged.map(r => r.phone).filter(Boolean))];
  const calledPhones = new Set();
  const signedUpPhones = new Set();
  if (phones.length) {
    const placeholders = phones.map(() => "?").join(",");
    for (const r of queryAll(
      `SELECT DISTINCT from_number FROM calls WHERE from_number IN (${placeholders}) AND started_at >= ?`,
      [...phones, sinceIso]
    )) calledPhones.add(r.from_number);
    for (const r of queryAll(
      `SELECT DISTINCT owner_phone FROM tenants WHERE owner_phone IN (${placeholders}) AND created_at >= ?`,
      [...phones, sinceIso]
    )) signedUpPhones.add(r.owner_phone);
  }

  const rows = engaged
    .filter(r => args.includeCalled || !calledPhones.has(r.phone))
    .filter(r => args.includeSignedUp || !signedUpPhones.has(r.phone))
    .map(r => {
      const signals = [];
      if (r.link_clicked_at) signals.push("clicked");
      if (r.replied_at) signals.push("replied");
      return {
        business_name: r.business_name,
        phone: r.phone,
        suburb: r.suburb ?? "",
        variant: r.variant ?? "",
        signal: signals.join("+"),
        sent_at: r.sent_at,
        click_at: r.link_clicked_at ?? "",
        reply_at: r.replied_at ?? "",
        reply_body: (r.reply_body ?? "").slice(0, 200),
        status: r.status
      };
    })
    // Sort: replied first, then clicked, then by recency
    .sort((a, b) => {
      const aRep = a.signal.includes("replied") ? 1 : 0;
      const bRep = b.signal.includes("replied") ? 1 : 0;
      if (aRep !== bRep) return bRep - aRep;
      const aT = a.reply_at || a.click_at || a.sent_at;
      const bT = b.reply_at || b.click_at || b.sent_at;
      return bT.localeCompare(aT);
    });

  const header = ["business_name", "phone", "suburb", "variant", "signal", "sent_at", "click_at", "reply_at", "reply_body", "status"];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(header.map(h => csvEsc(r[h])).join(","));
  }
  const csv = lines.join("\n") + "\n";

  if (args.out) {
    fs.writeFileSync(args.out, csv);
    console.error(`Wrote ${rows.length} rows to ${args.out}`);
    console.error(`Replied: ${rows.filter(r => r.signal.includes("replied")).length}`);
    console.error(`Clicked: ${rows.filter(r => r.signal.includes("clicked")).length}`);
  } else {
    process.stdout.write(csv);
    console.error(`# ${rows.length} rows`);
  }
} finally {
  await pool.end();
}
