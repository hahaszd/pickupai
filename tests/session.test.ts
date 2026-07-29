import { describe, it, expect, vi } from "vitest";
import { resolveTradeKey, TRADE_ALIASES, buildSystemPrompt, buildServiceAreaSection, buildTimeContext } from "../src/realtime/session.js";
import type { TenantRow, LeadRow } from "../src/db/repo.js";

// The `as TenantRow` on the return is needed because spreading a `Partial<T>`
// widens every optional column to `... | undefined`, which TenantRow's
// `... | null` columns reject. The defaults below cover every required field.
function makeTenant(overrides: Partial<TenantRow> = {}): TenantRow {
  return {
    tenant_id: "test-tenant",
    name: "Dan's Plumbing",
    trade_type: "plumber",
    ai_name: "Olivia",
    twilio_number: "+61400000000",
    owner_phone: "+61412345678",
    owner_email: null,
    password_hash: null,
    session_token: null,
    business_hours_start: "08:00",
    business_hours_end: "17:00",
    timezone: "Australia/Sydney",
    enable_warm_transfer: 0,
    service_area: null,
    custom_instructions: null,
    vacation_mode: 0,
    vacation_message: null,
    active: 1,
    created_at: new Date().toISOString(),
    last_login_at: null,
    payment_status: "active",
    trial_ends_at: null,
    stripe_customer_id: null,
    ...overrides
  } as TenantRow;
}

function makeLeadHistory(overrides: Partial<LeadRow> = {}): LeadRow {
  return {
    lead_id: "lead-hist-1",
    tenant_id: "test-tenant",
    call_id: "call-hist-1",
    name: "Jane Smith",
    phone: "+61400111222",
    address: "10 King St, Sydney 2000",
    issue_type: "leaky tap",
    issue_summary: "Kitchen tap dripping constantly",
    urgency_level: "routine",
    preferred_time: null,
    notes: null,
    confidence: 0.9,
    next_action: null,
    lead_status: "new",
    job_value: null,
    job_size: null,
    property_type: null,
    caller_sentiment: null,
    caller_intent: null,
    created_at: "2026-03-20T10:00:00Z",
    ...overrides
  };
}

describe("resolveTradeKey / TRADE_ALIASES", () => {
  it("resolves exact trade types to themselves", () => {
    expect(resolveTradeKey("plumber")).toBe("plumber");
    expect(resolveTradeKey("electrician")).toBe("electrician");
    expect(resolveTradeKey("roofer")).toBe("roofer");
    expect(resolveTradeKey("handyman")).toBe("handyman");
  });

  it("resolves natural language variants to their base trade", () => {
    expect(resolveTradeKey("plumbing")).toBe("plumber");
    expect(resolveTradeKey("electrical")).toBe("electrician");
    expect(resolveTradeKey("roofing")).toBe("roofer");
    expect(resolveTradeKey("carpentry")).toBe("carpenter");
    expect(resolveTradeKey("tiling")).toBe("tiler");
  });

  it("resolves builder aliases to builder, others to handyman", () => {
    expect(resolveTradeKey("builder")).toBe("builder");
    expect(resolveTradeKey("building")).toBe("builder");
    expect(resolveTradeKey("construction")).toBe("builder");
    expect(resolveTradeKey("locksmith")).toBe("handyman");
    expect(resolveTradeKey("landscaper")).toBe("handyman");
    expect(resolveTradeKey("concreter")).toBe("handyman");
    expect(resolveTradeKey("fencer")).toBe("handyman");
    expect(resolveTradeKey("gardener")).toBe("handyman");
  });

  it("is case-insensitive", () => {
    expect(resolveTradeKey("PLUMBER")).toBe("plumber");
    expect(resolveTradeKey("Electrician")).toBe("electrician");
    expect(resolveTradeKey("ROOFING")).toBe("roofer");
  });

  it("trims whitespace", () => {
    expect(resolveTradeKey("  plumber  ")).toBe("plumber");
    expect(resolveTradeKey("  roofing  ")).toBe("roofer");
  });

  it("returns unknown trades as-is (lowercase)", () => {
    expect(resolveTradeKey("glazier")).toBe("glazier");
    expect(resolveTradeKey("HVAC specialist")).toBe("hvac specialist");
  });
});

describe("TRADE_ALIASES completeness", () => {
  const allTargets = new Set(Object.values(TRADE_ALIASES));

  it("all alias targets are valid known trades", () => {
    const knownTrades = ["plumber", "electrician", "roofer", "painter", "carpenter", "tiler", "handyman", "builder"];
    for (const target of allTargets) {
      expect(knownTrades).toContain(target);
    }
  });

  it("all known base trades have at least one alias", () => {
    const tradesWithAliases = new Set(Object.values(TRADE_ALIASES));
    expect(tradesWithAliases.has("plumber")).toBe(true);
    expect(tradesWithAliases.has("electrician")).toBe(true);
    expect(tradesWithAliases.has("roofer")).toBe(true);
    expect(tradesWithAliases.has("painter")).toBe(true);
    expect(tradesWithAliases.has("carpenter")).toBe(true);
    expect(tradesWithAliases.has("tiler")).toBe(true);
    expect(tradesWithAliases.has("handyman")).toBe(true);
    expect(tradesWithAliases.has("builder")).toBe(true);
  });
});

describe("buildSystemPrompt", () => {
  it("includes trade-specific content for a single plumber tenant", () => {
    const prompt = buildSystemPrompt(makeTenant(), [], "+61400111222");
    expect(prompt).toContain("plumbing");
    expect(prompt).toContain("Dan's Plumbing");
    expect(prompt).toContain("Olivia");
    expect(prompt).toContain("# Scope — Out-of-Trade Calls");
    expect(prompt).toContain("specialise in plumbing");
  });

  it("merges intake questions for multi-trade tenant", () => {
    const prompt = buildSystemPrompt(makeTenant({ trade_type: "plumber,electrician" }), [], null);
    expect(prompt).toContain("plumbing and electrical");
    expect(prompt).toContain("# Scope");
    expect(prompt).toContain("Accept enquiries for all of these service types");
    expect(prompt).not.toContain("Out-of-Trade");
  });

  it("includes vacation mode section when vacation_mode is set", () => {
    const prompt = buildSystemPrompt(makeTenant({ vacation_mode: 1 }), [], null);
    expect(prompt).toContain("# Holiday / Vacation Mode");
    expect(prompt).toContain("currently ON HOLIDAY");
    expect(prompt).toContain("Do NOT ask for suburb/postcode");
  });

  it("includes vacation_message when provided", () => {
    const prompt = buildSystemPrompt(
      makeTenant({ vacation_mode: 1, vacation_message: "Back on Jan 15" }),
      [], null
    );
    expect(prompt).toContain("Back on Jan 15");
  });

  it("does not include vacation section when vacation_mode is 0", () => {
    const prompt = buildSystemPrompt(makeTenant({ vacation_mode: 0 }), [], null);
    expect(prompt).not.toContain("Holiday / Vacation Mode");
  });

  // A business being away is a FACT about availability, not a promise about
  // response time, and a caller who is not told it will assume someone is
  // picking this up today. It belongs in the vacation section; the farewell
  // templates promise nothing at all now, holiday or not.
  it("tells the caller the business is away, without promising a callback time", () => {
    const prompt = buildSystemPrompt(makeTenant({ vacation_mode: 1 }), [], null);
    expect(prompt).toContain("Holiday / Vacation Mode");
    expect(prompt).toMatch(/get back to them when they return/);
    expect(prompt).not.toMatch(/get back to you shortly/);
    expect(prompt).not.toMatch(/first thing tomorrow morning/);
  });

  it("includes custom instructions with safety priority clause", () => {
    const prompt = buildSystemPrompt(
      makeTenant({ custom_instructions: "Always mention our 10% senior discount." }),
      [], null
    );
    expect(prompt).toContain("# Owner Instructions");
    expect(prompt).toContain("10% senior discount");
    expect(prompt).toContain("safety rules take priority");
  });

  it("does not include custom instructions when empty", () => {
    const prompt = buildSystemPrompt(makeTenant({ custom_instructions: "" }), [], null);
    expect(prompt).not.toContain("# Owner Instructions");
  });

  it("includes caller history for returning customers", () => {
    const history = [makeLeadHistory()];
    const prompt = buildSystemPrompt(makeTenant(), history, "+61400111222");
    expect(prompt).toContain("# Returning Customer Context");
    expect(prompt).toContain("leaky tap");
    expect(prompt).toContain("10 King St, Sydney 2000");
    expect(prompt).toContain("caller_history_data");
  });

  it("does not include history section when callerHistory is empty", () => {
    const prompt = buildSystemPrompt(makeTenant(), [], "+61400111222");
    expect(prompt).not.toContain("Returning Customer Context");
  });

  it("includes demo section when isDemo is true", () => {
    const prompt = buildSystemPrompt(makeTenant(), [], null, true);
    expect(prompt).toContain("# Demo Mode");
    expect(prompt).toContain("DEMONSTRATION call");
  });

  it("does not include demo section when isDemo is false", () => {
    const prompt = buildSystemPrompt(makeTenant(), [], null, false);
    expect(prompt).not.toContain("# Demo Mode");
  });

  it("includes service area when provided", () => {
    const prompt = buildSystemPrompt(
      makeTenant({ service_area: "Inner West Sydney, Parramatta" }),
      [], null
    );
    expect(prompt).toContain("Inner West Sydney, Parramatta");
  });

  it("includes callback timing in farewell templates", () => {
    const prompt = buildSystemPrompt(makeTenant(), [], null);
    expect(prompt).toContain("get back to you");
    // No callback TIME is promised any more — nobody can know when a tradie
    // reads an SMS in a van. What the prompt commits to is what the AI itself
    // does: pass it on.
    expect(prompt).toMatch(/straight (through )?to the team|going straight to the team|sending them straight/);
  });

  it("includes the caller's fromNumber in instructions", () => {
    const prompt = buildSystemPrompt(makeTenant(), [], "+61400111222");
    expect(prompt).toContain("+61400111222");
  });

  it("does not include 'gas leak' in plumber emergency keywords", () => {
    const prompt = buildSystemPrompt(makeTenant({ trade_type: "plumber" }), [], null);
    expect(prompt).not.toMatch(/IF the caller mentions:.*gas leak/);
    expect(prompt).toContain("burst pipe");
  });

  it("produces valid prompt text when trade_type is empty", () => {
    const prompt = buildSystemPrompt(makeTenant({ trade_type: "" }), [], null);
    expect(prompt).toContain("trade");
    expect(prompt).not.toContain("an Australian  business");
  });

  it("includes insurance claim handling in prompt", () => {
    const prompt = buildSystemPrompt(makeTenant(), [], null);
    expect(prompt).toContain("INSURANCE CLAIM");
  });

  it("includes abusive caller warning template in prompt", () => {
    const prompt = buildSystemPrompt(makeTenant(), [], null);
    expect(prompt).toContain("not able to continue if we can't keep it respectful");
  });

  it("does not classify 3+ trades as handyman", () => {
    const prompt = buildSystemPrompt(
      makeTenant({ trade_type: "plumber,electrician,roofer" }),
      [], null
    );
    expect(prompt).toContain("plumbing");
    expect(prompt).toContain("electrical");
    expect(prompt).toContain("roofing");
    expect(prompt).toContain("Accept enquiries for all of these service types");
  });

  it("includes cancellation call type in prompt", () => {
    const prompt = buildSystemPrompt(makeTenant(), [], null);
    expect(prompt).toContain("CANCELLATION");
    expect(prompt).toContain("JOB CANCELLED");
  });

  it("includes carbon monoxide in life-threatening emergencies", () => {
    const prompt = buildSystemPrompt(makeTenant(), [], null);
    expect(prompt).toContain("Carbon monoxide");
    expect(prompt).toContain("CO alarm");
  });

  it("vacation mode includes emergency exception", () => {
    const prompt = buildSystemPrompt(makeTenant({ vacation_mode: 1 }), [], null);
    expect(prompt).toContain("emergency or safety hazard");
    expect(prompt).toContain("always take priority over vacation mode");
  });

  it("does not include 'gas leak' in handyman emergency keywords", () => {
    const prompt = buildSystemPrompt(makeTenant({ trade_type: "handyman" }), [], null);
    expect(prompt).not.toMatch(/IF the caller mentions:.*gas leak/);
  });

  it("multi-trade scope includes out-of-scope guidance", () => {
    const prompt = buildSystemPrompt(
      makeTenant({ trade_type: "plumber,electrician" }),
      [], null
    );
    expect(prompt).toContain("If a caller needs a trade not listed here");
  });

  it("includes suburb guidance with postcode de-emphasis", () => {
    const prompt = buildSystemPrompt(makeTenant(), [], null);
    expect(prompt).toContain("ask the caller to spell it");
    expect(prompt).toContain("Suburb alone is enough");
    expect(prompt).not.toContain("Postcode is the priority");
  });

  it("includes spam false-positive safeguard", () => {
    const prompt = buildSystemPrompt(makeTenant(), [], null);
    expect(prompt).toContain("Before Classifying as Spam");
  });

  it("includes trade-to-life-threatening priority note", () => {
    const prompt = buildSystemPrompt(makeTenant(), [], null);
    expect(prompt).toContain("Life-Threatening Emergencies rules below take priority");
  });

  it("complaint path promises no callback time", () => {
    const prompt = buildSystemPrompt(makeTenant(), [], null);
    expect(prompt).toContain("flagged this as priority and sent it straight to the team");
    expect(prompt).not.toContain("very soon");
    expect(prompt).not.toContain("call you back shortly");
  });

  it("includes caller_intent for all main call types", () => {
    const prompt = buildSystemPrompt(makeTenant(), [], null);
    expect(prompt).toContain('caller_intent="new_job"');
    expect(prompt).toContain('caller_intent="follow_up"');
    expect(prompt).toContain('caller_intent="complaint"');
    expect(prompt).toContain('caller_intent="reschedule"');
    expect(prompt).toContain('caller_intent="quote_only"');
  });

  it("silent and abusive callers call save_lead before end_call", () => {
    const prompt = buildSystemPrompt(makeTenant(), [], null);
    expect(prompt).toContain('caller_intent="silent"');
    expect(prompt).toContain('save_lead(caller_intent="abusive")');
  });

  it("includes medical emergency guidance", () => {
    const prompt = buildSystemPrompt(makeTenant(), [], null);
    expect(prompt).toContain("electrocuted");
    expect(prompt).toContain("not breathing");
  });


  it("Tools section mentions final save_lead before end_call", () => {
    const prompt = buildSystemPrompt(makeTenant(), [], null);
    expect(prompt).toContain("call save_lead() one final time");
  });

  it("generates correct prompt for builder-only tenant", () => {
    const prompt = buildSystemPrompt(makeTenant({ trade_type: "builder" }), [], null);
    expect(prompt).toContain("building and construction");
    expect(prompt).toContain("specialise in building");
    expect(prompt).toContain("structural damage");
  });

  it("generates correct prompt for unknown trade type", () => {
    const prompt = buildSystemPrompt(makeTenant({ trade_type: "glazier" }), [], null);
    expect(prompt).toContain("glazier");
    expect(prompt).not.toContain("# Trade-Specific Intake Questions");
  });

  it("multi-trade prompt merges emergency tips per trade", () => {
    const prompt = buildSystemPrompt(
      makeTenant({ trade_type: "plumber,electrician" }),
      [], null
    );
    expect(prompt).toContain("For plumbing emergencies:");
    expect(prompt).toContain("For electrical emergencies:");
  });
});

describe("buildTimeContext", () => {
  it("knows it is open during weekday business hours", () => {
    const wed10am = new Date("2026-03-25T10:00:00+11:00");
    vi.useFakeTimers();
    vi.setSystemTime(wed10am);
    try {
      const result = buildTimeContext(makeTenant());
      expect(result.isOpen).toBe(true);
      expect(result.section).toContain("OPEN");
      expect(result.timeOfDay).toBe("morning");
    } finally {
      vi.useRealTimers();
    }
  });

  it("knows it is after hours on a weeknight", () => {
    const wed9pm = new Date("2026-03-25T21:00:00+11:00");
    vi.useFakeTimers();
    vi.setSystemTime(wed9pm);
    try {
      const result = buildTimeContext(makeTenant());
      expect(result.isOpen).toBe(false);
      expect(result.section).toContain("AFTER HOURS");
      expect(result.timeOfDay).toBe("evening");
    } finally {
      vi.useRealTimers();
    }
  });

  it("knows it is the weekend, with WEEKEND status", () => {
    const sat10am = new Date("2026-03-28T10:00:00+11:00");
    vi.useFakeTimers();
    vi.setSystemTime(sat10am);
    try {
      const result = buildTimeContext(makeTenant());
      expect(result.isOpen).toBe(false);
      expect(result.section).toContain("WEEKEND");
      expect(result.section).not.toContain("the business is closed");
    } finally {
      vi.useRealTimers();
    }
  });

  it("knows Friday after hours is closed", () => {
    const fri9pm = new Date("2026-03-27T21:00:00+11:00");
    vi.useFakeTimers();
    vi.setSystemTime(fri9pm);
    try {
      const result = buildTimeContext(makeTenant());
      expect(result.isOpen).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("buildServiceAreaSection", () => {
  it("returns empty string for null service area", () => {
    expect(buildServiceAreaSection(null)).toBe("");
  });

  it("returns empty string for empty service area", () => {
    expect(buildServiceAreaSection("")).toBe("");
    expect(buildServiceAreaSection("  ")).toBe("");
  });

  it("returns section with service area content", () => {
    const section = buildServiceAreaSection("Inner West Sydney, Parramatta");
    expect(section).toContain("Inner West Sydney, Parramatta");
  });
});

describe("buildSystemPrompt — enhanced features", () => {
  it("includes active listening instructions", () => {
    const prompt = buildSystemPrompt(makeTenant(), [], null);
    expect(prompt).toContain("Active Listening");
    expect(prompt).toContain("Reflect or paraphrase");
  });

  it("includes adaptive pacing instructions", () => {
    const prompt = buildSystemPrompt(makeTenant(), [], null);
    expect(prompt).toContain("Adaptive Pacing");
    expect(prompt).toContain("Rushed caller");
    expect(prompt).toContain("Distressed caller");
    expect(prompt).toContain("Chatty caller");
  });

  it("includes bridge phrases for natural transitions", () => {
    const prompt = buildSystemPrompt(makeTenant(), [], null);
    expect(prompt).toContain("BRIDGE PHRASES");
    expect(prompt).toContain("whereabouts are you based");
    expect(prompt).not.toContain("suburb and postcode?");
  });

  it("includes audio quality handling section", () => {
    const prompt = buildSystemPrompt(makeTenant(), [], null);
    expect(prompt).toContain("Audio Quality");
    expect(prompt).toContain("cutting out");
  });

  // The prompt names a photo step in the conversation flow, but no longer
  // scripts the "texting a photo to this number" line — commit e39e3f3
  // removed that from the caller SMS because an alphanumeric sender ID cannot
  // receive replies. See tests/sms.test.ts for the SMS-side assertion.
  it("includes a photo suggestion step in the closing flow", () => {
    const prompt = buildSystemPrompt(makeTenant(), [], null);
    expect(prompt).toContain("Photo suggestion");
  });

  it("includes time-of-day in greeting templates", () => {
    const prompt = buildSystemPrompt(makeTenant(), [], null);
    expect(prompt).toMatch(/Good (morning|afternoon|evening)/);
  });

  it("includes caller_sentiment and property_type instructions", () => {
    const prompt = buildSystemPrompt(makeTenant(), [], null);
    expect(prompt).toContain("caller_sentiment");
    expect(prompt).toContain("property_type");
    expect(prompt).toContain("job_size");
    expect(prompt).toContain("confidence");
  });

  it("includes two-exchange spam fast-exit rule", () => {
    const prompt = buildSystemPrompt(makeTenant(), [], null);
    expect(prompt).toContain("Two-Exchange Rule");
    expect(prompt).toContain("Fast Exit");
  });

  it("includes three-prompt silent caller handling", () => {
    const prompt = buildSystemPrompt(makeTenant(), [], null);
    expect(prompt).toContain("First prompt");
    expect(prompt).toContain("Second prompt");
    expect(prompt).toContain("Third prompt");
    expect(prompt).toContain("try calling back");
  });

  it("includes context-aware farewell variants", () => {
    const prompt = buildSystemPrompt(makeTenant(), [], null);
    expect(prompt).toContain("### Standard");
    expect(prompt).toContain("### Emergency");
    expect(prompt).toContain("### Complaint");
    expect(prompt).toContain("### Distressed caller");
    expect(prompt).toContain("### Positive / Friendly caller");
    expect(prompt).toContain("### Rushed caller");
  });

  it("returning customer context includes confirm-not-reask instructions", () => {
    const history = [makeLeadHistory()];
    const prompt = buildSystemPrompt(makeTenant(), history, "+61400111222");
    expect(prompt).toContain("CONFIRM, don't re-ask");
    expect(prompt).toContain("Jane Smith");
    expect(prompt).toContain("10 King St, Sydney 2000");
    expect(prompt).toContain("Same number as last time");
  });

  it("returning customer context shows last known details", () => {
    const history = [makeLeadHistory({ name: "John Doe", address: "5 Main Rd, Bondi 2026", phone: "+61400999888" })];
    const prompt = buildSystemPrompt(makeTenant(), history, "+61400999888");
    expect(prompt).toContain('Last known name: "John Doe"');
    expect(prompt).toContain('Last known address: "5 Main Rd, Bondi 2026"');
    expect(prompt).toContain('Last known callback number: "+61400999888"');
  });

  it("includes after-hours greeting when business is closed", () => {
    const wed9pm = new Date("2026-03-25T21:00:00+11:00");
    vi.useFakeTimers();
    vi.setSystemTime(wed9pm);
    try {
      const prompt = buildSystemPrompt(makeTenant(), [], null);
      expect(prompt).toContain("outside regular hours");
    } finally {
      vi.useRealTimers();
    }
  });

  it("includes small talk and pleasantries handling", () => {
    const prompt = buildSystemPrompt(makeTenant(), [], null);
    expect(prompt).toContain("Small Talk & Pleasantries");
    expect(prompt).toContain("How are you?");
    expect(prompt).toContain("Do NOT ignore pleasantries");
  });

  it("includes caller pausing / on-hold section", () => {
    const prompt = buildSystemPrompt(makeTenant(), [], null);
    expect(prompt).toContain("Caller Pausing / On Hold");
    expect(prompt).toContain("hang on");
    expect(prompt).toContain("I'm still here whenever you're ready");
  });

  it("includes conversation recovery guidance", () => {
    const prompt = buildSystemPrompt(makeTenant(), [], null);
    expect(prompt).toContain("misheard that");
    expect(prompt).toContain("Self-correcting feels human");
  });

  it("includes uncertainty handling for vague callers", () => {
    const prompt = buildSystemPrompt(makeTenant(), [], null);
    expect(prompt).toContain("just tell me what you're noticing");
    expect(prompt).toContain("don't push for a diagnosis");
  });

  it("includes owner pushback handling for persistent callers", () => {
    const prompt = buildSystemPrompt(makeTenant(), [], null);
    expect(prompt).toContain("I totally understand you'd rather speak to someone directly");
  });

  // Two different times, and the prompt must keep them apart: when the caller
  // wants the WORK done — one of the five core fields from 2026-07-29, and what
  // the owner sorts his day by now that urgency_level is gone — and when they
  // want to be RUNG. Both land in preferred_time; only the first is core.
  it("asks when the work is wanted, and keeps it distinct from a callback time", () => {
    const prompt = buildSystemPrompt(makeTenant(), [], null);
    expect(prompt).toContain("when were you hoping to get this done?");
    expect(prompt).toContain("specific CALLBACK time");
    expect(prompt).toContain("preferred_time");
  });

  // "As soon as possible" is what most callers say and it carries no
  // information. The constraint behind it is what decides schedulability.
  it("presses once past 'as soon as possible' for the constraint behind it", () => {
    const prompt = buildSystemPrompt(makeTenant(), [], null);
    expect(prompt).toMatch(/tells the owner nothing/);
    expect(prompt).toMatch(/A constraint beats a preference/);
  });

  it("includes multi-detail volunteering example", () => {
    const prompt = buildSystemPrompt(makeTenant(), [], null);
    expect(prompt).toContain("so you're John in Parramatta");
    expect(prompt).toContain("only ask for what's still missing");
  });

  it("includes confidence scoring guidance", () => {
    const prompt = buildSystemPrompt(makeTenant(), [], null);
    expect(prompt).toContain("Confidence: always set confidence");
    expect(prompt).toContain("0.3 = minimal");
    expect(prompt).toContain("1.0 = complete");
  });

  it("includes actionable next_action guidance", () => {
    const prompt = buildSystemPrompt(makeTenant(), [], null);
    expect(prompt).toContain("next_action: for new_job leads");
    expect(prompt).toContain("Quote for kitchen tap replacement");
  });

  it("has at least 8 greeting variations", () => {
    const prompt = buildSystemPrompt(makeTenant(), [], null);
    const greetingSection = prompt.split("## Greeting")[1]?.split("## Farewell")[0] ?? "";
    const greetingLines = greetingSection.split("\n").filter((l) => l.trim().startsWith("-") && l.includes('"'));
    expect(greetingLines.length).toBeGreaterThanOrEqual(8);
  });

  it("includes voicemail call type handling", () => {
    const prompt = buildSystemPrompt(makeTenant(), [], null);
    expect(prompt).toContain('caller_intent="voicemail"');
    expect(prompt).toContain("VOICEMAIL REQUEST");
  });

  it("includes natural closing summary with short-call skip", () => {
    const prompt = buildSystemPrompt(makeTenant(), [], null);
    expect(prompt).toContain("straightforward calls");
    expect(prompt).toContain("skip the full read-back");
  });

  it("includes intake question transition bridge", () => {
    const prompt = buildSystemPrompt(makeTenant(), [], null);
    expect(prompt).toContain("so the team knows what to bring");
  });

  it("sentiment-aware farewells include distressed and positive variants", () => {
    const prompt = buildSystemPrompt(makeTenant(), [], null);
    expect(prompt).toContain("Take care of yourself");
    expect(prompt).toContain("Have a ripper day");
    expect(prompt).toContain("All noted");
  });
});

describe("the prompt does not promise a withheld number reaches the owner", () => {
  // It used to say "the number they rang from reaches the owner anyway" to
  // every caller. True for most, and false for exactly the ones most likely to
  // decline — who were then reassured into leaving no way to be contacted.
  it("tells the caller their number is private, once, when it is", () => {
    const prompt = buildSystemPrompt(makeTenant(), [], "+7378742833");
    expect(prompt).not.toContain("7378742833");
    expect(prompt).not.toContain("reaches the owner anyway");
    expect(prompt).toContain("your number's coming through private");
    expect(prompt).toContain("never raise it again");
  });

  // The first pass at this branched one line and left two others untouched, so
  // the same prompt said there is no number AND offered "use their caller ID"
  // and "the caller's number on file is …". A rule the model can satisfy two
  // opposite ways is the failure mode CODING_STANDARDS names first.
  it("offers no caller ID anywhere in the prompt when there is none", () => {
    const prompt = buildSystemPrompt(makeTenant(), [], "+7378742833");
    expect(prompt).not.toContain("use their caller ID");
    expect(prompt).not.toContain("The caller's number on file is");
    expect(prompt).toContain("There is NO number on file for this caller");
  });

  it("keeps both caller-ID lines when the number is real", () => {
    const prompt = buildSystemPrompt(makeTenant(), [], "+61412345678");
    expect(prompt).toContain("use their caller ID");
    expect(prompt).toContain("The caller's number on file is +61412345678");
    expect(prompt).not.toContain("There is NO number on file");
  });

  it("keeps the ordinary wording, and the number, for a real caller ID", () => {
    const prompt = buildSystemPrompt(makeTenant(), [], "+61412345678");
    expect(prompt).toContain("+61412345678");
    expect(prompt).not.toContain("coming through private");
  });

  it("treats a missing caller ID the same as a withheld one", () => {
    const prompt = buildSystemPrompt(makeTenant(), [], null);
    expect(prompt).toContain("coming through private");
  });
});
