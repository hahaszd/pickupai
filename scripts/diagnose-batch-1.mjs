#!/usr/bin/env node
/**
 * Phase 0 diagnostic — read-only analysis of the first SMS batch (97 delivered, 4 STOP, 0 demos).
 *
 * Pulls from outreach_log, prospects, calls, tenants, analytics_events and prints a
 * "what we learned from batch 1" memo to stdout.
 *
 * Usage:
 *   DATABASE_URL=postgresql://... node scripts/diagnose-batch-1.mjs
 *   # Optional: window the analysis (defaults to last 7 days)
 *   DAYS=14 node scripts/diagnose-batch-1.mjs
 */

import initSqlJs from "sql.js";
import pg from "pg";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL env var required");
  process.exit(1);
}

const DAYS = Number(process.env.DAYS ?? 7);
const sinceIso = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000).toISOString();

// Per-message cost in AUD. These are list prices for the AU corridor as of
// May 2026 (Twilio AU long-code A2P, Mobile Message standard rate). Override
// at the CLI when negotiated rates apply.
const TWILIO_COST = Number(process.env.TWILIO_COST ?? 0.10);
const MM_COST = Number(process.env.MM_COST ?? 0.02);

const pool = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

function pct(num, den) {
  if (!den) return "—";
  return `${((num / den) * 100).toFixed(1)}%`;
}

function aud(n) {
  return `$${n.toFixed(2)}`;
}

/**
 * Mirror of detectProviderFromSid in src/sms/mobile-message.ts. Twilio SMS
 * SIDs are SM + 32 hex (MMS uses MM); Mobile Message uses non-conforming
 * IDs. Anything non-empty that doesn't match the Twilio shape is MM.
 * Returns null when no SID was ever stored on the row.
 */
function detectProviderFromSid(sid) {
  if (!sid) return null;
  if (/^SM[a-f0-9]{32}$/i.test(sid)) return "Twilio";
  return "MM";
}

function fmtTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-AU", { timeZone: "Australia/Sydney", hour12: false });
}

function bucketByHour(rows, key = "sent_at") {
  const buckets = new Array(24).fill(0);
  for (const r of rows) {
    if (!r[key]) continue;
    const sydneyHour = new Date(r[key]).toLocaleString("en-AU", {
      timeZone: "Australia/Sydney", hour: "numeric", hour12: false
    });
    const h = parseInt(sydneyHour, 10);
    if (Number.isFinite(h)) buckets[h]++;
  }
  return buckets;
}

function header(s) { console.log(`\n${"=".repeat(72)}\n${s}\n${"=".repeat(72)}`); }
function sub(s) { console.log(`\n--- ${s} ---`); }

try {
  console.log(`# Batch-1 Diagnostic Memo`);
  console.log(`Generated: ${new Date().toISOString()}`);
  console.log(`Window: last ${DAYS} days (since ${sinceIso})`);

  const res = await pool.query("SELECT data FROM sqlite_blob WHERE id = 'main'");
  if (!res.rows.length) {
    console.error("ERROR: no sqlite_blob row found");
    process.exit(2);
  }
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

  // ── 1. Send volume + delivery breakdown ────────────────────────────────
  header("1. SEND VOLUME + DELIVERY");

  const allSms = queryAll(
    `SELECT log_id, prospect_id, status, sent_at, twilio_sid, message
     FROM outreach_log
     WHERE channel = 'sms' AND sent_at >= ?
     ORDER BY sent_at`,
    [sinceIso]
  );

  console.log(`Total SMS rows: ${allSms.length}`);

  const statusCounts = new Map();
  for (const r of allSms) {
    const s = r.status ?? "unknown";
    statusCounts.set(s, (statusCounts.get(s) ?? 0) + 1);
  }
  sub("Status breakdown");
  for (const [s, n] of [...statusCounts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${s.padEnd(20)} ${String(n).padStart(4)}  (${pct(n, allSms.length)})`);
  }

  const delivered = allSms.filter(r => /delivered|sent/i.test(r.status ?? ""));
  const failed = allSms.filter(r => /failed|undelivered|rejected|skipped/i.test(r.status ?? ""));
  console.log(`\nDelivered-or-sent: ${delivered.length} / ${allSms.length} (${pct(delivered.length, allSms.length)})`);
  console.log(`Failed/undelivered: ${failed.length}`);

  if (failed.length) {
    sub("Failed sends (first 10)");
    for (const f of failed.slice(0, 10)) {
      console.log(`  ${fmtTime(f.sent_at)} | ${f.status} | ${f.twilio_sid ?? "no-sid"}`);
    }
  }

  // ── 1B. Provider breakdown + cost estimate ─────────────────────────────
  header("1B. PROVIDER BREAKDOWN (MM vs Twilio)");

  const providerBuckets = new Map(); // provider -> { sent, delivered, failed, cost }
  for (const r of allSms) {
    const p = detectProviderFromSid(r.twilio_sid) ?? "Unknown";
    let b = providerBuckets.get(p);
    if (!b) { b = { sent: 0, delivered: 0, failed: 0 }; providerBuckets.set(p, b); }
    b.sent++;
    if (/delivered|sent/i.test(r.status ?? "")) b.delivered++;
    if (/failed|undelivered|rejected|skipped/i.test(r.status ?? "")) b.failed++;
  }

  const costPerProvider = { Twilio: TWILIO_COST, MM: MM_COST, Unknown: 0 };
  let totalCost = 0;
  const costNotes = [];
  for (const [name, b] of providerBuckets) {
    const rate = costPerProvider[name] ?? 0;
    const c = b.delivered * rate;
    totalCost += c;
    if (rate > 0) costNotes.push(`${b.delivered} ${name} @ ${aud(rate)} = ${aud(c)}`);
    else costNotes.push(`${b.delivered} ${name} (no rate — excluded)`);
    console.log(`  ${name.padEnd(8)} sent=${String(b.sent).padStart(4)}  delivered=${String(b.delivered).padStart(4)}  failed=${String(b.failed).padStart(4)}  rate=${pct(b.delivered, b.sent)}  cost-basis=${aud(rate)}/msg`);
  }
  if (providerBuckets.size === 0) {
    console.log(`  (no SMS rows in window)`);
  } else {
    console.log(`\n  Estimated total cost (delivered only): ${aud(totalCost)}`);
    console.log(`    breakdown: ${costNotes.join(" + ")}`);
  }

  // ── 2. Send timing pattern ─────────────────────────────────────────────
  header("2. SEND TIMING (Sydney time)");
  const sendBuckets = bucketByHour(allSms);
  const maxSends = Math.max(1, ...sendBuckets);
  for (let h = 0; h < 24; h++) {
    if (!sendBuckets[h]) continue;
    const bar = "#".repeat(Math.round(sendBuckets[h] / maxSends * 30));
    console.log(`  ${String(h).padStart(2, "0")}:00  ${String(sendBuckets[h]).padStart(3)}  ${bar}`);
  }

  // ── 3. STOP / unsubscribe analysis ─────────────────────────────────────
  header("3. STOP / UNSUBSCRIBE PATTERN");

  const replies = queryAll(
    `SELECT o.log_id, o.prospect_id, o.status, o.sent_at, o.message,
            p.business_name, p.phone, p.suburb, p.trade_type, p.source
     FROM outreach_log o
     LEFT JOIN prospects p ON o.prospect_id = p.prospect_id
     WHERE o.channel = 'sms_reply' AND o.sent_at >= ?
     ORDER BY o.sent_at`,
    [sinceIso]
  );

  console.log(`Inbound SMS replies captured: ${replies.length}`);
  const optOuts = replies.filter(r => r.status === "opt_out");
  const positiveReplies = replies.filter(r => r.status === "received");
  const optIns = replies.filter(r => r.status === "opt_in");

  console.log(`  STOP / opt-out:    ${optOuts.length}  (${pct(optOuts.length, delivered.length)} of delivered)`);
  console.log(`  positive replies:  ${positiveReplies.length}`);
  console.log(`  opt-back-in:       ${optIns.length}`);

  if (optOuts.length) {
    sub("STOP replies (full detail)");
    for (const r of optOuts) {
      const sentAt = fmtTime(r.sent_at);
      console.log(`  ${sentAt}`);
      console.log(`    business: ${r.business_name ?? "(unknown)"}  phone: ${r.phone ?? "?"}`);
      console.log(`    suburb:   ${r.suburb ?? "?"}  trade: ${r.trade_type ?? "?"}  source: ${r.source ?? "?"}`);
      console.log(`    body:     "${(r.message ?? "").slice(0, 80)}"`);
    }

    sub("STOP-rate by source list");
    const sourceTotals = new Map();
    const sourceStops = new Map();
    for (const d of delivered) {
      const p = queryAll("SELECT source FROM prospects WHERE prospect_id = ?", [d.prospect_id])[0];
      const src = p?.source ?? "unknown";
      sourceTotals.set(src, (sourceTotals.get(src) ?? 0) + 1);
    }
    for (const r of optOuts) {
      const src = r.source ?? "unknown";
      sourceStops.set(src, (sourceStops.get(src) ?? 0) + 1);
    }
    for (const [src, total] of sourceTotals) {
      const stops = sourceStops.get(src) ?? 0;
      console.log(`  ${src.padEnd(20)} ${stops}/${total}  (${pct(stops, total)})`);
    }

    sub("STOP-rate by suburb (top 5)");
    const suburbTotals = new Map();
    const suburbStops = new Map();
    for (const d of delivered) {
      const p = queryAll("SELECT suburb FROM prospects WHERE prospect_id = ?", [d.prospect_id])[0];
      const sub = p?.suburb ?? "unknown";
      suburbTotals.set(sub, (suburbTotals.get(sub) ?? 0) + 1);
    }
    for (const r of optOuts) {
      const sub = r.suburb ?? "unknown";
      suburbStops.set(sub, (suburbStops.get(sub) ?? 0) + 1);
    }
    const ranked = [...suburbTotals.entries()]
      .map(([s, t]) => ({ suburb: s, total: t, stops: suburbStops.get(s) ?? 0 }))
      .filter(x => x.stops > 0 || x.total >= 5)
      .sort((a, b) => b.stops - a.stops || b.total - a.total)
      .slice(0, 5);
    for (const x of ranked) {
      console.log(`  ${x.suburb.padEnd(22)} ${x.stops}/${x.total}  (${pct(x.stops, x.total)})`);
    }
  }

  // ── 4. Demo-call attribution ───────────────────────────────────────────
  header("4. DEMO-CALL ATTRIBUTION");

  const smsProspects = [...new Set(allSms.map(r => r.prospect_id))];
  let calledFromBatch = 0;
  const calls = [];
  for (const pid of smsProspects) {
    const p = queryAll("SELECT phone, business_name FROM prospects WHERE prospect_id = ?", [pid])[0];
    if (!p?.phone) continue;
    const c = queryAll(
      `SELECT call_id, from_number, to_number, started_at, status, is_demo
       FROM calls
       WHERE from_number = ? AND started_at >= ?
       ORDER BY started_at DESC LIMIT 5`,
      [p.phone, sinceIso]
    );
    if (c.length) {
      calledFromBatch++;
      for (const call of c) {
        calls.push({ business: p.business_name, ...call });
      }
    }
  }

  console.log(`SMS recipients who called the demo line: ${calledFromBatch} / ${smsProspects.length}  (${pct(calledFromBatch, smsProspects.length)})`);
  if (calls.length) {
    sub("Calls from SMS recipients");
    for (const c of calls.slice(0, 20)) {
      console.log(`  ${fmtTime(c.started_at)} | ${c.business} | from=${c.from_number} | demo=${c.is_demo} | status=${c.status}`);
    }
  } else {
    console.log("  (no calls from SMS-batch numbers)");
  }

  // ── 5. Signups ─────────────────────────────────────────────────────────
  header("5. SIGNUPS FROM BATCH");
  let signedUp = 0;
  const signups = [];
  for (const pid of smsProspects) {
    const p = queryAll("SELECT phone, business_name FROM prospects WHERE prospect_id = ?", [pid])[0];
    if (!p?.phone) continue;
    const t = queryAll(
      "SELECT tenant_id, name, owner_phone, payment_status, created_at FROM tenants WHERE owner_phone = ? AND created_at >= ? LIMIT 1",
      [p.phone, sinceIso]
    )[0];
    if (t) {
      signedUp++;
      signups.push({ business: p.business_name, ...t });
    }
  }
  console.log(`SMS recipients who signed up: ${signedUp} / ${smsProspects.length}  (${pct(signedUp, smsProspects.length)})`);
  for (const s of signups) {
    console.log(`  ${fmtTime(s.created_at)} | ${s.business} -> tenant ${s.name} (${s.payment_status})`);
  }

  // ── 6. Funnel summary ──────────────────────────────────────────────────
  header("6. FUNNEL SUMMARY");
  console.log(`  Sent:        ${allSms.length}`);
  console.log(`  Delivered:   ${delivered.length}    (${pct(delivered.length, allSms.length)} of sent)`);
  console.log(`  Failed:      ${failed.length}`);
  console.log(`  STOP:        ${optOuts.length}      (${pct(optOuts.length, delivered.length)} of delivered)  — kill threshold: 2%`);
  console.log(`  Replies:     ${positiveReplies.length}`);
  console.log(`  Demo calls:  ${calledFromBatch}`);
  console.log(`  Signups:     ${signedUp}`);
  console.log(`  Cost (est):  ${aud(totalCost)}  (${costNotes.join(" + ") || "no provider data"})`);
  console.log(`  $$/signup:   ${signedUp ? aud(totalCost / signedUp) : "—"}`);

  // ── 7. Verdict ─────────────────────────────────────────────────────────
  header("7. AUTOMATED VERDICT");

  const stopRate = delivered.length ? optOuts.length / delivered.length : 0;
  const replyRate = delivered.length ? positiveReplies.length / delivered.length : 0;
  const callRate = smsProspects.length ? calledFromBatch / smsProspects.length : 0;

  const verdicts = [];
  if (stopRate > 0.05) verdicts.push("CRITICAL: STOP rate >5% — pause sends, message is harmful to brand and ACMA-risk.");
  else if (stopRate > 0.02) verdicts.push("WARN: STOP rate >2% — message needs rework before scaling.");
  else verdicts.push("OK: STOP rate within healthy range (<2%).");

  if (callRate < 0.005 && smsProspects.length >= 50) verdicts.push("WARN: <0.5% demo-call rate — CTA + offer not landing.");
  if (replyRate < 0.005 && smsProspects.length >= 50) verdicts.push("WARN: <0.5% reply rate — message doesn't invite engagement.");
  if (signedUp === 0 && smsProspects.length >= 50) verdicts.push("WARN: 0 signups from batch — full funnel untested.");

  // Note when the batch was a Twilio/MM mix — projected cost from the plan
  // was MM-only ($0.02/msg); a high Twilio share means real spend was
  // materially higher than the planning baseline.
  const twilioBucket = providerBuckets.get("Twilio");
  const mmBucket = providerBuckets.get("MM");
  const twilioSent = twilioBucket?.sent ?? 0;
  const mmSent = mmBucket?.sent ?? 0;
  const totalProviderSent = twilioSent + mmSent;
  if (totalProviderSent > 0) {
    const tPct = twilioSent / totalProviderSent;
    if (tPct > 0.5) {
      verdicts.push(`NOTE: batch was ${(tPct * 100).toFixed(0)}% Twilio / ${((1 - tPct) * 100).toFixed(0)}% MM — projected cost basis was MM-only, real spend ~${(TWILIO_COST / MM_COST).toFixed(0)}× higher per Twilio msg.`);
    } else if (tPct > 0.05) {
      verdicts.push(`NOTE: batch was ${(tPct * 100).toFixed(0)}% Twilio / ${((1 - tPct) * 100).toFixed(0)}% MM — partial Twilio fallback, mixed cost basis.`);
    }
  }

  for (const v of verdicts) console.log(`  - ${v}`);

  console.log(`\n# end of memo\n`);
} finally {
  await pool.end();
}
