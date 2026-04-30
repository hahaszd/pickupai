#!/usr/bin/env node
/**
 * Phase 4 — measurement script. Reads outreach_log + prospects + calls +
 * tenants and prints a per-variant funnel + an automated winner verdict.
 *
 * Read-only.
 *
 * Usage:
 *   DATABASE_URL=postgresql://... node scripts/measure-variants.mjs
 *   DAYS=7 node scripts/measure-variants.mjs
 *   VARIANTS=A_reply_yes,B_call_demo,C_social_proof,D_trial node scripts/measure-variants.mjs
 *
 * Decision rules baked in (matches the plan):
 *   - kill any variant with STOP rate > 2%
 *   - hard abort entire test if any variant > 5%
 *   - winner = highest combined-engagement (clicks + replies + demo-calls) AND STOP < 2%
 *   - if no variant clears the bar -> "iterate Phase 2"
 */

import initSqlJs from "sql.js";
import pg from "pg";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) { console.error("ERROR: DATABASE_URL env var required"); process.exit(1); }

const DAYS = Number(process.env.DAYS ?? 7);
const sinceIso = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000).toISOString();
const variantFilter = (process.env.VARIANTS ?? "").split(",").map(s => s.trim()).filter(Boolean);

const KILL_STOP_RATE = 0.02;       // 2%
const ABORT_STOP_RATE = 0.05;      // 5%
const MIN_ENGAGEMENT_RATE = 0.01;  // 1% combined engagement to be considered a winner

function pct(num, den, places = 1) {
  if (!den) return "—";
  return `${((num / den) * 100).toFixed(places)}%`;
}

function pad(s, n) { return String(s).padEnd(n); }
function rpad(s, n) { return String(s).padStart(n); }

const pool = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

try {
  console.log(`# A/B Variant Measurement`);
  console.log(`Generated: ${new Date().toISOString()}`);
  console.log(`Window:    last ${DAYS} days (since ${sinceIso})`);
  if (variantFilter.length) console.log(`Variants:  ${variantFilter.join(", ")}`);

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

  // Pull all tagged sms sends (variant IS NOT NULL) in window
  const sends = queryAll(
    `SELECT log_id, prospect_id, variant, status, link_clicked_at, replied_at, reply_body, sent_at
     FROM outreach_log
     WHERE channel = 'sms' AND sent_at >= ? AND variant IS NOT NULL`,
    [sinceIso]
  );

  if (sends.length === 0) {
    console.log("\nNo variant-tagged SMS sends in window. Run scripts/send-sms-batch.mjs first.");
    process.exit(0);
  }

  // Pull opt_outs in window
  const optOuts = new Map();
  for (const r of queryAll(
    `SELECT prospect_id, MIN(sent_at) as opt_at FROM outreach_log
     WHERE channel = 'sms_reply' AND status = 'opt_out' AND sent_at >= ?
     GROUP BY prospect_id`,
    [sinceIso]
  )) {
    optOuts.set(r.prospect_id, r.opt_at);
  }

  // Pull prospect phones for call + signup attribution
  const prospectIds = [...new Set(sends.map(s => s.prospect_id))];
  const phoneByProspect = new Map();
  if (prospectIds.length) {
    const placeholders = prospectIds.map(() => "?").join(",");
    for (const r of queryAll(
      `SELECT prospect_id, phone FROM prospects WHERE prospect_id IN (${placeholders})`,
      prospectIds
    )) {
      phoneByProspect.set(r.prospect_id, r.phone);
    }
  }

  const phones = [...new Set([...phoneByProspect.values()].filter(Boolean))];
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

  // Bucket sends by variant
  const buckets = new Map();
  for (const s of sends) {
    if (variantFilter.length && !variantFilter.includes(s.variant)) continue;
    let b = buckets.get(s.variant);
    if (!b) {
      b = {
        variant: s.variant,
        sent: 0, delivered: 0, failed: 0,
        clicked: 0, replied: 0, opt_out: 0,
        called_demo: 0, signed_up: 0
      };
      buckets.set(s.variant, b);
    }
    b.sent++;
    if (/^delivered$|^sent$/i.test(s.status ?? "")) b.delivered++;
    if (/failed|undelivered|rejected|skipped/i.test(s.status ?? "")) b.failed++;
    if (s.link_clicked_at) b.clicked++;
    if (s.replied_at) b.replied++;
    if (optOuts.has(s.prospect_id)) b.opt_out++;
    const phone = phoneByProspect.get(s.prospect_id);
    if (phone && calledPhones.has(phone)) b.called_demo++;
    if (phone && signedUpPhones.has(phone)) b.signed_up++;
  }

  if (buckets.size === 0) {
    console.log("\nNo matching variants found in window.");
    process.exit(0);
  }

  // ── Print table ────────────────────────────────────────────────────────
  console.log(`\n${"=".repeat(108)}`);
  console.log(`${pad("VARIANT", 22)}${rpad("SENT", 6)}${rpad("DELIV", 7)}${rpad("FAIL", 6)}${rpad("CLICK", 7)}${rpad("CLK%", 7)}${rpad("REPLY", 7)}${rpad("RPL%", 7)}${rpad("STOP", 6)}${rpad("STOP%", 7)}${rpad("CALLS", 7)}${rpad("SIGN", 6)}`);
  console.log("=".repeat(108));

  const rows = [...buckets.values()].sort((a, b) => b.sent - a.sent);
  let abortTriggered = false;
  for (const r of rows) {
    const stopRate = r.delivered ? r.opt_out / r.delivered : 0;
    const flag = stopRate > ABORT_STOP_RATE ? " ✗ABORT" : stopRate > KILL_STOP_RATE ? " ✗kill" : "";
    if (stopRate > ABORT_STOP_RATE) abortTriggered = true;
    console.log(
      pad(r.variant, 22) +
      rpad(r.sent, 6) +
      rpad(r.delivered, 7) +
      rpad(r.failed, 6) +
      rpad(r.clicked, 7) +
      rpad(pct(r.clicked, r.delivered), 7) +
      rpad(r.replied, 7) +
      rpad(pct(r.replied, r.delivered), 7) +
      rpad(r.opt_out, 6) +
      rpad(pct(r.opt_out, r.delivered), 7) +
      rpad(r.called_demo, 7) +
      rpad(r.signed_up, 6) +
      flag
    );
  }
  console.log("=".repeat(108));

  // ── Verdict ─────────────────────────────────────────────────────────────
  console.log("\n# VERDICT\n");

  if (abortTriggered) {
    console.log("ABORT: at least one variant exceeded 5% STOP rate. Pause the entire test,");
    console.log("       investigate the message angle, and do not scale anything until STOP rate");
    console.log("       is back under 2% on a fresh batch.");
    process.exit(0);
  }

  const eligible = rows.filter(r => {
    const stopRate = r.delivered ? r.opt_out / r.delivered : 0;
    return stopRate <= KILL_STOP_RATE;
  });

  if (eligible.length === 0) {
    console.log("NO WINNER: every variant exceeded 2% STOP rate. The message angle is wrong.");
    console.log("           Iterate Phase 2 with new copy (different pain hook / sender persona /");
    console.log("           offer) before sending again.");
    process.exit(0);
  }

  // Score = clicks + replies + demo-calls (sum, not weighted — keep it readable)
  const scored = eligible.map(r => {
    const engagement = r.clicked + r.replied + r.called_demo;
    const engRate = r.delivered ? engagement / r.delivered : 0;
    return { ...r, engagement, engRate };
  }).sort((a, b) => b.engRate - a.engRate);

  const winner = scored[0];

  if (winner.engRate < MIN_ENGAGEMENT_RATE) {
    console.log(`WEAK WINNER: best variant is ${winner.variant} with only ${pct(winner.engagement, winner.delivered)} engagement.`);
    console.log(`             Below the 1% bar. Iterate copy or expand sample size before scaling.`);
  } else {
    console.log(`WINNER: ${winner.variant}`);
    console.log(`        Engagement rate: ${pct(winner.engagement, winner.delivered)} (${winner.engagement} / ${winner.delivered} delivered)`);
    console.log(`        STOP rate:       ${pct(winner.opt_out, winner.delivered)} — under 2% threshold`);
    console.log(`        Demo calls:      ${winner.called_demo}`);
    console.log(`        Signups:         ${winner.signed_up}`);
    console.log(``);
    console.log(`Next: Phase 5 — send ${Math.min(winner.sent * 16, 800)} more of "${winner.variant}" to fresh prospects.`);
    console.log(`      Phone-call follow-up to anyone who clicked or replied but didn't book.`);
  }

  // ── Reply samples (qualitative signal) ─────────────────────────────────
  const positiveReplies = sends.filter(s => s.replied_at && s.reply_body);
  if (positiveReplies.length > 0) {
    console.log(`\n# REPLY BODIES (${positiveReplies.length}, qualitative review):\n`);
    for (const r of positiveReplies.slice(0, 20)) {
      console.log(`  [${r.variant}] "${(r.reply_body ?? "").slice(0, 100)}"`);
    }
  }
} finally {
  await pool.end();
}
