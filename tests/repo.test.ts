import { describe, it, expect } from "vitest";
import { rm } from "node:fs/promises";

// We test the escapeLike logic and pure functions without needing a real DB.
// For DB-dependent tests we'd need to import the db module, but these unit tests
// focus on the logic that can be tested in isolation.

describe("escapeLike helper (inline verification)", () => {
  function escapeLike(s: string): string {
    return s.replace(/%/g, "\\%").replace(/_/g, "\\_");
  }

  it("escapes percent signs", () => {
    expect(escapeLike("100%")).toBe("100\\%");
  });

  it("escapes underscores", () => {
    expect(escapeLike("first_name")).toBe("first\\_name");
  });

  it("escapes both in combination", () => {
    expect(escapeLike("100%_done")).toBe("100\\%\\_done");
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
