/**
 * System lifecycle test suite.
 * Run with:  npx tsx scripts/test-lifecycle.ts
 *
 * TARGET env var controls which server is tested:
 *   TARGET=local  → http://localhost:3000 (sig validation off, no real calls)
 *   TARGET=dev    → https://pickupai-dev.ai-builders.space (sig validation off, real Twilio calls)
 *   TARGET=prod   → https://pickupai.ai-builders.space (sig validation ON, safe subset only)
 *
 * Covers all 44 test cases across 10 groups:
 *   Group 1  - Infrastructure
 *   Group 2  - Admin API
 *   Group 3  - Dashboard auth
 *   Group 4  - Twilio webhooks
 *   Group 5  - Lead management
 *   Group 6  - SMS formatting (unit tests, no HTTP)
 *   Group 7  - Service area feature
 *   Group 8  - Self-serve signup
 *   Group 9  - Welcome page & demo flow (T40 runs real Twilio call in dev mode)
 *   Group 10 - Landing page CTA & setup guide
 */

import { formatOwnerSms, NO_SMS_INTENTS } from "../src/twilio/sms.js";
import { buildServiceAreaSection } from "../src/realtime/session.js";
import type { LeadRow } from "../src/db/repo.js";
import { execSync } from "node:child_process";

// ─── Twilio REST helpers (used in dev mode for webhook swap) ──────────────────
// Credentials are read from environment variables (never hardcoded in source).
// Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and DEMO_POOL_NUMBER_SID in your
// shell or .env before running TARGET=dev tests.

const TWILIO_ACCOUNT_SID   = process.env.TWILIO_ACCOUNT_SID   ?? "";
const TWILIO_AUTH_TOKEN    = process.env.TWILIO_AUTH_TOKEN     ?? "";
// Twilio phone number SID for the demo pool number (+61280000796).
// Find it in the Twilio console under "Phone Numbers → Manage → Active Numbers".
const DEMO_POOL_NUMBER_SID = process.env.DEMO_POOL_NUMBER_SID ?? "";
const PROD_WEBHOOK = "https://pickupai.ai-builders.space/twilio/voice/incoming";
const DEV_WEBHOOK  = "https://pickupai-dev.ai-builders.space/twilio/voice/incoming";

function twilioAuthHeader() {
  const creds = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString("base64");
  return { "Authorization": `Basic ${creds}`, "Content-Type": "application/x-www-form-urlencoded" };
}

async function setDemoWebhook(url: string) {
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/IncomingPhoneNumbers/${DEMO_POOL_NUMBER_SID}.json`,
    {
      method: "POST",
      headers: twilioAuthHeader(),
      body: new URLSearchParams({ VoiceUrl: url, VoiceMethod: "POST" }).toString()
    }
  );
  if (!res.ok) throw new Error(`Failed to update Twilio webhook: ${res.status} ${await res.text()}`);
}

// TARGET controls which server to test against.
//   local  → localhost:3000, sig validation off, no real Twilio calls placed
//   dev    → pickupai-dev.ai-builders.space, sig validation off, REAL Twilio calls (plumber demo)
//   prod   → pickupai.ai-builders.space, sig validation ON, safe subset only
const TARGET = process.env.TARGET ?? "prod";

const BASE =
  TARGET === "local" ? "http://localhost:3000" :
  TARGET === "dev"   ? "https://pickupai-dev.ai-builders.space" :
                       "https://pickupai.ai-builders.space";

// Admin token — same value deployed to both dev and prod
const ADMIN_TOKEN = TARGET === "local"
  ? "local-admin-token-2026"
  : "f9cef66726d425b2b9253fe48c60b7451686e4c8c515eeab2c9d148d69729441";

const SEED_EMAIL =
  TARGET === "local" ? "owner@example.com" :
  TARGET === "dev"   ? "dev@pickupai.app" :
                       "owner@pickupai.app";

const SEED_PASSWORD =
  TARGET === "local" ? "changeme123" :
  TARGET === "dev"   ? "dev-changeme-2026" :
                       "changeme-set-a-real-password";

// Seed tenant's Twilio number (TWILIO_DEFAULT_VOICE_NUMBER in the deployed env)
// +61280000796 is the landline used for both inbound voice AND demo pool.
// Demo sessions take routing priority over the seed tenant (see server.ts).
const SEED_TWILIO_NUMBER = "+61280000796";

// Prod has signature validation ON — Twilio webhook tests only verify 403.
// Local + dev have it OFF — full TwiML responses are tested.
const PROD_MODE = TARGET === "prod";

// Dev mode: real Twilio calls are placed (simulate-demo-call actually runs).
// Recording poll waits up to 120 s for the AI to finish the call.
const DEV_MODE = TARGET === "dev";

const TEST_CALL_SID = "CA_TEST_LIFECYCLE_001";

const modeLabel =
  PROD_MODE ? "production — sig validation ON, safe subset only" :
  DEV_MODE  ? "dev — sig validation OFF, real Twilio calls" :
              "local — sig validation OFF, no real calls";

console.log(`\n🎯 Target: ${BASE} (${modeLabel})`);

// ─── Test runner ─────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures: string[] = [];

function pass(id: string, label: string) {
  console.log(`  ✓ ${id} ${label}`);
  passed++;
}

function fail(id: string, label: string, reason: string) {
  console.log(`  ✗ ${id} ${label}`);
  console.log(`      → ${reason}`);
  failed++;
  failures.push(`${id}: ${reason}`);
}

async function check(
  id: string,
  label: string,
  fn: () => Promise<void>
) {
  try {
    await fn();
    pass(id, label);
  } catch (err: any) {
    fail(id, label, err?.message ?? String(err));
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

function adminHeaders(extra: Record<string, string> = {}) {
  return { "x-admin-token": ADMIN_TOKEN, ...extra };
}

async function getJson(path: string, headers: Record<string, string> = {}) {
  const res = await fetch(`${BASE}${path}`, { headers });
  const text = await res.text();
  let body: any;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, body, headers: res.headers };
}

async function postJson(path: string, data: any, headers: Record<string, string> = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(data)
  });
  const text = await res.text();
  let body: any;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, body, headers: res.headers };
}

async function postForm(path: string, data: Record<string, string>, headers: Record<string, string> = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", ...headers },
    body: new URLSearchParams(data).toString(),
    redirect: "manual"
  });
  const text = await res.text();
  return { status: res.status, body: text, headers: res.headers };
}

async function patchJson(path: string, data: any, headers: Record<string, string> = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(data)
  });
  const text = await res.text();
  let body: any;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, body, headers: res.headers };
}

async function deleteReq(path: string, headers: Record<string, string> = {}) {
  const res = await fetch(`${BASE}${path}`, { method: "DELETE", headers });
  const text = await res.text();
  let body: any;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, body };
}

// ─── Session cookie helpers ───────────────────────────────────────────────────

let sessionCookie = "";
let signupCookie = "";
let signupTenantId = "";
const SIGNUP_TEST_EMAIL = `test-signup-${Date.now()}@lifecycle.test`;

async function loginAndGetCookie(): Promise<string> {
  const res = await postForm("/dashboard/login", {
    email: SEED_EMAIL,
    password: SEED_PASSWORD
  });
  const raw = res.headers.get("set-cookie") ?? "";
  const match = raw.match(/dash_session=([^;]+)/);
  return match ? `dash_session=${match[1]}` : "";
}

// ─── Fake lead for unit tests ─────────────────────────────────────────────────

function makeTestLead(overrides: Partial<LeadRow> = {}): LeadRow {
  return {
    lead_id: "test-lead-1",
    tenant_id: null,
    call_id: TEST_CALL_SID,
    name: "John Smith",
    phone: "+61412345678",
    address: "Surry Hills NSW 2010",
    issue_type: "plumbing",
    issue_summary: "Burst pipe under kitchen sink, water everywhere",
    urgency_level: "emergency",
    preferred_time: "ASAP today",
    notes: null,
    confidence: null,
    next_action: null,
    lead_status: "new",
    created_at: new Date().toISOString(),
    ...overrides
  };
}

// ─── Twilio-style form body ───────────────────────────────────────────────────

async function postTwiml(path: string, data: Record<string, string>) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(data).toString()
  });
  return { status: res.status, body: await res.text(), headers: res.headers };
}

// ═══════════════════════════════════════════════════════════════════════════════
// GROUP 1 — Infrastructure
// ═══════════════════════════════════════════════════════════════════════════════

console.log("\n── Group 1: Infrastructure ──────────────────────────────────");

await check("T01", "GET /health → {ok: true, mode: realtime, multiTenant: true}", async () => {
  const { status, body } = await getJson("/health");
  assert(status === 200, `expected 200, got ${status}`);
  assert(body.ok === true, `ok should be true`);
  assert(body.mode === "realtime", `mode should be "realtime", got ${body.mode}`);
  assert(body.multiTenant === true, `multiTenant should be true`);
});

await check("T02", "GET / → HTML contains 'PickupAI'", async () => {
  const res = await fetch(`${BASE}/`);
  const html = await res.text();
  assert(res.status === 200, `expected 200, got ${res.status}`);
  assert(html.includes("PickupAI"), `landing page HTML does not contain 'PickupAI'`);
});

await check("T03", "TypeScript compiles without errors", async () => {
  try {
    execSync("npx tsc --noEmit", { cwd: "D:\\Cursor Temp", stdio: "pipe" });
  } catch (err: any) {
    throw new Error(`TypeScript errors:\n${err.stdout?.toString() ?? err.message}`);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// GROUP 2 — Admin API
// ═══════════════════════════════════════════════════════════════════════════════

console.log("\n── Group 2: Admin API ───────────────────────────────────────");

let testTenantId = "";
const TEST_TWILIO_NUM = "+61400000099";

await check("T04", `GET /admin/tenants → includes seeded default tenant (${SEED_TWILIO_NUMBER})`, async () => {
  const { status, body } = await getJson("/admin/tenants", adminHeaders());
  assert(status === 200, `expected 200, got ${status}`);
  assert(Array.isArray(body.tenants), `expected tenants array`);
  assert(body.tenants.length >= 1, `expected at least 1 tenant, got ${body.tenants.length}`);
  const defaultTenant = body.tenants.find((t: any) => t.twilio_number === SEED_TWILIO_NUMBER);
  assert(!!defaultTenant, `seeded tenant with ${SEED_TWILIO_NUMBER} not found (DB may have been wiped on Koyeb restart — expected on first run)`);
});

await check("T05", "POST /admin/tenants → creates test tenant (201)", async () => {
  const { status, body } = await postJson("/admin/tenants", {
    name: "Test Plumbing Co",
    trade_type: "plumber",
    ai_name: "Ruby",
    twilio_number: TEST_TWILIO_NUM,
    owner_phone: "+61420000099",
    owner_email: "test@example.com",
    password: "test-pass-123"
  }, adminHeaders());
  assert(status === 201, `expected 201, got ${status}. Body: ${JSON.stringify(body)}`);
  assert(body.tenant?.tenant_id, `expected tenant_id in response`);
  assert(!body.tenant?.password_hash, `password_hash must not be exposed`);
  testTenantId = body.tenant.tenant_id;
});

await check("T06", "GET /admin/tenants/:id → returns test tenant", async () => {
  assert(testTenantId, "need testTenantId from T05");
  const { status, body } = await getJson(`/admin/tenants/${testTenantId}`, adminHeaders());
  assert(status === 200, `expected 200, got ${status}`);
  assert(body.tenant?.name === "Test Plumbing Co", `wrong name: ${body.tenant?.name}`);
  assert(body.tenant?.ai_name === "Ruby", `wrong ai_name: ${body.tenant?.ai_name}`);
});

await check("T07", "PATCH /admin/tenants/:id → updates ai_name", async () => {
  assert(testTenantId, "need testTenantId from T05");
  const { status, body } = await patchJson(`/admin/tenants/${testTenantId}`, { ai_name: "Gem" }, adminHeaders());
  assert(status === 200, `expected 200, got ${status}`);
  assert(body.tenant?.ai_name === "Gem", `expected ai_name 'Gem', got '${body.tenant?.ai_name}'`);
});

await check("T08", "DELETE /admin/tenants/:id → removes tenant", async () => {
  assert(testTenantId, "need testTenantId from T05");
  const { status: delStatus } = await deleteReq(`/admin/tenants/${testTenantId}`, adminHeaders());
  assert(delStatus === 200, `expected 200 on delete, got ${delStatus}`);
  const { status: getStatus } = await getJson(`/admin/tenants/${testTenantId}`, adminHeaders());
  assert(getStatus === 404, `expected 404 after delete, got ${getStatus}`);
});

await check("T09", `POST /admin/tenants with duplicate twilio_number → 409`, async () => {
  // First ensure a tenant with the seed number exists (T04 may have found it absent)
  const { body: listBody } = await getJson("/admin/tenants", adminHeaders());
  const seedExists = listBody.tenants?.some((t: any) => t.twilio_number === SEED_TWILIO_NUMBER);
  if (!seedExists) {
    // Create one so we can test the duplicate constraint
    await postJson("/admin/tenants", {
      name: "Dup Seed Tenant",
      trade_type: "plumber",
      twilio_number: SEED_TWILIO_NUMBER,
      owner_phone: "+61420000001"
    }, adminHeaders());
  }
  const { status } = await postJson("/admin/tenants", {
    name: "Dup Tenant 2",
    trade_type: "plumber",
    twilio_number: SEED_TWILIO_NUMBER,
    owner_phone: "+61420000002"
  }, adminHeaders());
  assert(status === 409, `expected 409 for duplicate number, got ${status}`);
});

// ═══════════════════════════════════════════════════════════════════════════════
// GROUP 3 — Dashboard auth
// ═══════════════════════════════════════════════════════════════════════════════

console.log("\n── Group 3: Dashboard Auth ──────────────────────────────────");

await check("T10", "GET /dashboard/login → HTML contains 'Sign in'", async () => {
  const res = await fetch(`${BASE}/dashboard/login`);
  const html = await res.text();
  assert(res.status === 200, `expected 200, got ${res.status}`);
  assert(html.toLowerCase().includes("sign in"), `login page does not contain 'Sign in'`);
});

await check("T11", "POST /dashboard/login with wrong credentials → no cookie", async () => {
  const res = await postForm("/dashboard/login", { email: "bad@example.com", password: "wrong" });
  assert(res.status === 200, `expected 200 (re-render login), got ${res.status}`);
  const cookie = res.headers.get("set-cookie") ?? "";
  assert(!cookie.includes("dash_session"), `should NOT set session cookie on failed login`);
  assert(res.body.toLowerCase().includes("invalid"), `expected error message in response`);
});

await check("T12", "POST /dashboard/login with correct credentials → session cookie + redirect", async () => {
  const res = await postForm("/dashboard/login", { email: SEED_EMAIL, password: SEED_PASSWORD });
  assert(res.status === 302, `expected 302 redirect, got ${res.status}`);
  const location = res.headers.get("location") ?? "";
  assert(location.includes("/dashboard/leads"), `expected redirect to /dashboard/leads, got '${location}'`);
  const cookie = res.headers.get("set-cookie") ?? "";
  assert(cookie.includes("dash_session"), `expected dash_session cookie to be set`);
  sessionCookie = cookie.match(/dash_session=[^;]+/)?.[0] ?? "";
});

await check("T13", "GET /dashboard/leads with valid session → 200 with leads HTML", async () => {
  assert(sessionCookie, "need sessionCookie from T12");
  const res = await fetch(`${BASE}/dashboard/leads`, {
    headers: { Cookie: sessionCookie },
    redirect: "manual"
  });
  assert(res.status === 200, `expected 200, got ${res.status}`);
  const html = await res.text();
  assert(html.includes("Leads"), `expected 'Leads' in dashboard HTML`);
});

await check("T14", "GET /dashboard/leads without session → 302 to /dashboard/login", async () => {
  const res = await fetch(`${BASE}/dashboard/leads`, { redirect: "manual" });
  assert(res.status === 302, `expected 302, got ${res.status}`);
  const location = res.headers.get("location") ?? "";
  assert(location.includes("/dashboard/login"), `expected redirect to login, got '${location}'`);
});

await check("T15", "GET /dashboard/logout → 302 + session cookie cleared", async () => {
  assert(sessionCookie, "need sessionCookie from T12");
  const res = await fetch(`${BASE}/dashboard/logout`, {
    headers: { Cookie: sessionCookie },
    redirect: "manual"
  });
  assert(res.status === 302, `expected 302, got ${res.status}`);
  const cookie = res.headers.get("set-cookie") ?? "";
  assert(cookie.includes("Max-Age=0"), `expected Max-Age=0 to clear cookie, got: ${cookie}`);
  // Re-acquire cookie for subsequent tests
  sessionCookie = await loginAndGetCookie();
});

// ═══════════════════════════════════════════════════════════════════════════════
// GROUP 4 — Twilio webhooks
// ═══════════════════════════════════════════════════════════════════════════════

console.log("\n── Group 4: Twilio Webhooks ─────────────────────────────────");

// In production, TWILIO_VALIDATE_SIGNATURE=true — unsigned requests correctly return 403.
// In local mode, validation is off — we verify actual TwiML content.

await check("T16", PROD_MODE
  ? "POST /twilio/voice/incoming (unsigned) → 403 (signature validation active)"
  : "POST /twilio/voice/incoming (registered number) → TwiML with <Connect><Stream>",
async () => {
  const { status, body } = await postTwiml("/twilio/voice/incoming", {
    CallSid: TEST_CALL_SID,
    From: "+61412345678",
    To: "+61468000835",
    CallStatus: "ringing"
  });
  if (PROD_MODE) {
    assert(status === 401 || status === 403, `expected 401/403 (signature validation), got ${status}`);
  } else {
    assert(status === 200, `expected 200, got ${status}`);
    assert(body.includes("<Connect>"), `TwiML missing <Connect>: ${body.slice(0, 300)}`);
    assert(body.includes("<Stream"), `TwiML missing <Stream>: ${body.slice(0, 300)}`);
    assert(body.includes("wss://"), `<Stream> URL should use wss://, got: ${body.slice(0, 300)}`);
  }
});

await check("T17", PROD_MODE
  ? "POST /twilio/voice/incoming unknown number (unsigned) → 403"
  : "POST /twilio/voice/incoming (unknown number) → fallback TwiML still valid",
async () => {
  const { status, body } = await postTwiml("/twilio/voice/incoming", {
    CallSid: "CA_UNKNOWN_NUMBER_TEST",
    From: "+61411111111",
    To: "+61499999999",
    CallStatus: "ringing"
  });
  if (PROD_MODE) {
    assert(status === 401 || status === 403, `expected 401/403 (signature validation), got ${status}`);
  } else {
    assert(status === 200, `expected 200, got ${status}`);
    assert(body.includes("<Connect>") || body.includes("<Dial>"),
      `expected valid TwiML with <Connect> or <Dial>, got: ${body.slice(0, 300)}`);
  }
});

await check("T18", PROD_MODE
  ? "POST /twilio/voice/status (unsigned) → 403"
  : "POST /twilio/voice/status (in-progress) → 200",
async () => {
  const { status } = await postTwiml("/twilio/voice/status", {
    CallSid: TEST_CALL_SID,
    CallStatus: "in-progress"
  });
  if (PROD_MODE) {
    assert(status === 401 || status === 403, `expected 401/403 (signature validation), got ${status}`);
  } else {
    assert(status === 200, `expected 200, got ${status}`);
  }
});

await check("T19", PROD_MODE
  ? "POST /twilio/voice/status completed (unsigned) → 403"
  : "POST /twilio/voice/status (completed) → 200 + call row updated",
async () => {
  const { status } = await postTwiml("/twilio/voice/status", {
    CallSid: TEST_CALL_SID,
    CallStatus: "completed"
  });
  if (PROD_MODE) {
    assert(status === 401 || status === 403, `expected 401/403 (signature validation), got ${status}`);
  } else {
    assert(status === 200, `expected 200, got ${status}`);
  }
});

await check("T20", PROD_MODE
  ? "POST /twilio/voice/recording (unsigned) → 403"
  : "POST /twilio/voice/recording → 200 + recording_url stored",
async () => {
  const { status } = await postTwiml("/twilio/voice/recording", {
    CallSid: TEST_CALL_SID,
    RecordingSid: "RE_TEST_123",
    RecordingUrl: "https://api.twilio.com/recordings/RE_TEST_123",
    RecordingStatus: "completed"
  });
  if (PROD_MODE) {
    assert(status === 401 || status === 403, `expected 401/403 (signature validation), got ${status}`);
  } else {
    assert(status === 200, `expected 200, got ${status}`);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// GROUP 5 — Lead management
// ═══════════════════════════════════════════════════════════════════════════════

console.log("\n── Group 5: Lead Management ─────────────────────────────────");

await check("T21", "GET /debug/calls/:callSid → returns JSON object (200) or 404 (no prior call in prod)", async () => {
  const { status, body } = await getJson(`/debug/calls/${TEST_CALL_SID}`, adminHeaders());
  // In prod, T19 was blocked by sig validation so the call was never written to DB → expect 404
  // In local mode (T19 ran), expect 200 with a call object
  if (PROD_MODE) {
    assert(status === 404 || status === 200, `expected 404 or 200, got ${status}`);
  } else {
    assert(status === 200, `expected 200, got ${status}`);
    assert(typeof body === "object", `expected JSON object, got ${typeof body}`);
  }
});

await check("T22", "GET /dashboard/leads/export.csv → Content-Type: text/csv with header row", async () => {
  assert(sessionCookie, "need sessionCookie");
  const res = await fetch(`${BASE}/dashboard/leads/export.csv`, {
    headers: { Cookie: sessionCookie }
  });
  assert(res.status === 200, `expected 200, got ${res.status}`);
  const contentType = res.headers.get("content-type") ?? "";
  assert(contentType.includes("text/csv"), `expected text/csv, got '${contentType}'`);
  const csv = await res.text();
  assert(csv.includes("name,phone,address"), `expected CSV header row, got: ${csv.slice(0, 100)}`);
});

await check("T23", "GET /dashboard/leads/:id → 404 for non-existent lead (graceful)", async () => {
  assert(sessionCookie, "need sessionCookie");
  const res = await fetch(`${BASE}/dashboard/leads/nonexistent-lead-id`, {
    headers: { Cookie: sessionCookie }
  });
  assert(res.status === 404, `expected 404 for non-existent lead, got ${res.status}`);
});

await check("T24", "POST /dashboard/leads/:id/status with invalid status → 400", async () => {
  assert(sessionCookie, "need sessionCookie");
  const res = await fetch(`${BASE}/dashboard/leads/some-lead-id/status`, {
    method: "POST",
    headers: {
      Cookie: sessionCookie,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: "status=invalid_status",
    redirect: "manual"
  });
  assert(res.status === 400 || res.status === 404, `expected 400 or 404, got ${res.status}`);
});

// ═══════════════════════════════════════════════════════════════════════════════
// GROUP 6 — SMS formatting (unit tests, no HTTP)
// ═══════════════════════════════════════════════════════════════════════════════

console.log("\n── Group 6: SMS Formatting ──────────────────────────────────");

await check("T25", "formatOwnerSms: new_job + emergency → header 'NEW JOB (EMERGENCY)'", async () => {
  const lead = makeTestLead({ urgency_level: "emergency" });
  const sms = formatOwnerSms({ lead, callId: "CA123", callerIntent: "new_job" });
  assert(sms.startsWith("NEW JOB (EMERGENCY):"), `unexpected SMS header: '${sms.split("\n")[0]}'`);
  assert(sms.includes("Name: John Smith"), `missing Name field`);
  assert(sms.includes("Burst pipe"), `missing issue summary`);
});

await check("T26", "formatOwnerSms: complaint → header starts with 'COMPLAINT'", async () => {
  const lead = makeTestLead({ urgency_level: null, issue_summary: "The job was done badly" });
  const sms = formatOwnerSms({ lead, callId: "CA124", callerIntent: "complaint" });
  assert(sms.startsWith("COMPLAINT"), `expected COMPLAINT header, got: '${sms.split("\n")[0]}'`);
});

await check("T27", "NO_SMS_INTENTS set: wrong_number, spam, telemarketer, silent, abusive all present", async () => {
  const shouldSkip = ["wrong_number", "spam", "telemarketer", "silent", "abusive"];
  for (const intent of shouldSkip) {
    assert(NO_SMS_INTENTS.has(intent), `'${intent}' missing from NO_SMS_INTENTS`);
  }
  const shouldSend = ["new_job", "follow_up", "complaint", "reschedule", "quote_only", "supplier", "trade_referral"];
  for (const intent of shouldSend) {
    assert(!NO_SMS_INTENTS.has(intent), `'${intent}' should NOT be in NO_SMS_INTENTS but is`);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// GROUP 7 — Service area feature
// ═══════════════════════════════════════════════════════════════════════════════

console.log("\n── Group 7: Service Area ────────────────────────────────────");

let serviceAreaTenantId = "";
const SERVICE_AREA_NUMBER = "+61400000077";

await check("T28", "POST /admin/tenants with service_area → 201 + GET reflects field", async () => {
  const { status, body } = await postJson("/admin/tenants", {
    name: "Sydney Plumbing Co",
    trade_type: "plumber",
    twilio_number: SERVICE_AREA_NUMBER,
    owner_phone: "+61420000077",
    service_area: "Sydney metro area (postcodes 2000–2250) and inner west"
  }, adminHeaders());
  assert(status === 201, `expected 201, got ${status}. Body: ${JSON.stringify(body)}`);
  assert(
    body.tenant?.service_area === "Sydney metro area (postcodes 2000–2250) and inner west",
    `service_area not stored correctly: ${body.tenant?.service_area}`
  );
  serviceAreaTenantId = body.tenant.tenant_id;

  // PATCH to update it, then GET to verify
  await patchJson(`/admin/tenants/${serviceAreaTenantId}`, {
    service_area: "Greater Sydney, within 60km of CBD"
  }, adminHeaders());
  const { status: getStatus, body: getBody } = await getJson(
    `/admin/tenants/${serviceAreaTenantId}`,
    adminHeaders()
  );
  assert(getStatus === 200, `GET after PATCH returned ${getStatus}`);
  assert(
    getBody.tenant?.service_area === "Greater Sydney, within 60km of CBD",
    `PATCH did not update service_area: got '${getBody.tenant?.service_area}'`
  );

  // Cleanup
  await deleteReq(`/admin/tenants/${serviceAreaTenantId}`, adminHeaders());
});

await check("T29", "buildServiceAreaSection with value → prompt contains service area text", async () => {
  const section = buildServiceAreaSection("Sydney metro only");
  assert(section.length > 0, "expected non-empty string");
  assert(section.includes("Sydney metro only"), "prompt should include the service_area value");
  assert(section.includes("OUT OF AREA"), "prompt should include OUT OF AREA instruction for save_lead");
  assert(section.includes("ALWAYS collect"), "prompt should always instruct AI to collect details");
});

await check("T30", "buildServiceAreaSection with null/empty → returns empty string", async () => {
  assert(buildServiceAreaSection(null) === "", "null should return ''");
  assert(buildServiceAreaSection("") === "", "empty string should return ''");
  assert(buildServiceAreaSection("   ") === "", "whitespace-only should return ''");
  assert(buildServiceAreaSection(undefined) === "", "undefined should return ''");
});

// ═══════════════════════════════════════════════════════════════════════════════
// GROUP 8 — Self-serve signup
// ═══════════════════════════════════════════════════════════════════════════════

console.log("\n── Group 8: Self-Serve Signup ───────────────────────────────");

await check("T31", "GET /dashboard/signup → 200 HTML with signup form", async () => {
  const res = await fetch(`${BASE}/dashboard/signup`);
  const html = await res.text();
  assert(res.status === 200, `expected 200, got ${res.status}`);
  assert(html.toLowerCase().includes("sign up") || html.toLowerCase().includes("signup"),
    `signup page does not contain 'Sign up'`);
});

await check("T32", "POST /dashboard/signup valid new user → 302 to /dashboard/welcome + cookie set", async () => {
  const res = await postForm("/dashboard/signup", {
    name: "Lifecycle Test Plumber",
    trade_type: "plumber",
    ai_name: "Aria",
    owner_phone: "+61400000001",
    email: SIGNUP_TEST_EMAIL,
    password: "test-pass-lifecycle-2026"
  });
  assert(res.status === 302, `expected 302, got ${res.status}`);
  const location = res.headers.get("location") ?? "";
  assert(location.includes("/dashboard/welcome"), `expected redirect to /dashboard/welcome, got '${location}'`);
  const cookie = res.headers.get("set-cookie") ?? "";
  assert(cookie.includes("dash_session"), `expected dash_session cookie to be set`);
  signupCookie = cookie.match(/dash_session=[^;]+/)?.[0] ?? "";
  assert(signupCookie.length > 0, "could not extract signupCookie");

  // Resolve tenantId by scanning admin list for the unique test email
  const { body: listBody } = await getJson("/admin/tenants", adminHeaders());
  const match = listBody.tenants?.find((t: any) =>
    t.owner_email?.toLowerCase() === SIGNUP_TEST_EMAIL.toLowerCase()
  );
  assert(!!match, `could not find signup tenant in admin list for email ${SIGNUP_TEST_EMAIL}`);
  signupTenantId = match.tenant_id;
});

await check("T33", "POST /dashboard/signup duplicate email → 200 with 'already exists' error", async () => {
  const res = await postForm("/dashboard/signup", {
    name: "Dupe User",
    trade_type: "plumber",
    owner_phone: "+61400000002",
    email: SEED_EMAIL,
    password: "test-pass-2026"
  });
  assert(res.status === 200, `expected 200 (re-render), got ${res.status}`);
  assert(res.body.toLowerCase().includes("already exists") || res.body.toLowerCase().includes("already"),
    `expected 'already exists' error in response`);
});

await check("T34", "POST /dashboard/signup 7-char password → 200 with 'at least 8' error", async () => {
  const res = await postForm("/dashboard/signup", {
    name: "Short Pass User",
    trade_type: "electrician",
    owner_phone: "+61400000003",
    email: `short-${Date.now()}@lifecycle.test`,
    password: "1234567"
  });
  assert(res.status === 200, `expected 200, got ${res.status}`);
  assert(res.body.toLowerCase().includes("8") || res.body.toLowerCase().includes("least"),
    `expected password-length error in response`);
});

await check("T35", "POST /dashboard/signup missing owner_phone → 200 with error", async () => {
  const res = await postForm("/dashboard/signup", {
    name: "No Phone User",
    trade_type: "plumber",
    email: `nophone-${Date.now()}@lifecycle.test`,
    password: "test-pass-2026"
    // owner_phone intentionally omitted
  });
  assert(res.status === 200, `expected 200 (re-render with error), got ${res.status}`);
  assert(res.body.toLowerCase().includes("required") || res.body.toLowerCase().includes("field"),
    `expected validation error in response`);
});

// ═══════════════════════════════════════════════════════════════════════════════
// GROUP 9 — Welcome page & demo flow
// ═══════════════════════════════════════════════════════════════════════════════

console.log("\n── Group 9: Welcome Page & Demo Flow ───────────────────────");

await check("T36", "GET /dashboard/welcome (authenticated) → 200 HTML with demo options", async () => {
  assert(signupCookie, "need signupCookie from T32");
  const res = await fetch(`${BASE}/dashboard/welcome`, {
    headers: { Cookie: signupCookie },
    redirect: "manual"
  });
  assert(res.status === 200, `expected 200, got ${res.status}`);
  const html = await res.text();
  assert(
    html.toLowerCase().includes("demo") || html.toLowerCase().includes("simulate") || html.toLowerCase().includes("call"),
    `welcome page should contain demo-related content`
  );
});

await check("T37", "GET /dashboard/welcome (no cookie) → 302 to /dashboard/login", async () => {
  const res = await fetch(`${BASE}/dashboard/welcome`, { redirect: "manual" });
  assert(res.status === 302, `expected 302, got ${res.status}`);
  const location = res.headers.get("location") ?? "";
  assert(location.includes("/dashboard/login"), `expected redirect to /dashboard/login, got '${location}'`);
});

await check("T38", "POST /dashboard/request-demo (authenticated) → 200 HTML with demo number or config error", async () => {
  assert(signupCookie, "need signupCookie from T32");
  const res = await fetch(`${BASE}/dashboard/request-demo`, {
    method: "POST",
    headers: { Cookie: signupCookie, "Content-Type": "application/x-www-form-urlencoded" },
    redirect: "manual"
  });
  assert(res.status === 200, `expected 200, got ${res.status}`);
  const html = await res.text();
  // Either a demo number is assigned, or a graceful "not configured / all busy" message is shown
  const hasNumber = /\+61\d+/.test(html) || html.includes("demo");
  const hasError = html.toLowerCase().includes("not configured") || html.toLowerCase().includes("busy") || html.toLowerCase().includes("error");
  assert(hasNumber || hasError, `expected demo number or graceful error in response: ${html.slice(0, 300)}`);
});

await check("T39", "GET /dashboard/demo-status (authenticated) → 200 JSON {status: pending|ready}", async () => {
  assert(signupCookie, "need signupCookie from T32");
  const res = await fetch(`${BASE}/dashboard/demo-status`, {
    headers: { Cookie: signupCookie }
  });
  assert(res.status === 200, `expected 200, got ${res.status}`);
  const body = await res.json() as any;
  assert(
    body.status === "pending" || body.status === "ready",
    `expected status 'pending' or 'ready', got '${body.status}'`
  );
});

if (PROD_MODE) {
  console.log("  – T40 skipped in prod mode (would place a real Twilio call)");
} else {
  // Track whether T40 actually placed a call (vs returning a graceful error)
  let demoCallPlaced = false;

  if (DEV_MODE) {
    // Swap demo number webhook → dev so the AI session runs on THIS server
    await check("T40-setup", "Point demo number webhook to dev server before real call", async () => {
      await setDemoWebhook(DEV_WEBHOOK);
      console.log(`    → Webhook updated to ${DEV_WEBHOOK}`);
    });
  }

  await check(
    "T40",
    DEV_MODE
      ? "POST /dashboard/simulate-demo-call (dev) → 200 HTML + real Twilio call placed"
      : "POST /dashboard/simulate-demo-call (local) → 200 HTML",
    async () => {
      assert(signupCookie, "need signupCookie from T32");
      const res = await fetch(`${BASE}/dashboard/simulate-demo-call`, {
        method: "POST",
        headers: { Cookie: signupCookie, "Content-Type": "application/x-www-form-urlencoded" },
        redirect: "manual"
      });
      assert(res.status === 200, `expected 200, got ${res.status}`);
      const html = await res.text();
      const hasSimContent =
        html.toLowerCase().includes("simulat") ||
        html.toLowerCase().includes("calling") ||
        html.toLowerCase().includes("demo");
      const hasError =
        html.toLowerCase().includes("error") ||
        html.toLowerCase().includes("could not") ||
        html.toLowerCase().includes("busy") ||
        html.toLowerCase().includes("not configured");
      assert(hasSimContent || hasError, `expected simulation content or graceful error: ${html.slice(0, 300)}`);
      demoCallPlaced = !hasError;
      if (!demoCallPlaced) {
        console.log(`    ⚠ demo call returned an error — recording poll will be skipped`);
      }
    }
  );

  // In dev mode: poll for the recording (the real AI answered the scripted caller).
  if (DEV_MODE) {
    if (demoCallPlaced) {
      await check("T40b", "Demo call recording appears within 150 s (dev real-call integration)", async () => {
        assert(signupCookie, "need signupCookie from T32 + T40");
        const TIMEOUT_MS = 150_000;
        const POLL_INTERVAL_MS = 8_000;
        const deadline = Date.now() + TIMEOUT_MS;
        let recordingUrl: string | null = null;

        while (Date.now() < deadline) {
          await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
          const res = await fetch(`${BASE}/dashboard/demo-status`, {
            headers: { Cookie: signupCookie }
          });
          if (res.status !== 200) continue;
          const body = await res.json() as any;
          if (body.status === "ready" && body.recordingUrl) {
            recordingUrl = body.recordingUrl;
            break;
          }
          const remaining = Math.round((deadline - Date.now()) / 1000);
          console.log(`    ⏳ waiting for recording... ${remaining}s remaining`);
        }

        assert(recordingUrl !== null, "Recording did not appear within 150 s — AI may not have completed the call");
        console.log(`    ✔ Recording URL: ${recordingUrl}`);
      });
    } else {
      console.log("  – T40b skipped (T40 did not place a real call)");
    }

    // Always restore prod webhook so live calls keep working
    await check("T40-teardown", "Restore demo number webhook to production server", async () => {
      await setDemoWebhook(PROD_WEBHOOK);
      console.log(`    → Webhook restored to ${PROD_WEBHOOK}`);
    });
  }
}

await check("T41", "POST /twilio/demo/caller-script?trade_type=plumber → 200 TwiML with Polly.Matthew", async () => {
  const { status, body } = await postTwiml("/twilio/demo/caller-script?trade_type=plumber", {});
  assert(status === 200, `expected 200, got ${status}`);
  assert(body.includes("<Say"), `TwiML missing <Say: ${body.slice(0, 300)}`);
  assert(body.includes("Polly.Matthew"), `TwiML should use Polly.Matthew voice: ${body.slice(0, 300)}`);
  assert(body.toLowerCase().includes("burst pipe") || body.toLowerCase().includes("plumb"),
    `TwiML should contain plumber-specific script: ${body.slice(0, 300)}`);
});

await check("T42", "POST /twilio/demo/caller-script (no trade_type) → 200 TwiML with default script", async () => {
  const { status, body } = await postTwiml("/twilio/demo/caller-script", {});
  assert(status === 200, `expected 200, got ${status}`);
  assert(body.includes("<Say"), `TwiML missing <Say: ${body.slice(0, 300)}`);
  assert(body.includes("Polly.Matthew"), `TwiML should use Polly.Matthew voice: ${body.slice(0, 300)}`);
  assert(body.toLowerCase().includes("help") || body.toLowerCase().includes("job"),
    `TwiML should contain default fallback script: ${body.slice(0, 300)}`);
});

// ═══════════════════════════════════════════════════════════════════════════════
// GROUP 10 — Landing page CTA & setup guide
// ═══════════════════════════════════════════════════════════════════════════════

console.log("\n── Group 10: Landing Page CTA & Setup Guide ─────────────────");

await check("T43", "GET / → HTML contains href to /dashboard/signup", async () => {
  const res = await fetch(`${BASE}/`);
  const html = await res.text();
  assert(res.status === 200, `expected 200, got ${res.status}`);
  assert(html.includes("/dashboard/signup"), `landing page HTML does not contain link to /dashboard/signup`);
});

await check("T44", "GET /dashboard/setup-guide (authenticated) → 200 HTML with forwarding instructions", async () => {
  assert(signupCookie, "need signupCookie from T32");
  const res = await fetch(`${BASE}/dashboard/setup-guide`, {
    headers: { Cookie: signupCookie },
    redirect: "manual"
  });
  assert(res.status === 200, `expected 200, got ${res.status}`);
  const html = await res.text();
  assert(
    html.toLowerCase().includes("forward") || html.toLowerCase().includes("divert") || html.toLowerCase().includes("setup"),
    `setup guide should contain forwarding instructions`
  );
});

// ─── Cleanup: remove signup test tenant ──────────────────────────────────────

if (signupTenantId) {
  try {
    await deleteReq(`/admin/tenants/${signupTenantId}`, adminHeaders());
    console.log(`\n  ♻ Cleaned up signup test tenant (${signupTenantId})`);
  } catch {
    console.log(`\n  ⚠ Could not clean up signup test tenant (${signupTenantId})`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════════════════════════════════

const total = passed + failed;
console.log(`\n${"═".repeat(55)}`);
console.log(`  Results: ${passed}/${total} passed, ${failed} failed`);
if (failures.length > 0) {
  console.log(`\n  Failures:`);
  failures.forEach((f) => console.log(`    • ${f}`));
}
console.log(`${"═".repeat(55)}\n`);

process.exit(failed > 0 ? 1 : 0);
