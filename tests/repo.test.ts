import { describe, it, expect } from "vitest";
import { rm } from "node:fs/promises";
import { escapeLike } from "../src/db/repo.js";

describe("escapeLike helper", () => {
  it("escapes backslashes first, then percent and underscore", () => {
    expect(escapeLike("100%")).toBe("100\\%");
    expect(escapeLike("first_name")).toBe("first\\_name");
    expect(escapeLike("100%_done")).toBe("100\\%\\_done");
    expect(escapeLike("back\\slash")).toBe("back\\\\slash");
    expect(escapeLike("all\\%_chars")).toBe("all\\\\\\%\\_chars");
  });

  it("passes through normal strings unchanged", () => {
    expect(escapeLike("John Smith")).toBe("John Smith");
    expect(escapeLike("O'Brien")).toBe("O'Brien");
  });

  it("handles empty string", () => {
    expect(escapeLike("")).toBe("");
  });
});

describe("password hashing", () => {
  it("hashPassword and verifyPassword round-trip correctly", async () => {
    const { hashPassword, verifyPassword } = await import("../src/db/repo.js");
    const hash = hashPassword("mySecret123");
    expect(hash).toContain(":");
    expect(verifyPassword("mySecret123", hash)).toBe(true);
    expect(verifyPassword("wrongPassword", hash)).toBe(false);
  });

  it("produces different hashes for the same password (random salt)", async () => {
    const { hashPassword } = await import("../src/db/repo.js");
    const hash1 = hashPassword("samePassword");
    const hash2 = hashPassword("samePassword");
    expect(hash1).not.toBe(hash2);
  });

  it("verifyPassword returns false for malformed stored hash", async () => {
    const { verifyPassword } = await import("../src/db/repo.js");
    expect(verifyPassword("test", "nocolon")).toBe(false);
    expect(verifyPassword("test", "")).toBe(false);
  });
});

describe("generateTempPassword", () => {
  it("generates a 10-character alphanumeric string", async () => {
    const { generateTempPassword } = await import("../src/db/repo.js");
    const pw = generateTempPassword();
    expect(pw).toHaveLength(10);
    expect(pw).toMatch(/^[A-Za-z0-9]+$/);
  });

  it("generates unique passwords", async () => {
    const { generateTempPassword } = await import("../src/db/repo.js");
    const passwords = new Set(Array.from({ length: 50 }, () => generateTempPassword()));
    expect(passwords.size).toBe(50);
  });
});

describe("multi-tenant lead isolation", () => {
  it("listLeadsForTenant and getLeadWithCall never leak cross-tenant leads", async () => {
    const { openDb } = await import("../src/db/db.js");
    const { createTenant, upsertCall, upsertLead, listLeadsForTenant, getLeadWithCall } =
      await import("../src/db/repo.js");

    const sqlitePath = `.tmp/test-isolation-${Date.now()}.sqlite`;
    const db = await openDb(sqlitePath);

    const tenantA = createTenant(db, {
      name: "Tenant A Plumbing",
      trade_type: "plumber",
      twilio_number: "+61400000111",
      owner_phone: "+61411111111",
      owner_email: "a@test.local",
      password: "tenant-a-pass"
    });
    const tenantB = createTenant(db, {
      name: "Tenant B Electrical",
      trade_type: "electrician",
      twilio_number: "+61400000222",
      owner_phone: "+61422222222",
      owner_email: "b@test.local",
      password: "tenant-b-pass"
    });

    upsertCall(db, { call_id: "call-a", tenant_id: tenantA.tenant_id, status: "completed" });
    upsertCall(db, { call_id: "call-b", tenant_id: tenantB.tenant_id, status: "completed" });

    upsertLead(db, {
      lead_id: "lead-a",
      tenant_id: tenantA.tenant_id,
      call_id: "call-a",
      name: "Alice",
      phone: "+61410000001",
      address: "Parramatta 2150",
      issue_type: "plumbing",
      issue_summary: "Leaking tap",
      urgency_level: "routine",
      preferred_time: null,
      notes: null,
      confidence: null,
      next_action: null,
      lead_status: "new"
    });
    upsertLead(db, {
      lead_id: "lead-b",
      tenant_id: tenantB.tenant_id,
      call_id: "call-b",
      name: "Bob",
      phone: "+61420000002",
      address: "Chatswood 2067",
      issue_type: "electrical",
      issue_summary: "Power outage",
      urgency_level: "urgent",
      preferred_time: null,
      notes: null,
      confidence: null,
      next_action: null,
      lead_status: "new"
    });

    const tenantALeads = listLeadsForTenant(db, tenantA.tenant_id);
    const tenantBLeads = listLeadsForTenant(db, tenantB.tenant_id);
    expect(tenantALeads.map((l) => l.lead_id)).toEqual(["lead-a"]);
    expect(tenantBLeads.map((l) => l.lead_id)).toEqual(["lead-b"]);

    expect(getLeadWithCall(db, "lead-a", tenantA.tenant_id)?.lead_id).toBe("lead-a");
    expect(getLeadWithCall(db, "lead-a", tenantB.tenant_id)).toBeNull();
    expect(getLeadWithCall(db, "lead-b", tenantA.tenant_id)).toBeNull();

    await db.flush();
    await rm(sqlitePath, { force: true });
  });
});

describe("getTenantsNeedingNudge", () => {
  it("returns tenants with provisioned number but no real calls within time window", async () => {
    const { openDb } = await import("../src/db/db.js");
    const { createTenant, upsertCall, getTenantsNeedingNudge } =
      await import("../src/db/repo.js");

    const sqlitePath = `.tmp/test-nudge-${Date.now()}.sqlite`;
    const db = await openDb(sqlitePath);

    const fresh = createTenant(db, {
      name: "Fresh Plumber", trade_type: "plumber",
      twilio_number: "+61400000501", owner_phone: "+61411111111",
      owner_email: "fresh@test.local", password: "pass1"
    });
    db.run("UPDATE tenants SET payment_status = 'trial' WHERE tenant_id = ?", [fresh.tenant_id]);

    const withCalls = createTenant(db, {
      name: "Active Sparky", trade_type: "electrician",
      twilio_number: "+61400000502", owner_phone: "+61422222222",
      owner_email: "active@test.local", password: "pass2"
    });
    db.run("UPDATE tenants SET payment_status = 'trial' WHERE tenant_id = ?", [withCalls.tenant_id]);
    upsertCall(db, { call_id: "nudge-call-1", tenant_id: withCalls.tenant_id, status: "completed" });

    const pending = createTenant(db, {
      name: "Pending Painter", trade_type: "painter",
      twilio_number: "+PENDING_999999", owner_phone: "+61433333333",
      owner_email: "pending@test.local", password: "pass3"
    });
    db.run("UPDATE tenants SET payment_status = 'trial' WHERE tenant_id = ?", [pending.tenant_id]);

    const results = getTenantsNeedingNudge(db, 0, 60 * 60 * 1000);
    const ids = results.map(r => r.tenant_id);
    expect(ids).toContain(fresh.tenant_id);
    expect(ids).not.toContain(withCalls.tenant_id);
    expect(ids).not.toContain(pending.tenant_id);

    await db.flush();
    await rm(sqlitePath, { force: true });
  });

  it("still returns tenant that only has demo calls (demo calls do not count)", async () => {
    const { openDb } = await import("../src/db/db.js");
    const { createTenant, upsertCall, getTenantsNeedingNudge } =
      await import("../src/db/repo.js");

    const sqlitePath = `.tmp/test-nudge-demo-${Date.now()}.sqlite`;
    const db = await openDb(sqlitePath);

    const tenant = createTenant(db, {
      name: "Demo Plumber", trade_type: "plumber",
      twilio_number: "+61400000503", owner_phone: "+61411111112",
      owner_email: "demoplumber@test.local", password: "pass1b"
    });
    db.run("UPDATE tenants SET payment_status = 'trial' WHERE tenant_id = ?", [tenant.tenant_id]);
    upsertCall(db, { call_id: "nudge-demo-1", tenant_id: tenant.tenant_id, status: "completed", is_demo: 1 });

    const results = getTenantsNeedingNudge(db, 0, 60 * 60 * 1000);
    expect(results.map(r => r.tenant_id)).toContain(tenant.tenant_id);

    await db.flush();
    await rm(sqlitePath, { force: true });
  });

  it("excludes tenants outside the time window", async () => {
    const { openDb } = await import("../src/db/db.js");
    const { createTenant, getTenantsNeedingNudge } =
      await import("../src/db/repo.js");

    const sqlitePath = `.tmp/test-nudge-window-${Date.now()}.sqlite`;
    const db = await openDb(sqlitePath);

    const tenant = createTenant(db, {
      name: "Old Tenant", trade_type: "plumber",
      twilio_number: "+61400000601", owner_phone: "+61444444444",
      owner_email: "old@test.local", password: "pass4"
    });
    db.run("UPDATE tenants SET payment_status = 'trial' WHERE tenant_id = ?", [tenant.tenant_id]);

    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    db.run("UPDATE tenants SET created_at = ? WHERE tenant_id = ?", [twoHoursAgo, tenant.tenant_id]);

    const results = getTenantsNeedingNudge(db, 0, 60 * 60 * 1000);
    expect(results.map(r => r.tenant_id)).not.toContain(tenant.tenant_id);

    await db.flush();
    await rm(sqlitePath, { force: true });
  });
});

describe("tenantHasCalls", () => {
  it("returns false when tenant has no calls", async () => {
    const { openDb } = await import("../src/db/db.js");
    const { createTenant, tenantHasCalls } = await import("../src/db/repo.js");

    const sqlitePath = `.tmp/test-has-calls-${Date.now()}.sqlite`;
    const db = await openDb(sqlitePath);

    const tenant = createTenant(db, {
      name: "No Calls", trade_type: "plumber",
      twilio_number: "+61400000701", owner_phone: "+61455555555",
      owner_email: "nocalls@test.local", password: "pass5"
    });

    expect(tenantHasCalls(db, tenant.tenant_id)).toBe(false);

    await db.flush();
    await rm(sqlitePath, { force: true });
  });

  it("returns true when tenant has a call with non-null status", async () => {
    const { openDb } = await import("../src/db/db.js");
    const { createTenant, upsertCall, tenantHasCalls } = await import("../src/db/repo.js");

    const sqlitePath = `.tmp/test-has-calls2-${Date.now()}.sqlite`;
    const db = await openDb(sqlitePath);

    const tenant = createTenant(db, {
      name: "Has Calls", trade_type: "plumber",
      twilio_number: "+61400000702", owner_phone: "+61466666666",
      owner_email: "hascalls@test.local", password: "pass6"
    });
    upsertCall(db, { call_id: "hc-call-1", tenant_id: tenant.tenant_id, status: "completed" });

    expect(tenantHasCalls(db, tenant.tenant_id)).toBe(true);

    await db.flush();
    await rm(sqlitePath, { force: true });
  });

  it("returns false when tenant only has calls with null status", async () => {
    const { openDb } = await import("../src/db/db.js");
    const { createTenant, upsertCall, tenantHasCalls } = await import("../src/db/repo.js");

    const sqlitePath = `.tmp/test-has-calls3-${Date.now()}.sqlite`;
    const db = await openDb(sqlitePath);

    const tenant = createTenant(db, {
      name: "Null Status", trade_type: "plumber",
      twilio_number: "+61400000703", owner_phone: "+61477777777",
      owner_email: "nullstatus@test.local", password: "pass7"
    });
    upsertCall(db, { call_id: "ns-call-1", tenant_id: tenant.tenant_id });

    expect(tenantHasCalls(db, tenant.tenant_id)).toBe(false);

    await db.flush();
    await rm(sqlitePath, { force: true });
  });

  it("returns false when tenant only has demo calls", async () => {
    const { openDb } = await import("../src/db/db.js");
    const { createTenant, upsertCall, tenantHasCalls } = await import("../src/db/repo.js");

    const sqlitePath = `.tmp/test-has-calls-demo-${Date.now()}.sqlite`;
    const db = await openDb(sqlitePath);

    const tenant = createTenant(db, {
      name: "Demo Only", trade_type: "plumber",
      twilio_number: "+61400000704", owner_phone: "+61477777778",
      owner_email: "demoonly@test.local", password: "pass7b"
    });
    upsertCall(db, { call_id: "demo-call-1", tenant_id: tenant.tenant_id, status: "completed", is_demo: 1 });

    expect(tenantHasCalls(db, tenant.tenant_id)).toBe(false);

    await db.flush();
    await rm(sqlitePath, { force: true });
  });

  it("returns true when tenant has real call alongside demo calls", async () => {
    const { openDb } = await import("../src/db/db.js");
    const { createTenant, upsertCall, tenantHasCalls } = await import("../src/db/repo.js");

    const sqlitePath = `.tmp/test-has-calls-mixed-${Date.now()}.sqlite`;
    const db = await openDb(sqlitePath);

    const tenant = createTenant(db, {
      name: "Mixed Demo Real", trade_type: "plumber",
      twilio_number: "+61400000705", owner_phone: "+61477777779",
      owner_email: "mixeddr@test.local", password: "pass7c"
    });
    upsertCall(db, { call_id: "mix-demo-1", tenant_id: tenant.tenant_id, status: "completed", is_demo: 1 });
    upsertCall(db, { call_id: "mix-real-1", tenant_id: tenant.tenant_id, status: "completed", is_demo: 0 });

    expect(tenantHasCalls(db, tenant.tenant_id)).toBe(true);

    await db.flush();
    await rm(sqlitePath, { force: true });
  });
});

describe("getTenantCallCount", () => {
  it("returns 0 for tenant with no calls", async () => {
    const { openDb } = await import("../src/db/db.js");
    const { createTenant, getTenantCallCount } = await import("../src/db/repo.js");

    const sqlitePath = `.tmp/test-call-count-${Date.now()}.sqlite`;
    const db = await openDb(sqlitePath);

    const tenant = createTenant(db, {
      name: "Zero Calls", trade_type: "plumber",
      twilio_number: "+61400000801", owner_phone: "+61488888888",
      owner_email: "zerocalls@test.local", password: "pass8"
    });

    expect(getTenantCallCount(db, tenant.tenant_id)).toBe(0);

    await db.flush();
    await rm(sqlitePath, { force: true });
  });

  it("counts only calls with non-null status", async () => {
    const { openDb } = await import("../src/db/db.js");
    const { createTenant, upsertCall, getTenantCallCount } = await import("../src/db/repo.js");

    const sqlitePath = `.tmp/test-call-count2-${Date.now()}.sqlite`;
    const db = await openDb(sqlitePath);

    const tenant = createTenant(db, {
      name: "Mixed Calls", trade_type: "plumber",
      twilio_number: "+61400000802", owner_phone: "+61499999999",
      owner_email: "mixed@test.local", password: "pass9"
    });
    upsertCall(db, { call_id: "cc-call-1", tenant_id: tenant.tenant_id, status: "completed" });
    upsertCall(db, { call_id: "cc-call-2", tenant_id: tenant.tenant_id, status: "completed" });
    upsertCall(db, { call_id: "cc-call-3", tenant_id: tenant.tenant_id }); // null status

    expect(getTenantCallCount(db, tenant.tenant_id)).toBe(2);

    await db.flush();
    await rm(sqlitePath, { force: true });
  });

  it("excludes demo calls from count", async () => {
    const { openDb } = await import("../src/db/db.js");
    const { createTenant, upsertCall, getTenantCallCount } = await import("../src/db/repo.js");

    const sqlitePath = `.tmp/test-call-count-demo-${Date.now()}.sqlite`;
    const db = await openDb(sqlitePath);

    const tenant = createTenant(db, {
      name: "Demo Tenant", trade_type: "plumber",
      twilio_number: "+61400000803", owner_phone: "+61400000003",
      owner_email: "demot@test.local", password: "pass9b"
    });
    upsertCall(db, { call_id: "cc-real-1", tenant_id: tenant.tenant_id, status: "completed", is_demo: 0 });
    upsertCall(db, { call_id: "cc-demo-1", tenant_id: tenant.tenant_id, status: "completed", is_demo: 1 });
    upsertCall(db, { call_id: "cc-demo-2", tenant_id: tenant.tenant_id, status: "in-progress", is_demo: 1 });

    expect(getTenantCallCount(db, tenant.tenant_id)).toBe(1);

    await db.flush();
    await rm(sqlitePath, { force: true });
  });
});

describe("stats queries (calls_answered, businesses_served)", () => {
  it("counts only completed non-demo calls and active non-PENDING tenants", async () => {
    const { openDb } = await import("../src/db/db.js");
    const { createTenant, upsertCall } = await import("../src/db/repo.js");

    const sqlitePath = `.tmp/test-stats-${Date.now()}.sqlite`;
    const db = await openDb(sqlitePath);

    createTenant(db, {
      name: "Active Plumber", trade_type: "plumber",
      twilio_number: "+61400000901", owner_phone: "+61411000001",
      owner_email: "active1@test.local", password: "pass10"
    });
    createTenant(db, {
      name: "Active Sparky", trade_type: "electrician",
      twilio_number: "+61400000902", owner_phone: "+61411000002",
      owner_email: "active2@test.local", password: "pass11"
    });
    createTenant(db, {
      name: "Pending Biz", trade_type: "painter",
      twilio_number: "+PENDING_123456", owner_phone: "+61411000003",
      owner_email: "pending@test.local", password: "pass12"
    });
    const inactiveTenant = createTenant(db, {
      name: "Inactive Biz", trade_type: "roofer",
      twilio_number: "+61400000903", owner_phone: "+61411000004",
      owner_email: "inactive@test.local", password: "pass13"
    });
    db.run("UPDATE tenants SET active = 0 WHERE tenant_id = ?", [inactiveTenant.tenant_id]);

    upsertCall(db, { call_id: "stats-call-1", tenant_id: "any", status: "completed" });
    upsertCall(db, { call_id: "stats-call-2", tenant_id: "any", status: "completed" });
    upsertCall(db, { call_id: "stats-call-3", tenant_id: "any" }); // null status — excluded
    upsertCall(db, { call_id: "stats-call-4", tenant_id: "any", status: "completed", is_demo: 1 }); // demo — excluded
    upsertCall(db, { call_id: "stats-call-5", tenant_id: "any", status: "in-progress" }); // not completed — excluded

    const totalCalls = db.get<{ n: number }>("SELECT COUNT(*) AS n FROM calls WHERE status = 'completed' AND is_demo = 0")?.n ?? 0;
    const totalTenants = db.get<{ n: number }>(
      "SELECT COUNT(*) AS n FROM tenants WHERE active = 1 AND twilio_number NOT LIKE '+PENDING%'"
    )?.n ?? 0;

    expect(totalCalls).toBe(2);
    expect(totalTenants).toBe(2);

    await db.flush();
    await rm(sqlitePath, { force: true });
  });
});

describe("daily funnel stats", () => {
  it("aggregates calls, leads, sms and demo metrics by day", async () => {
    const { openDb } = await import("../src/db/db.js");
    const {
      createTenant,
      upsertCall,
      upsertLead,
      createNotification,
      markNotification,
      createAnalyticsEvent,
      getDailyFunnelStats
    } = await import("../src/db/repo.js");

    const sqlitePath = `.tmp/test-funnel-${Date.now()}.sqlite`;
    const db = await openDb(sqlitePath);

    const tenant = createTenant(db, {
      name: "Funnel Tenant",
      trade_type: "plumber",
      twilio_number: "+61400000333",
      owner_phone: "+61433333333",
      owner_email: "funnel@test.local",
      password: "funnel-pass"
    });

    const day = new Date().toISOString().slice(0, 10);
    const ts = `${day}T10:00:00.000Z`;

    upsertCall(db, { call_id: "f-call-1", tenant_id: tenant.tenant_id, started_at: ts, status: "completed" });
    upsertCall(db, { call_id: "f-call-2", tenant_id: tenant.tenant_id, started_at: ts, status: "completed" });

    upsertLead(db, {
      lead_id: "f-lead-1",
      tenant_id: tenant.tenant_id,
      call_id: "f-call-1",
      name: "Alice",
      phone: "+61410000001",
      address: "Parramatta 2150",
      issue_type: "plumbing",
      issue_summary: "Leaking tap",
      urgency_level: "urgent",
      preferred_time: null,
      notes: null,
      confidence: null,
      next_action: null,
      lead_status: "new",
      created_at: ts
    });
    // Captured but incomplete (missing urgency_level)
    upsertLead(db, {
      lead_id: "f-lead-2",
      tenant_id: tenant.tenant_id,
      call_id: "f-call-2",
      name: "Bob",
      phone: "+61420000002",
      address: "Chatswood 2067",
      issue_type: "plumbing",
      issue_summary: "Blocked drain",
      urgency_level: null,
      preferred_time: null,
      notes: null,
      confidence: null,
      next_action: null,
      lead_status: "new",
      created_at: ts
    });

    const notifSent = createNotification(db, "f-call-1", "sms");
    const notifSkipped = createNotification(db, "f-call-2", "sms");
    markNotification(db, notifSent, { status: "sent", sent_at: ts });
    markNotification(db, notifSkipped, { status: "skipped", sent_at: ts, error: "no_sender" });

    createAnalyticsEvent(db, {
      event_name: "simulate_demo_started",
      tenant_id: tenant.tenant_id,
      payload_json: "{}"
    });
    createAnalyticsEvent(db, {
      event_name: "demo_recording_ready",
      tenant_id: tenant.tenant_id,
      payload_json: "{}"
    });

    const stats = getDailyFunnelStats(db, 1);
    expect(stats).toHaveLength(1);
    const row = stats[0];
    expect(row.day).toBe(day);
    expect(row.calls_started).toBe(2);
    expect(row.leads_captured).toBe(2);
    expect(row.complete_captures).toBe(1);
    expect(row.sms_total).toBe(2);
    expect(row.sms_sent).toBe(1);
    expect(row.demos_started).toBeGreaterThanOrEqual(1);
    expect(row.demo_recordings_ready).toBeGreaterThanOrEqual(1);

    await db.flush();
    await rm(sqlitePath, { force: true });
  });
});
