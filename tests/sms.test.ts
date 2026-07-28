import { describe, it, expect, vi } from "vitest";
import { formatOwnerSms, NO_SMS_INTENTS, generateForwardingCode, FIRST_CALL_CELEBRATION_PREFIX, buildCallerConfirmationSms } from "../src/twilio/sms.js";
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
    job_value: null,
    job_size: null,
    property_type: null,
    caller_sentiment: null,
    created_at: new Date().toISOString(),
    ...overrides
  };
}

describe("formatOwnerSms", () => {
  it("formats a new_job lead (no dashboardUrl)", () => {
    const result = formatOwnerSms({
      lead: makeLead(),
      callId: "call-123",
      callerIntent: "new_job"
    });
    // The header carries no urgency grade any more, whatever the lead says.
    expect(result).toContain("NEW JOB:");
    expect(result).not.toContain("EMERGENCY");
    // Name and number share a line now, unlabelled: that pair is the callback
    // and the whole reason the message exists.
    expect(result).toContain("Sarah Jones  0412 345 678");
    expect(result).toContain("42 Smith St, Parramatta NSW 2150");
    expect(result).toContain("Kitchen pipe burst, water everywhere");
    expect(result).toContain("Wants: ASAP");
    expect(result).toContain("> Call back within 1 hour");
    expect(result).not.toContain("CallId:");
    expect(result).not.toContain("View:");
  });

  it("includes View URL using lead_id when dashboardUrl is provided", () => {
    const result = formatOwnerSms({
      lead: makeLead({ lead_id: "lead-abc" }),
      callId: "call-123",
      callerIntent: "new_job",
      dashboardUrl: "https://www.getpickupai.com.au"
    });
    // The scheme is dropped: 8 characters of every message, and phones link
    // a bare domain anyway.
    expect(result).toContain("www.getpickupai.com.au/dashboard/leads/lead-abc");
    expect(result).not.toContain("https://");
    expect(result).not.toContain("call-123");
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
    expect(result).not.toContain("Wants:");
    expect(result).not.toContain("Next:");
  });
});

describe("notes reach the owner", () => {
  // notes was collected by the assistant and rendered nowhere. The worst case
  // was a voicemail: the owner got "VOICEMAIL:" plus a name and a number, and
  // not one word of what the caller actually said.
  it("puts the voicemail message in the text", () => {
    const result = formatOwnerSms({
      lead: makeLead({
        issue_summary: null,
        notes: "Voicemail: Hi it's Sandra from unit 4, the hot water's out again, please call me back this arvo."
      }),
      callId: "call-vm",
      callerIntent: "voicemail"
    });
    expect(result).toContain("VOICEMAIL");
    expect(result).toContain("Msg: Voicemail: Hi it's Sandra from unit 4");
    expect(result).toContain("the hot water's out again");
  });

  it("gives a voicemail more room than a supplementary note", () => {
    const long = "x".repeat(400);
    const vm = formatOwnerSms({ lead: makeLead({ notes: long }), callId: "c", callerIntent: "voicemail" });
    const job = formatOwnerSms({ lead: makeLead({ notes: long }), callId: "c", callerIntent: "new_job" });
    expect(vm.length).toBeGreaterThan(job.length);
    expect(vm).toContain("Msg: ");
    expect(job).toContain("Notes: ");
  });

  it("carries an insurance claim number through on a normal job", () => {
    const result = formatOwnerSms({
      lead: makeLead({ notes: "Insurer NRMA, claim CL-7740291, assessor already attended." }),
      callId: "call-ins",
      callerIntent: "new_job"
    });
    expect(result).toContain("Notes: Insurer NRMA, claim CL-7740291");
  });

  it("does not repeat a note already inside the issue summary", () => {
    // The prompt tells the model to record insurance details "in issue_summary
    // or notes", so the same text can arrive in both.
    const shared = "Insurer NRMA, claim CL-7740291";
    const result = formatOwnerSms({
      lead: makeLead({ issue_summary: `Storm damage to downpipe. ${shared}.`, notes: shared }),
      callId: "call-dupe",
      callerIntent: "new_job"
    });
    expect(result).not.toContain("Notes:");
    expect(result).toContain("Storm damage to downpipe.");
  });

  it("adds nothing when there are no notes", () => {
    const result = formatOwnerSms({ lead: makeLead({ notes: null }), callId: "c", callerIntent: "new_job" });
    expect(result).not.toContain("Notes:");
    expect(result).not.toContain("Msg:");
  });

  it("keeps the partial-capture warning distinguishable from a note", () => {
    const result = formatOwnerSms({
      lead: makeLead({ name: null, notes: "Audio unclear for part of the call." }),
      callId: "c",
      callerIntent: "new_job"
    });
    expect(result).toContain("Notes: Audio unclear");
    expect(result).toContain("[partial - check the recording]");
  });
});

describe("forwarding code generation", () => {
  it("strips the + from an E.164 AU mobile number", () => {
    const code = generateForwardingCode("+61468000835");
    expect(code).toBe("**61*61468000835*11*20#");
    expect(code).not.toContain("+");
  });

  it("strips the + from an E.164 AU landline number", () => {
    const code = generateForwardingCode("+61280000796");
    expect(code).toBe("**61*61280000796*11*20#");
  });

  it("handles a number without + prefix gracefully", () => {
    const code = generateForwardingCode("61400000000");
    expect(code).toBe("**61*61400000000*11*20#");
  });

  it("produces correct format with star separators", () => {
    const code = generateForwardingCode("+61412345678");
    expect(code).toMatch(/^\*\*61\*\d+\*11\*20#$/);
  });
});

describe("first-call celebration prefix", () => {
  it("prepends celebration prefix when isFirstCall is true", () => {
    const body = formatOwnerSms({
      lead: makeLead(),
      callId: "call-first",
      callerIntent: "new_job"
    });
    const combined = FIRST_CALL_CELEBRATION_PREFIX + body;
    expect(combined).toMatch(/^\[FIRST CALL\]/);
    expect(combined).toContain("Your first real call");
    expect(combined).toContain("NEW JOB");
    expect(combined).toContain("Sarah Jones");
  });

  it("does not add prefix when isFirstCall is false", () => {
    const body = formatOwnerSms({
      lead: makeLead(),
      callId: "call-second",
      callerIntent: "new_job"
    });
    const combined = "" + body;
    expect(combined).not.toContain("first real call");
    expect(combined).toMatch(/^NEW JOB/);
  });

  it("combined body is well-formed with newline separation", () => {
    const body = formatOwnerSms({
      lead: makeLead(),
      callId: "call-combined",
      callerIntent: "new_job"
    });
    const combined = FIRST_CALL_CELEBRATION_PREFIX + body;
    const lines = combined.split("\n");
    expect(lines[0]).toBe("[FIRST CALL] Your first real call just came in! PickupAI answered it and here are the details:");
    expect(lines[1]).toBe("");
    expect(lines[2]).toContain("NEW JOB");
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

  // The whole point of adding this intent was that the lead is kept and the
  // owner's phone stays quiet. Nothing pinned the second half until now.
  it("suppresses the owner SMS for a call referred to a water authority or distributor", () => {
    expect(NO_SMS_INTENTS.has("referred_out")).toBe(true);
  });

  it("does not include legitimate intents", () => {
    expect(NO_SMS_INTENTS.has("new_job")).toBe(false);
    expect(NO_SMS_INTENTS.has("follow_up")).toBe(false);
    expect(NO_SMS_INTENTS.has("complaint")).toBe(false);
    expect(NO_SMS_INTENTS.has("quote_only")).toBe(false);
  });
});

describe("buildCallerConfirmationSms", () => {
  it("says 'shortly' during business hours on a weekday", () => {
    const wed10am = new Date("2026-03-25T10:00:00+11:00");
    vi.useFakeTimers();
    vi.setSystemTime(wed10am);
    try {
      const result = buildCallerConfirmationSms({
        businessName: "Dan's Plumbing",
        businessHoursStart: "08:00",
        businessHoursEnd: "17:00",
        timezone: "Australia/Sydney"
      });
      expect(result).toContain("shortly");
      expect(result).not.toContain("Monday");
      expect(result).not.toContain("tomorrow");
    } finally {
      vi.useRealTimers();
    }
  });

  it("says 'first thing tomorrow morning' after hours on a weeknight", () => {
    const wed9pm = new Date("2026-03-25T21:00:00+11:00");
    vi.useFakeTimers();
    vi.setSystemTime(wed9pm);
    try {
      const result = buildCallerConfirmationSms({
        businessName: "Dan's Plumbing",
        businessHoursStart: "08:00",
        businessHoursEnd: "17:00",
        timezone: "Australia/Sydney"
      });
      expect(result).toContain("first thing tomorrow morning");
    } finally {
      vi.useRealTimers();
    }
  });

  it("says 'on Monday morning' on a weekend", () => {
    const sat10am = new Date("2026-03-28T10:00:00+11:00");
    vi.useFakeTimers();
    vi.setSystemTime(sat10am);
    try {
      const result = buildCallerConfirmationSms({
        businessName: "Dan's Plumbing",
        businessHoursStart: "08:00",
        businessHoursEnd: "17:00",
        timezone: "Australia/Sydney"
      });
      expect(result).toContain("on Monday morning");
    } finally {
      vi.useRealTimers();
    }
  });

  it("includes issue ref when provided", () => {
    const result = buildCallerConfirmationSms({
      businessName: "Sparky Electrical",
      issueType: "flickering lights"
    });
    expect(result).toContain("about your flickering lights");
  });

  it("truncates long issue summary to 40 chars", () => {
    const result = buildCallerConfirmationSms({
      businessName: "Test Biz",
      issueSummary: "A very long description of the plumbing emergency that goes on and on"
    });
    expect(result).toContain("about your A very long description of the plumbi...");
  });

  it("uses plain hyphen (not em dash) for GSM encoding", () => {
    const result = buildCallerConfirmationSms({ businessName: "Test" });
    expect(result).not.toContain("\u2014");
    expect(result).not.toContain("\u2013");
    expect(result).toContain("- Test");
  });

  it("says 'when they're back' in vacation mode", () => {
    const result = buildCallerConfirmationSms({
      businessName: "Dan's Plumbing",
      vacationMode: true
    });
    expect(result).toContain("when they're back");
    expect(result).not.toContain("shortly");
    expect(result).not.toContain("Monday");
    expect(result).not.toContain("tomorrow");
  });

  it("says 'on Monday morning' on Friday evening", () => {
    const fri8pm = new Date("2026-03-27T20:00:00+11:00");
    vi.useFakeTimers();
    vi.setSystemTime(fri8pm);
    try {
      const result = buildCallerConfirmationSms({
        businessName: "Dan's Plumbing",
        businessHoursStart: "08:00",
        businessHoursEnd: "17:00",
        timezone: "Australia/Sydney"
      });
      expect(result).toContain("on Monday morning");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("formatOwnerSms degraded-capture note", () => {
  it("shows degraded-capture warning and [PARTIAL] tag for new_job with missing core fields", () => {
    const result = formatOwnerSms({
      lead: makeLead({ name: null, address: null, urgency_level: null }),
      callId: "call-deg",
      callerIntent: "new_job"
    });
    expect(result).toContain("[partial - check the recording]");
    expect(result).toContain("[PARTIAL]");
    expect(result.split("\n")[0]).toContain("[PARTIAL]");
  });

  it("does NOT show degraded-capture warning or [PARTIAL] for non-new_job intents", () => {
    const result = formatOwnerSms({
      lead: makeLead({ name: null, address: null, urgency_level: null }),
      callId: "call-deg2",
      callerIntent: "follow_up"
    });
    expect(result).not.toContain("[partial - check the recording]");
    expect(result).not.toContain("[PARTIAL]");
  });

  it("does NOT show degraded-capture warning or [PARTIAL] when all core fields present", () => {
    const result = formatOwnerSms({
      lead: makeLead(),
      callId: "call-full",
      callerIntent: "new_job"
    });
    expect(result).not.toContain("[partial - check the recording]");
    expect(result).not.toContain("[PARTIAL]");
  });

  it("truncates the issue summary to 80 chars", () => {
    const longSummary = "A".repeat(200);
    const result = formatOwnerSms({
      lead: makeLead({ issue_summary: longSummary }),
      callId: "call-trunc",
      callerIntent: "new_job"
    });
    // Unlabelled and trimmed to 80 now: enough to know what the job is,
    // with the full text on the lead page.
    const summaryLine = result.split("\n").find((l: string) => l.startsWith("AAA"));
    expect(summaryLine).toBeDefined();
    expect(summaryLine!.length).toBeLessThanOrEqual(80);
    expect(summaryLine).toContain("...");
  });

  it("truncates the address to 60 chars", () => {
    const longAddress = "B".repeat(150);
    const result = formatOwnerSms({
      lead: makeLead({ address: longAddress }),
      callId: "call-trunc-addr",
      callerIntent: "new_job"
    });
    const addressLine = result.split("\n").find((l: string) => l.startsWith("BBB"));
    expect(addressLine).toBeDefined();
    expect(addressLine!.length).toBeLessThanOrEqual(60);
    expect(addressLine).toContain("...");
  });

  it("formats supplier intent header", () => {
    const result = formatOwnerSms({
      lead: makeLead(),
      callId: "call-sup",
      callerIntent: "supplier"
    });
    expect(result).toMatch(/^SUPPLIER CALL:/);
  });

  it("formats trade_referral intent header", () => {
    const result = formatOwnerSms({
      lead: makeLead(),
      callId: "call-ref",
      callerIntent: "trade_referral"
    });
    expect(result).toMatch(/^REFERRAL:/);
  });

  it("formats job_applicant intent header", () => {
    const result = formatOwnerSms({
      lead: makeLead(),
      callId: "call-app",
      callerIntent: "job_applicant"
    });
    expect(result).toMatch(/^JOB APPLICANT:/);
  });

  it("formats reschedule intent header", () => {
    const result = formatOwnerSms({
      lead: makeLead(),
      callId: "call-resched",
      callerIntent: "reschedule"
    });
    expect(result).toMatch(/^RESCHEDULE:/);
  });

  it("formats quote_only intent header", () => {
    const result = formatOwnerSms({
      lead: makeLead(),
      callId: "call-quote",
      callerIntent: "quote_only"
    });
    expect(result).toMatch(/^QUOTE REQUEST:/);
  });

  it("formats cancellation intent header", () => {
    const result = formatOwnerSms({
      lead: makeLead(),
      callId: "call-cancel",
      callerIntent: "cancellation"
    });
    expect(result).toMatch(/^CANCELLATION:/);
  });

  it("formats voicemail intent header", () => {
    const result = formatOwnerSms({
      lead: makeLead(),
      callId: "call-vm",
      callerIntent: "voicemail"
    });
    expect(result).toMatch(/^VOICEMAIL:/);
  });

  // A missing urgency stopped meaning anything on 2026-07-28: the field is no
  // longer collected, so it cannot make a capture partial. What still makes one
  // partial is a missing name or address.
  it("no longer counts a missing urgency as a partial capture", () => {
    const result = formatOwnerSms({
      lead: makeLead({ urgency_level: null }),
      callId: "call-no-urg",
      callerIntent: "new_job"
    });
    expect(result).toMatch(/^NEW JOB:/);
    expect(result).not.toContain("[PARTIAL]");
  });

  it("still flags a partial capture when the name is missing", () => {
    const result = formatOwnerSms({
      lead: makeLead({ name: null, urgency_level: null }),
      callId: "call-no-name",
      callerIntent: "new_job"
    });
    expect(result).toMatch(/^NEW JOB \[PARTIAL\]:/);
  });

  it("formats SMS for completely empty lead", () => {
    const result = formatOwnerSms({
      lead: makeLead({
        name: null,
        phone: null,
        address: null,
        issue_summary: null,
        urgency_level: null,
        preferred_time: null,
        next_action: null
      }),
      callId: "call-empty",
      callerIntent: "unknown"
    });
    expect(result).toMatch(/^CALL:/);
    expect(result).not.toContain("Name:");
    expect(result).not.toContain("Phone:");
    expect(result).not.toContain("Address:");
    expect(result).not.toContain("Details:");
  });
});

describe("formatOwnerSms — enhanced fields", () => {
  it("includes sentiment tag for frustrated caller", () => {
    const result = formatOwnerSms({
      lead: makeLead({ caller_sentiment: "frustrated" }),
      callId: "call-frust",
      callerIntent: "new_job"
    });
    expect(result).toContain("[FRUSTRATED]");
  });

  it("includes sentiment tag for distressed caller", () => {
    const result = formatOwnerSms({
      lead: makeLead({ caller_sentiment: "distressed" }),
      callId: "call-dist",
      callerIntent: "complaint"
    });
    expect(result).toContain("[DISTRESSED]");
  });

  it("includes sentiment tag for rushed caller", () => {
    const result = formatOwnerSms({
      lead: makeLead({ caller_sentiment: "rushed" }),
      callId: "call-rush",
      callerIntent: "new_job"
    });
    expect(result).toContain("[RUSHED]");
  });

  it("does not include sentiment tag for positive or neutral", () => {
    const positive = formatOwnerSms({
      lead: makeLead({ caller_sentiment: "positive" }),
      callId: "call-pos",
      callerIntent: "new_job"
    });
    expect(positive).not.toContain("[POSITIVE]");

    const neutral = formatOwnerSms({
      lead: makeLead({ caller_sentiment: "neutral" }),
      callId: "call-neut",
      callerIntent: "new_job"
    });
    expect(neutral).not.toContain("[NEUTRAL]");
  });

  it("leaves property type out of the SMS", () => {
    const result = formatOwnerSms({
      lead: makeLead({ property_type: "commercial" }),
      callId: "call-prop",
      callerIntent: "new_job"
    });
    // Deliberately dropped from the SMS: judgement context, not an
    // instruction. Every character costs money and it is on the lead page.
    expect(result).not.toContain("Property:");
    expect(result).not.toContain("commercial");
  });

  it("omits property type when null", () => {
    const result = formatOwnerSms({
      lead: makeLead({ property_type: null }),
      callId: "call-noprop",
      callerIntent: "new_job"
    });
    expect(result).not.toContain("Property:");
  });

  it("leaves job scope out of the SMS", () => {
    const result = formatOwnerSms({
      lead: makeLead({ job_size: "large" }),
      callId: "call-jv",
      callerIntent: "new_job"
    });
    // Also dropped - the assistant's size estimate is not an action.
    expect(result).not.toContain("Scope:");
  });
});

describe("buildCallerConfirmationSms — enhanced features", () => {
  it("includes caller name when provided", () => {
    const result = buildCallerConfirmationSms({
      businessName: "Dan's Plumbing",
      callerName: "Sarah"
    });
    expect(result).toContain("Hi Sarah!");
  });

  it("uses generic greeting when no caller name", () => {
    const result = buildCallerConfirmationSms({
      businessName: "Dan's Plumbing",
      callerName: null
    });
    expect(result).toMatch(/^Thanks for calling/);
    expect(result).not.toContain("Hi !");
  });

  // The caller SMS used to promise "as a priority" on an emergency-tagged lead.
  // Removed with the urgency machinery on 2026-07-28, and it was a promise
  // nothing downstream could keep. This pins the removal.
  it("never promises priority handling, whatever the job", () => {
    const result = buildCallerConfirmationSms({
      businessName: "Dan's Plumbing",
      issueSummary: "Gas smell near the hot water unit, caller evacuating"
    });
    expect(result).not.toContain("as a priority");
  });

  // The "text photos of the issue to this number" line was deliberately
  // removed (commit e39e3f3): outbound SMS goes out under an alphanumeric
  // sender ID, which cannot receive replies, so the invitation was a dead end
  // for the caller. These tests lock that removal in.
  it("does not invite the caller to reply with photos (trade-specific)", () => {
    const result = buildCallerConfirmationSms({
      businessName: "Dan's Plumbing",
      tradeType: "plumber"
    });
    expect(result).not.toContain("photos of the issue");
    expect(result).not.toMatch(/photo/i);
  });

  it("does not invite the caller to reply with photos (no trade type)", () => {
    const result = buildCallerConfirmationSms({
      businessName: "Some Business"
    });
    expect(result).not.toMatch(/photo/i);
  });
});
