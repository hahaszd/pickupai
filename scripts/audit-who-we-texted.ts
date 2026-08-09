/**
 * READ-ONLY. Who did the 560-SMS campaign actually reach?
 *
 *   npx tsx scripts/audit-who-we-texted.ts
 *
 * `docs/channel-evidence.md` concludes the campaign failed on message-and-offer
 * rather than on delivery: *"The messages were delivered — 6 people opted out
 * and 2 replied, so humans read them. They read them and did not tap."*
 *
 * That conclusion assumes the recipients were tradies. The 2026-08-10 audit of
 * the same table found suppliers, wholesalers, associations and closed
 * businesses filed as tradies, and a 57% metadata error rate on the rows we
 * actually read. If a meaningful share of the 560 were never the target
 * audience, the recorded conclusion is not supported by its own evidence.
 *
 * This script asks the narrow, checkable version of that question: of the rows
 * we texted, how many are visibly not a tradie? It cannot tell us how many were
 * closed, mis-traded, or duplicated — that needs the page, and those pages were
 * never fetched for this cohort. So every number here is a FLOOR.
 */
import dotenv from "dotenv";
dotenv.config();

import { openDb } from "../src/db/db.js";

// Same pattern the collector uses, so the two agree by construction.
const NOT_A_TRADIE =
  /(suppl(y|ies|ier|iers)|wholesal|warehouse|distributor)|\b(union|association|institute|federation|council|chamber|academy|college|tafe|trade centre|hardware|bunnings|reece|drywall)\b/i;

const h = (t: string) => console.log(`\n${"─".repeat(70)}\n${t}\n${"─".repeat(70)}`);

async function main() {
  if (!process.env.DATABASE_URL && !process.env.SQLITE_PATH) {
    console.error("Neither DATABASE_URL nor SQLITE_PATH is set.");
    process.exit(2);
  }
  const db = await openDb(process.env.SQLITE_PATH ?? "./data/app.sqlite", process.env.DATABASE_URL);

  // Prefer outreach_log — it records what was actually sent, not a status flag.
  let contacted: any[] = [];
  let via = "outreach_log";
  try {
    contacted = db.all<any>(
      `SELECT DISTINCT p.prospect_id, p.business_name, p.trade_type, p.suburb, p.state, p.source, p.website
         FROM outreach_log o JOIN prospects p ON p.prospect_id = o.prospect_id`
    );
  } catch {
    contacted = [];
  }
  if (!contacted.length) {
    via = "prospects.last_contacted_at";
    contacted = db.all<any>(
      `SELECT prospect_id, business_name, trade_type, suburb, state, source, website
         FROM prospects WHERE last_contacted_at IS NOT NULL`
    );
  }

  h(`Who we texted — ${contacted.length} distinct prospects (via ${via})`);

  const notTradie = contacted.filter((p) => NOT_A_TRADIE.test(p.business_name ?? ""));
  const pct = contacted.length ? ((notTradie.length / contacted.length) * 100).toFixed(1) : "0.0";

  console.log(`  visibly NOT a tradie, by name alone: ${notTradie.length} (${pct}%)`);
  console.log(`\n  This is a FLOOR. It cannot see a supplier with a neutral name, a`);
  console.log(`  business that had already closed, a wrong trade_type, or a duplicate —`);
  console.log(`  all of which the page-read found at high rates in the same table.\n`);
  for (const p of notTradie) {
    console.log(`    ${String(p.business_name).slice(0, 46).padEnd(46)} [${p.trade_type ?? "—"} · ${p.suburb ?? "—"} · ${p.source ?? "—"}]`);
  }

  h("By source — directory rows fail Schedule 2 cl 4(2)(c) as well as being dirtier");
  const bySource: Record<string, number> = {};
  for (const p of contacted) bySource[p.source ?? "—"] = (bySource[p.source ?? "—"] ?? 0) + 1;
  for (const [k, v] of Object.entries(bySource).sort((a, b) => b[1] - a[1])) {
    const share = ((v / contacted.length) * 100).toFixed(1);
    console.log(`  ${String(v).padStart(5)}  ${share.padStart(5)}%  ${k}`);
  }

  h("By trade — the label we targeted on, which the page-read found wrong 3 times in 14");
  const byTrade: Record<string, number> = {};
  for (const p of contacted) byTrade[p.trade_type ?? "—"] = (byTrade[p.trade_type ?? "—"] ?? 0) + 1;
  for (const [k, v] of Object.entries(byTrade).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(v).padStart(5)}  ${k}`);
  }

  console.log(`\nWhat this cannot answer: whether the people who DID read it were tradies.`);
  console.log(`Only the 8 who replied or opted out are known to be human, and we have no`);
  console.log(`record of what they were.\n`);
  process.exit(0);
}

void main();
