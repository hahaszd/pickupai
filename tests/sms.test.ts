import { describe, it, expect } from "vitest";
import { formatOwnerSms, NO_SMS_INTENTS } from "../src/twilio/sms.js";
import type { LeadRow } from "../src/db/repo.js";

function makeLead(overrides: Partial<LeadRow> = {}): LeadRow {
  return {
    lead_id: "test-lead-1",
    tenant_id: "tenant-1",
    call_id: "call-1",
    name: "Sarah Jones",
    phone: "+61412345678",
    address: "42 Smith St, Parramatta NSW 2150",
    issue_type: "burst pipe",
    issue_summary: "Kitchen pipe burst, water everywhere",
    urgency_level: "emergency",
    preferred_time: "ASAP",
    notes: null,
    confidence: 0.95,
    next_action: "Call back within 1 hour",
    lead_status: "new",
    created_at: new Date().toISOString(),
    ...overrides
  };
}

describe("formatOwnerSms", () => {
  it("formats a new_job lead with urgency in header", () => {
    const result = formatOwnerSms({
      lead: makeLead(),
      callId: "call-123",
      callerIntent: "new_job"
    });
    expect(result).toContain("NEW JOB (EMERGENCY):");
    expect(result).toContain("Name: Sarah Jones");
    expect(result).toContain("Phone: +61412345678");
    expect(result).toContain("Address: 42 Smith St, Parramatta NSW 2150");
    expect(result).toContain("Details: Kitchen pipe burst, water everywhere");
    expect(result).toContain("Preferred time: ASAP");
    expect(result).toContain("Next: Call back within 1 hour");
    expect(result).toContain("CallId: call-123");
  });

  it("formats a follow_up intent correctly", () => {
    const result = formatOwnerSms({
      lead: makeLead({ urgency_level: "routine" }),
      callId: "call-456",
      callerIntent: "follow_up"
    });
    expect(result).toContain("FOLLOW-UP:");
    expect(result).not.toContain("ROUTINE");
  });

  it("formats a complaint intent", () => {
    const result = formatOwnerSms({
      lead: makeLead(),
      callId: "call-789",
      callerIntent: "complaint"
    });
    expect(result).toMatch(/^COMPLAINT/);
  });

  it("falls back to CALL for unknown intent", () => {
    const result = formatOwnerSms({
      lead: makeLead(),
      callId: "call-101",
      callerIntent: "something_weird"
    });
    expect(result).toContain("CALL [something_weird]:");
  });

  it("uses CALL header when callerIntent is null", () => {
    const result = formatOwnerSms({
      lead: makeLead(),
      callId: "call-102",
      callerIntent: null
    });
    expect(result).toMatch(/^CALL:/);
  });

  it("omits null/empty fields", () => {
    const result = formatOwnerSms({
      lead: makeLead({ address: null, preferred_time: null, notes: null, next_action: null }),
      callId: "call-103",
      callerIntent: "new_job"
    });
    expect(result).not.toContain("Address:");
    expect(result).not.toContain("Preferred time:");
    expect(result).not.toContain("Next:");
  });
});

describe("NO_SMS_INTENTS", () => {
  it("includes all non-customer call types", () => {
    expect(NO_SMS_INTENTS.has("wrong_number")).toBe(true);
    expect(NO_SMS_INTENTS.has("spam")).toBe(true);
    expect(NO_SMS_INTENTS.has("telemarketer")).toBe(true);
    expect(NO_SMS_INTENTS.has("silent")).toBe(true);
    expect(NO_SMS_INTENTS.has("abusive")).toBe(true);
  });

  it("does not include legitimate intents", () => {
    expect(NO_SMS_INTENTS.has("new_job")).toBe(false);
    expect(NO_SMS_INTENTS.has("follow_up")).toBe(false);
    expect(NO_SMS_INTENTS.has("complaint")).toBe(false);
    expect(NO_SMS_INTENTS.has("quote_only")).toBe(false);
  });
});
