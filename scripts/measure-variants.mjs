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

// Cost per delivered message (AUD). Override at CLI when negotiated rates apply.
const TWILIO_COST = Number(process.env.TWILIO_COST ?? 0.10);
const MM_COST = Number(process.env.MM_COST ?? 0.02);

function pct(num, den, places = 1) {
  if (!den) return "—";
  return `${((num / den) * 100).toFixed(places)}%`;
}

function pad(s, n) { return String(s).padEnd(n); }
function rpad(s, n) { return String(s).padStart(n); }

function aud(n) { return `$${n.toFixed(2)}`; }

/**
 * Mirror of detectProviderFromSid in src/sms/mobile-message.ts. Twilio SMS
 * SIDs are SM + 32 hex; Mobile Message uses non-conforming IDs. Anything
 * non-empty that doesn't match the Twilio shape is MM. null = no SID
 * stored (treated as Unknown for cost purposes — usually means a skipped
 * or pre-routing send).
 */
function detectProviderFromSid(sid) {
  if (!sid) return null;
  if (/^SM[a-f0-9]{32}$/i.test(sid)) return "Twilio";
  return "MM";
}

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

  // Pull all tagged sms sends (variant IS NOT NULL) in window. twilio_sid
  // is needed for provider detection so per-variant cost is accurate when
  // a batch falls back from MM to Twilio mid-run (e.g. MM rate-limit).
  const sends = queryAll(
    `SELECT log_id, prospect_id, variant, status, link_clicked_at, replied_at, reply_body, sent_at, twilio_sid
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

  // Bucket sends by variant. Provider counts only include successfully
  // delivered messages (so cost reflects what we actually paid for, not
  // failed attempts which most providers don't bill).
  const buckets = new Map();
  for (const s of sends) {
    if (variantFilter.length && !variantFilter.includes(s.variant)) continue;
    let b = buckets.get(s.variant);
    if (!b) {
      b = {
        variant: s.variant,
        sent: 0, delivered: 0, failed: 0,
        clicked: 0, replied: 0, opt_out: 0,
        called_demo: 0, signed_up: 0,
        mm_delivered: 0, twilio_delivered: 0, unknown_delivered: 0
      };
      buckets.set(s.variant, b);
    }
    b.sent++;
    const isDelivered = /^delivered$|^sent$/i.test(s.status ?? "");
    if (isDelivered) {
      b.delivered++;
      const provider = detectProviderFromSid(s.twilio_sid);
      if (provider === "MM") b.mm_delivered++;
      else if (provider === "Twilio") b.twilio_delivered++;
      else b.unknown_delivered++;
    }
    if (/failed|undelivered|rejected|skipped/i.test(s.status ?? "")) b.failed++;
    if (s.link_clicked_at) b.clicked++;
    if (s.replied_at) b.replied++;
    if (optOuts.has(s.prospect_id)) b.opt_out++;
    const phone = phoneByProspect.get(s.prospect_id);
    if (phone && calledPhones.has(phone)) b.called_demo++;
    if (phone && signedUpPhones.has(phone)) b.signed_up++;
  }

  // Add cost field to each bucket once delivery counts are final.
  for (const b of buckets.values()) {
    b.cost = b.mm_delivered * MM_COST + b.twilio_delivered * TWILIO_COST;
  }

  if (buckets.size === 0) {
    console.log("\nNo matching variants found in window.");
    process.exit(0);
  }

  // ── Print table ────────────────────────────────────────────────────────
  // MM and TW columns count delivered messages by provider (so a 50/50
  // mix tells you the variant ran half on MM, half on Twilio fallback).
  // COST applies the per-provider rates above to delivered counts only.
  const tableWidth = 126;
  console.log(`\n${"=".repeat(tableWidth)}`);
  console.log(
    pad("VARIANT", 22) +
    rpad("SENT", 6) +
    rpad("DELIV", 7) +
    rpad("FAIL", 6) +
    rpad("MM", 5) +
    rpad("TW", 5) +
    rpad("COST", 8) +
    rpad("CLICK", 7) +
    rpad("CLK%", 7) +
    rpad("REPLY", 7) +
    rpad("RPL%", 7) +
    rpad("STOP", 6) +
    rpad("STOP%", 7) +
    rpad("CALLS", 7) +
    rpad("SIGN", 6)
  );
  console.log("=".repeat(tableWidth));

  const rows = [...buckets.values()].sort((a, b) => b.sent - a.sent);
  let abortTriggered = false;
  let totalCost = 0;
  for (const r of rows) {
    const stopRate = r.delivered ? r.opt_out / r.delivered : 0;
    const flag = stopRate > ABORT_STOP_RATE ? " ✗ABORT" : stopRate > KILL_STOP_RATE ? " ✗kill" : "";
    if (stopRate > ABORT_STOP_RATE) abortTriggered = true;
    totalCost += r.cost;
    console.log(
      pad(r.variant, 22) +
      rpad(r.sent, 6) +
      rpad(r.delivered, 7) +
      rpad(r.failed, 6) +
      rpad(r.mm_delivered, 5) +
      rpad(r.twilio_delivered, 5) +
      rpad(aud(r.cost), 8) +
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
  console.log("=".repeat(tableWidth));
  console.log(`Total cost across all variants (delivered only): ${aud(totalCost)}  @ MM=${aud(MM_COST)}/msg, Twilio=${aud(TWILIO_COST)}/msg`);

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

  // Cost-per-engagement is the most useful single number for "should I
  // scale this?" — it normalises away batch size, provider mix, and
  // signal quality in one ratio.
  const costPerEng = winner.engagement ? winner.cost / winner.engagement : Infinity;
  const costPerSignup = winner.signed_up ? winner.cost / winner.signed_up : null;
  const providerNote = winner.twilio_delivered > 0 && winner.mm_delivered > 0
    ? `(mixed: ${winner.mm_delivered} MM + ${winner.twilio_delivered} Twilio)`
    : winner.twilio_delivered > 0 ? `(all Twilio fallback)`
    : winner.mm_delivered > 0 ? `(all MM)`
    : `(no delivered sends)`;

  if (winner.engRate < MIN_ENGAGEMENT_RATE) {
    console.log(`WEAK WINNER: best variant is ${winner.variant} with only ${pct(winner.engagement, winner.delivered)} engagement.`);
    console.log(`             Below the 1% bar. Iterate copy or expand sample size before scaling.`);
    console.log(`             Spend on this variant: ${aud(winner.cost)} ${providerNote}`);
  } else {
    console.log(`WINNER: ${winner.variant}`);
    console.log(`        Engagement rate: ${pct(winner.engagement, winner.delivered)} (${winner.engagement} / ${winner.delivered} delivered)`);
    console.log(`        STOP rate:       ${pct(winner.opt_out, winner.delivered)} — under 2% threshold`);
    console.log(`        Demo calls:      ${winner.called_demo}`);
    console.log(`        Signups:         ${winner.signed_up}`);
    console.log(`        Cost:            ${aud(winner.cost)} ${providerNote}`);
    console.log(`        Cost / engagement: ${aud(costPerEng)}${costPerSignup !== null ? `   |   Cost / signup: ${aud(costPerSignup)}` : ""}`);
    console.log(``);
    console.log(`Next: Phase 5 — send ${Math.min(winner.sent * 16, 800)} more of "${winner.variant}" to fresh prospects.`);
    console.log(`      Phone-call follow-up to anyone who clicked or replied but didn't book.`);
  }

  // ── Funnel drop-off (post-click attribution) ───────────────────────────
  //
  // Reads from the PG-native `funnel_events` table written by
  // /api/funnel/event. This table bypasses the sql.js blob so concurrent
  // writes from multiple Railway instances all survive (the blob path
  // overwrites instance-by-instance and silently drops events).
  //
  // Per-variant per-event distinct-prospect counts mean reloads / double-
  // taps don't double-count. Step-to-step drop-offs are the actionable
  // signal; non-monotonic counts (e.g. signup_view > signup_cta_tap) can
  // happen when users bookmark or hit /dashboard/signup directly.
  const FUNNEL_STEPS = [
    { key: "delivered",          label: "Delivered" },
    { key: "clicked",            label: "Clicked SMS link" },
    { key: "demo_view",          label: "Demo page rendered" },
    { key: "audio_play",         label: "Audio sample played" },
    { key: "demo_call_tap",      label: "Tap-to-call demo" },
    { key: "signup_cta_tap",     label: "Tapped 'Start free trial'" },
    { key: "signup_view",        label: "Signup form viewed" },
    { key: "signup_form_submit", label: "Signup form submitted" },
    { key: "signed_up",          label: "Tenant created" }
  ];

  let funnelRows = [];
  try {
    const pgRes = await pool.query(
      `SELECT prospect_id, event, variant, occurred_at FROM funnel_events
       WHERE occurred_at >= $1`,
      [sinceIso]
    );
    funnelRows = pgRes.rows;
  } catch (err) {
    // Table may not exist on environments that haven't deployed the funnel
    // ingest endpoint yet. Fall back to the old outreach_log path so the
    // verdict still prints.
    if (err && /relation .*funnel_events.* does not exist/i.test(err.message ?? "")) {
      const legacyRows = queryAll(
        `SELECT prospect_id, channel, variant, sent_at FROM outreach_log
         WHERE channel LIKE 'funnel_%' AND sent_at >= ?`,
        [sinceIso]
      );
      funnelRows = legacyRows.map(r => ({
        prospect_id: r.prospect_id,
        event: r.channel.replace(/^funnel_/, ""),
        variant: r.variant,
        occurred_at: r.sent_at
      }));
    } else {
      throw err;
    }
  }

  const funnelByVariant = new Map();
  for (const r of funnelRows) {
    if (variantFilter.length && r.variant && !variantFilter.includes(r.variant)) continue;
    const v = r.variant ?? "(unknown)";
    let bucket = funnelByVariant.get(v);
    if (!bucket) { bucket = new Map(); funnelByVariant.set(v, bucket); }
    if (!bucket.has(r.event)) bucket.set(r.event, new Set());
    bucket.get(r.event).add(r.prospect_id);
  }

  if (funnelByVariant.size > 0 || rows.some(r => r.clicked > 0)) {
    console.log(`\n# FUNNEL DROP-OFF (per-variant)\n`);
    const labelW = 32;
    for (const r of rows) {
      const fb = funnelByVariant.get(r.variant);
      const counts = {
        delivered:          r.delivered,
        clicked:            r.clicked,
        demo_view:          fb?.get("demo_view")?.size ?? 0,
        audio_play:         fb?.get("audio_play")?.size ?? 0,
        demo_call_tap:      fb?.get("demo_call_tap")?.size ?? 0,
        signup_cta_tap:     fb?.get("signup_cta_tap")?.size ?? 0,
        signup_view:        fb?.get("signup_view")?.size ?? 0,
        signup_form_submit: fb?.get("signup_form_submit")?.size ?? 0,
        signed_up:          r.signed_up
      };
      console.log(`  [${r.variant}]`);
      let prev = null;
      for (const step of FUNNEL_STEPS) {
        const n = counts[step.key];
        const dropPct = prev !== null && prev > 0 ? (((prev - n) / prev) * 100).toFixed(0) + "% drop" : "";
        const ofDelivered = counts.delivered > 0 ? pct(n, counts.delivered) : "—";
        console.log(`    ${pad(step.label, labelW)} ${rpad(n, 4)}   ${rpad(ofDelivered, 7)}   ${dropPct}`);
        prev = n;
      }
      console.log("");
    }

    const noFunnelData = !funnelRows.length;
    if (noFunnelData) {
      console.log(`  (No funnel_* events recorded yet. After deploying instrumentation, the next batch will populate these rows.)`);
    }
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
