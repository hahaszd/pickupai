/**
 * READ-ONLY quality audit of the `prospects` table. Writes nothing.
 *
 *   npx tsx scripts/audit-prospect-quality.ts [--state NSW]
 *
 * The list was assembled without much quality control and has aged. Before any
 * of it is used for outreach, this counts what is actually wrong with it, so
 * the cleanup is aimed at measured defects rather than suspected ones.
 *
 * Every check here is mechanical — a field is malformed, a value is impossible,
 * two rows collide. It deliberately does NOT try to judge whether a business is
 * really a tradie or really trading; that needs the page read, and it belongs in
 * `email-consent-check` stage 2 where the pages are already fetched.
 */
import dotenv from "dotenv";
dotenv.config();

import { openDb } from "../src/db/db.js";

const args = process.argv.slice(2);
const flag = (n: string, d?: string) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? (args[i + 1] ?? d) : d;
};
const STATE = flag("state");

const AU_STATES = ["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"];
const KNOWN_TRADES = ["electrician", "plumber", "roofer", "handyman"];

const h = (t: string) => console.log(`\n${"─".repeat(70)}\n${t}\n${"─".repeat(70)}`);

async function main() {
  if (!process.env.DATABASE_URL && !process.env.SQLITE_PATH) {
    console.error("Neither DATABASE_URL nor SQLITE_PATH is set.");
    process.exit(2);
  }
  const db = await openDb(process.env.SQLITE_PATH ?? "./data/app.sqlite", process.env.DATABASE_URL);
  const where = STATE ? `WHERE state = '${STATE.replace(/'/g, "")}'` : "";

  const total = db.get<any>(`SELECT COUNT(*) AS n FROM prospects ${where}`).n;
  h(`prospects${STATE ? ` (state = ${STATE})` : ""} — ${total} rows`);

  // ── Age ────────────────────────────────────────────────────────────────────
  h("How old is this list?");
  const byMonth = db.all<any>(
    `SELECT substr(created_at, 1, 7) AS month, COUNT(*) AS n, source
       FROM prospects ${where} GROUP BY month, source ORDER BY month DESC, n DESC`
  );
  for (const r of byMonth) console.log(`  ${r.month}  ${String(r.n).padStart(6)}  ${r.source ?? "—"}`);

  // ── Field-level defects ────────────────────────────────────────────────────
  h("Malformed fields — each of these is a row that cannot be trusted as-is");
  const checks: [string, string][] = [
    ["state is not an AU state", `state IS NULL OR state NOT IN (${AU_STATES.map((s) => `'${s}'`).join(",")})`],
    ["trade_type is not a known trade", `trade_type IS NULL OR trade_type NOT IN (${KNOWN_TRADES.map((t) => `'${t}'`).join(",")})`],
    ["business_name empty", `business_name IS NULL OR trim(business_name) = ''`],
    ["business_name has mojibake (UTF-8 read as another codepage)", `business_name LIKE '%鈥%' OR business_name LIKE '%â€%' OR business_name LIKE '%Ã%'`],
    ["website set but not a URL", `website IS NOT NULL AND website != '' AND website NOT LIKE 'http%'`],
    ["website is a CDN / platform, not a business site", `website LIKE '%cdn.%' OR website LIKE '%googleusercontent%' OR website LIKE '%gstatic%'`],
    ["no website AND no phone — unusable by any channel", `(website IS NULL OR website = '') AND (phone IS NULL OR phone = '')`],
    ["suburb empty", `suburb IS NULL OR trim(suburb) = ''`],
    ["phone not in E.164 AU form", `phone IS NOT NULL AND phone != '' AND phone NOT LIKE '+61%'`],
  ];
  for (const [label, cond] of checks) {
    const n = db.get<any>(`SELECT COUNT(*) AS n FROM prospects ${where ? where + " AND" : "WHERE"} (${cond})`).n;
    const pct = total ? ((n / total) * 100).toFixed(1) : "0.0";
    console.log(`  ${String(n).padStart(6)}  ${pct.padStart(5)}%  ${label}`);
  }

  // ── Duplicates ─────────────────────────────────────────────────────────────
  h("Duplicates — the same business reached twice is a compliance problem, not just noise");
  for (const [label, col] of [["same website", "lower(website)"], ["same phone", "phone"], ["same name + suburb", "lower(business_name) || '|' || lower(coalesce(suburb,''))"]] as const) {
    const dupes = db.all<any>(
      `SELECT ${col} AS k, COUNT(*) AS n FROM prospects
        ${where ? where + " AND" : "WHERE"} ${col} IS NOT NULL AND ${col} != ''
        GROUP BY k HAVING COUNT(*) > 1 ORDER BY n DESC LIMIT 5`
    );
    const extra = db.get<any>(
      `SELECT coalesce(SUM(n - 1), 0) AS n FROM (
         SELECT COUNT(*) AS n FROM prospects
          ${where ? where + " AND" : "WHERE"} ${col} IS NOT NULL AND ${col} != ''
          GROUP BY ${col} HAVING COUNT(*) > 1)`
    ).n;
    console.log(`  ${String(extra).padStart(6)} redundant rows by ${label}`);
    for (const d of dupes) console.log(`           ×${d.n}  ${String(d.k).slice(0, 60)}`);
  }

  // ── Not-a-tradie by name ───────────────────────────────────────────────────
  h("Names that are probably not a tradie business — heuristic, needs a human eye");
  const notTradie = db.all<any>(
    `SELECT business_name, trade_type, suburb, state FROM prospects
      ${where ? where + " AND" : "WHERE"} (
        lower(business_name) LIKE '%union%' OR lower(business_name) LIKE '%association%'
        OR lower(business_name) LIKE '%institute%' OR lower(business_name) LIKE '%council%'
        OR lower(business_name) LIKE '%suppl%' OR lower(business_name) LIKE '%wholesal%'
        OR lower(business_name) LIKE '%warehouse%' OR lower(business_name) LIKE '%reece%'
        OR lower(business_name) LIKE '%bunnings%' OR lower(business_name) LIKE '%tafe%'
        OR lower(business_name) LIKE '%academy%' OR lower(business_name) LIKE '%college%')
      ORDER BY business_name LIMIT 40`
  );
  console.log(`  ${notTradie.length} shown (capped at 40)`);
  for (const r of notTradie) console.log(`    ${r.business_name}  [${r.trade_type ?? "—"} · ${r.suburb ?? "—"} · ${r.state ?? "—"}]`);

  // ── Already contacted ──────────────────────────────────────────────────────
  h("Contact history — anyone already messaged carries a consent record we must honour");
  const contacted = db.get<any>(`SELECT COUNT(*) AS n FROM prospects ${where ? where + " AND" : "WHERE"} last_contacted_at IS NOT NULL`).n;
  const unsub = db.get<any>(`SELECT COUNT(*) AS n FROM prospects ${where ? where + " AND" : "WHERE"} unsubscribed_at IS NOT NULL`).n;
  const byStatus = db.all<any>(`SELECT status, COUNT(*) AS n FROM prospects ${where} GROUP BY status ORDER BY n DESC`);
  console.log(`  ${String(contacted).padStart(6)}  previously contacted`);
  console.log(`  ${String(unsub).padStart(6)}  UNSUBSCRIBED — must never be contacted again, on any channel`);
  for (const s of byStatus) console.log(`  ${String(s.n).padStart(6)}  status = ${s.status ?? "—"}`);

  console.log(`\nEverything above is mechanical. Whether a row is a real, currently-trading`);
  console.log(`tradie of the stated trade is a judgement made from the page, in stage 2.\n`);
  process.exit(0);
}

void main();
