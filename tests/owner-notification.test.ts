import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { rm } from "node:fs/promises";

/**
 * The code path that produces the product's ONLY output, and until 2026-08-04
 * no test could reach any of it: 165 lines inside `main()` in server.ts.
 *
 * `decideOwnerSms` — the WHETHER — was pulled out first and is unit-tested. This
 * is the SEQUENCE, which carries decisions of its own: the in-flight guard that
 * covers a real one-second double-invocation window, the first-call
 * celebration, and which notification status each path records. A notification
 * left "pending" is a lead nobody can audit.
 */

async function harness(over: { leadFields?: Record<string, unknown>; callerIntent?: string } = {}) {
  const { openDb } = await import("../src/db/db.js");
  const repo = await import("../src/db/repo.js");
  const path = `.tmp/test-notify-${Date.now()}-${Math.random().toString(36).slice(2)}.sqlite`;
  const db = await openDb(path);

  const tenant = repo.createTenant(db, {
    name: "Test Plumbing", trade_type: "plumber", twilio_number: "+61400000900",
    owner_phone: "+61411111111", owner_email: "owner@test.local", password: "pw"
  });
  repo.upsertCall(db, { call_id: "c1", tenant_id: tenant.tenant_id, from_number: "+61412345678", status: "completed" });
  repo.upsertLead(db, {
    lead_id: "c1", tenant_id: tenant.tenant_id, call_id: "c1",
    name: "Gary", phone: "+61412345678", address: "1 Test St", issue_type: "plumbing",
    issue_summary: "Leaking tap", urgency_level: null, preferred_time: null, notes: null,
    confidence: null, next_action: null, lead_status: "new",
    ...(over.leadFields ?? {})
  });

  const events: string[] = [];
  const deps = {
    db, smsInflight: new Set<string>(), crmExporters: [] as never[],
    trackEvent: (name: string) => { events.push(name); },
    log: { info: () => {}, warn: () => {} }
  };
  return { db, path, repo, deps, events, tenantId: tenant.tenant_id };
}

// getNotificationStatus returns only status+sent_at. The ERROR column is what
// says which path a skip took, and that is the thing worth asserting — a
// notification marked "skipped" with no reason is as unauditable as a pending
// one.
const status = async (db: { get: (sql: string, p: unknown[]) => unknown }, callId: string, channel: string) =>
  db.get(
    "SELECT status, error FROM notifications WHERE call_id = ? AND channel = ?",
    [callId, channel]
  ) as { status: string | null; error: string | null } | undefined;

beforeEach(() => vi.resetModules());
afterEach(() => vi.restoreAllMocks());

describe("owner notification — what gets recorded on each path", () => {
  it("skips a non-customer intent and records WHY, rather than leaving it pending", async () => {
    const h = await harness();
    const { notifyOwnerSmsIfNeeded } = await import("../src/notify/owner-notification.js");
    await notifyOwnerSmsIfNeeded(h.deps as never, "c1", "spam", "+61411111111");

    const n = await status(h.db, "c1", "sms");
    expect(n?.status).toBe("skipped");
    expect(n?.error).toBe("intent:spam");
    expect(h.events).toContain("sms_skipped_intent");
    await h.db.flush(); await rm(h.path, { force: true });
  });

  it("skips a message that would say nothing, and says so on the row", async () => {
    const h = await harness({ leadFields: { name: null, phone: null, issue_summary: null, notes: null } });
    // and no reachable caller ID either
    h.repo.upsertCall(h.db, { call_id: "c1", tenant_id: h.tenantId, from_number: "anonymous", status: "completed" });

    const { notifyOwnerSmsIfNeeded } = await import("../src/notify/owner-notification.js");
    await notifyOwnerSmsIfNeeded(h.deps as never, "c1", "new_job", "+61411111111");

    const n = await status(h.db, "c1", "sms");
    expect(n?.status).toBe("skipped");
    expect(n?.error).toBe("nothing_to_report");
    expect(h.events).toContain("sms_skipped_empty");
    await h.db.flush(); await rm(h.path, { force: true });
  });

  it("records an error rather than a pending row when the send throws", async () => {
    const h = await harness();
    const sms = await import("../src/twilio/sms.js");
    vi.spyOn(sms, "sendOwnerSms").mockRejectedValue(new Error("twilio is down"));

    const { notifyOwnerSmsIfNeeded } = await import("../src/notify/owner-notification.js");
    await notifyOwnerSmsIfNeeded(h.deps as never, "c1", "new_job", "+61411111111");

    const n = await status(h.db, "c1", "sms");
    // A row stuck on "pending" is a lead nobody can audit and nobody retries.
    expect(n?.status).toBe("error");
    expect(n?.error).toContain("twilio is down");
    expect(h.events).toContain("owner_sms_error");
    await h.db.flush(); await rm(h.path, { force: true });
  });

  it("records the provider's own reason when the send is skipped", async () => {
    const h = await harness();
    const sms = await import("../src/twilio/sms.js");
    vi.spyOn(sms, "sendOwnerSms").mockResolvedValue({ status: "skipped", reason: "no_sender" } as never);

    const { notifyOwnerSmsIfNeeded } = await import("../src/notify/owner-notification.js");
    await notifyOwnerSmsIfNeeded(h.deps as never, "c1", "new_job", "+61411111111");

    const n = await status(h.db, "c1", "sms");
    expect(n?.status).toBe("skipped");
    expect(n?.error).toBe("no_sender");
    await h.db.flush(); await rm(h.path, { force: true });
  });
});

describe("owner notification — the in-flight guard", () => {
  // notifyOwnerSmsIfNeeded fires twice for the same call about a second apart —
  // from onEndCall and from /twilio/voice/status — and getNotificationStatus is
  // still not "sent" while the first send is in flight. This Set is the only
  // thing between the tradie and two identical messages.
  it("does not send twice when both invocations overlap", async () => {
    const h = await harness();
    const sms = await import("../src/twilio/sms.js");
    let inFlight = 0, maxConcurrent = 0;
    const spy = vi.spyOn(sms, "sendOwnerSms").mockImplementation(async () => {
      inFlight++; maxConcurrent = Math.max(maxConcurrent, inFlight);
      await new Promise((r) => setTimeout(r, 20));
      inFlight--;
      return { status: "sent", sid: "SM1", to: "+61411111111", from: "+61400000900" } as never;
    });

    const { notifyOwnerSmsIfNeeded } = await import("../src/notify/owner-notification.js");
    await Promise.all([
      notifyOwnerSmsIfNeeded(h.deps as never, "c1", "new_job", "+61411111111"),
      notifyOwnerSmsIfNeeded(h.deps as never, "c1", "new_job", "+61411111111")
    ]);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(maxConcurrent).toBe(1);
    await h.db.flush(); await rm(h.path, { force: true });
  });
});

describe("owner notification — the first-call celebration", () => {
  it("prefixes the tenant's very first lead and nothing after it", async () => {
    const h = await harness();
    const sms = await import("../src/twilio/sms.js");
    const bodies: string[] = [];
    vi.spyOn(sms, "sendOwnerSms").mockImplementation(async (_db, body) => {
      bodies.push(body as string);
      return { status: "sent", sid: "SM1", to: "+61411111111", from: "+61400000900" } as never;
    });

    const { notifyOwnerSmsIfNeeded } = await import("../src/notify/owner-notification.js");
    await notifyOwnerSmsIfNeeded(h.deps as never, "c1", "new_job", "+61411111111");
    expect(bodies[0]).toContain(sms.FIRST_CALL_CELEBRATION_PREFIX);

    // A second call for the same tenant: no prefix. Getting this wrong means
    // every message carries a celebration, or the real first one does not.
    h.repo.upsertCall(h.db, { call_id: "c2", tenant_id: h.tenantId, from_number: "+61412345678", status: "completed" });
    h.repo.upsertLead(h.db, {
      lead_id: "c2", tenant_id: h.tenantId, call_id: "c2", name: "Dana",
      phone: "+61412345679", address: null, issue_type: null, issue_summary: "Blocked drain",
      urgency_level: null, preferred_time: null, notes: null, confidence: null,
      next_action: null, lead_status: "new"
    });
    await notifyOwnerSmsIfNeeded(h.deps as never, "c2", "new_job", "+61411111111");
    expect(bodies[1]).not.toContain(sms.FIRST_CALL_CELEBRATION_PREFIX);

    await h.db.flush(); await rm(h.path, { force: true });
  });
});
