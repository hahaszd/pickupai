#!/usr/bin/env node
/**
 * End-to-end STOP / unsubscribe test.
 *
 * Walks the suppression flow without actually sending an SMS:
 *   1. Insert a synthetic test prospect with your own mobile number.
 *   2. Send a fake "sms_reply" with body "STOP" via the Mobile Message inbound
 *      webhook (or the Twilio webhook — both should work identically).
 *   3. Verify prospects.unsubscribed_at is set AND status is do_not_contact.
 *   4. Verify a second send attempt to the same prospect is blocked by
 *      smsPreSendCheck (we simulate by checking the row state, not by
 *      actually attempting another send).
 *   5. Clean up the test prospect.
 *
 * Read-mostly. Inserts and removes one row in `prospects` and a few rows in
 * `outreach_log` keyed by a special test marker so it's easy to clean up
 * even if the script crashes mid-way.
 *
 * Usage:
 *   DATABASE_URL=postgresql://... \
 *   BASE_URL=https://app.example.com \
 *   TEST_PHONE=+614xxxxxxxx \
 *   node scripts/test-stop-flow.mjs
 *
 *   # To target a different inbound endpoint:
 *   INBOUND_ENDPOINT=/twilio/sms/incoming node scripts/test-stop-flow.mjs
 */

import { randomUUID } from "node:crypto";
import initSqlJs from "sql.js";
import pg from "pg";

const DATABASE_URL = process.env.DATABASE_URL;
const BASE_URL = (process.env.BASE_URL ?? "").replace(/\/$/, "");
const TEST_PHONE = process.env.TEST_PHONE;
const INBOUND_ENDPOINT = process.env.INBOUND_ENDPOINT ?? "/mobilemsg/sms/incoming";

if (!DATABASE_URL || !BASE_URL || !TEST_PHONE) {
  console.error("ERROR: DATABASE_URL, BASE_URL and TEST_PHONE env vars are required.");
  console.error("       TEST_PHONE must be your own AU mobile in E.164 format (+614...).");
  process.exit(1);
}

if (!/^\+614\d{8}$/.test(TEST_PHONE)) {
  console.error(`ERROR: TEST_PHONE "${TEST_PHONE}" is not a valid AU mobile (+614xxxxxxxx).`);
  process.exit(1);
}

const TEST_MARKER = "STOP_FLOW_TEST_DELETE_ME";

const pool = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

let exitCode = 0;
function check(name, ok, detail = "") {
  if (ok) console.log(`  PASS  ${name}${detail ? `  (${detail})` : ""}`);
  else { console.log(`  FAIL  ${name}${detail ? `  (${detail})` : ""}`); exitCode = 1; }
}

// The DB blob is owned by the running app, so we can't safely write to it
// directly from this script (the app would overwrite it on next save).
// Instead we use the admin import endpoint to create the test prospect.
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
if (!ADMIN_TOKEN) {
  console.error("ERROR: ADMIN_TOKEN env var required (we use the admin import endpoint to create the test prospect).");
  process.exit(1);
}

async function importTestProspect() {
  const csv = `business_name,phone,email,website,trade_type,suburb,state,source,google_rating,review_count\n${TEST_MARKER},${TEST_PHONE},,,plumber,TestSuburb,NSW,manual_test,,`;
  const params = new URLSearchParams();
  params.append("csv_text", csv);
  const r = await fetch(`${BASE_URL}/admin/prospects/import`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "x-admin-token": ADMIN_TOKEN },
    body: params.toString(),
    redirect: "manual"
  });
  if (r.status !== 302 && r.status !== 301 && r.status !== 200) {
    throw new Error(`prospect import failed: ${r.status}`);
  }
}

async function fetchProspect() {
  const res = await pool.query("SELECT data FROM sqlite_blob WHERE id = 'main'");
  const SQL = await initSqlJs();
  const db = new SQL.Database(new Uint8Array(res.rows[0].data));
  const stmt = db.prepare("SELECT prospect_id, status, unsubscribed_at FROM prospects WHERE phone = ? AND business_name = ?");
  stmt.bind([TEST_PHONE, TEST_MARKER]);
  let row = null;
  if (stmt.step()) row = stmt.getAsObject();
  stmt.free();
  return row;
}

async function postInbound(body) {
  const url = `${BASE_URL}${INBOUND_ENDPOINT}`;
  const isTwilio = INBOUND_ENDPOINT.includes("twilio");
  const headers = isTwilio
    ? { "Content-Type": "application/x-www-form-urlencoded" }
    : { "Content-Type": "application/json" };
  const payload = isTwilio
    ? new URLSearchParams({ From: TEST_PHONE, To: "+61400000000", Body: body }).toString()
    : JSON.stringify({ from: TEST_PHONE, message: body });
  const r = await fetch(url, { method: "POST", headers, body: payload });
  return r.status;
}

async function deleteTestProspect(prospectId) {
  if (!prospectId) return;
  const r = await fetch(`${BASE_URL}/admin/prospects/${prospectId}/delete`, {
    method: "POST",
    headers: { "x-admin-token": ADMIN_TOKEN },
    redirect: "manual"
  });
  if (r.status !== 302 && r.status !== 301 && r.status !== 200) {
    console.warn(`  cleanup: prospect delete returned ${r.status} — manually remove ${prospectId}`);
  }
}

async function main() {
  console.log(`# STOP-flow end-to-end test`);
  console.log(`Endpoint: ${INBOUND_ENDPOINT}`);
  console.log(`Phone:    ${TEST_PHONE}`);
  console.log(`Base URL: ${BASE_URL}`);
  console.log("");

  let prospectId = null;
  try {
    console.log("Step 1: import test prospect via admin");
    await importTestProspect();

    console.log("Step 2: read back prospect from DB");
    // Allow a beat for any debounced DB writes
    await new Promise(r => setTimeout(r, 1500));
    const before = await fetchProspect();
    check("prospect was created", !!before, before ? `id=${before.prospect_id} status=${before.status}` : "missing");
    if (!before) return;
    prospectId = before.prospect_id;
    check("starts with no unsubscribed_at", !before.unsubscribed_at, `unsubscribed_at=${before.unsubscribed_at}`);

    console.log("Step 3: simulate inbound STOP");
    const status = await postInbound("STOP");
    check("inbound endpoint returned 200", status === 200, `status=${status}`);

    console.log("Step 4: re-read prospect — expect unsubscribed_at + do_not_contact");
    await new Promise(r => setTimeout(r, 1500));
    const after = await fetchProspect();
    check("prospect still exists", !!after);
    check("unsubscribed_at is set", !!after?.unsubscribed_at, after?.unsubscribed_at ?? "null");
    check("status flipped to do_not_contact", after?.status === "do_not_contact", `status=${after?.status}`);

    console.log("Step 5: simulate second STOP (idempotency check)");
    await postInbound("stop");
    await new Promise(r => setTimeout(r, 1000));
    const afterTwo = await fetchProspect();
    check("unsubscribed_at unchanged after second STOP", afterTwo?.unsubscribed_at === after?.unsubscribed_at,
      `before=${after?.unsubscribed_at} after=${afterTwo?.unsubscribed_at}`);

    console.log("Step 6: simulate START (re-opt-in) — expect status flip back to contacted");
    await postInbound("START");
    await new Promise(r => setTimeout(r, 1000));
    const afterStart = await fetchProspect();
    check("status flipped to contacted after START", afterStart?.status === "contacted", `status=${afterStart?.status}`);
    check("unsubscribed_at PRESERVED after START (legal record)", !!afterStart?.unsubscribed_at,
      afterStart?.unsubscribed_at ?? "null");
  } finally {
    console.log("\nCleanup: removing test prospect");
    await deleteTestProspect(prospectId);
  }

  console.log(exitCode === 0 ? "\nALL CHECKS PASSED" : "\nSOME CHECKS FAILED");
  process.exit(exitCode);
}

try {
  await main();
} finally {
  await pool.end();
}
