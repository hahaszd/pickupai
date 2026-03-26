import { describe, expect, it } from "vitest";
import {
  safeParseFunctionArgs,
  sanitizeEndCallReason,
  sanitizeSaveLeadArgs
} from "../src/realtime/tool-call-guards.js";

describe("safeParseFunctionArgs", () => {
  it("returns empty object for invalid JSON", () => {
    expect(safeParseFunctionArgs("{bad-json")).toEqual({});
  });

  it("returns empty object for non-object payloads", () => {
    expect(safeParseFunctionArgs('"hello"')).toEqual({});
    expect(safeParseFunctionArgs("123")).toEqual({});
  });

  it("parses valid JSON objects", () => {
    const parsed = safeParseFunctionArgs('{"name":"Chris"}');
    expect(parsed).toEqual({ name: "Chris" });
  });
});

describe("safeParseFunctionArgs – edge cases", () => {
  it("returns empty object for undefined input", () => {
    expect(safeParseFunctionArgs(undefined)).toEqual({});
  });

  it("returns empty object for empty string", () => {
    expect(safeParseFunctionArgs("")).toEqual({});
  });

  it("returns empty object for whitespace-only string", () => {
    expect(safeParseFunctionArgs("   ")).toEqual({});
  });

  it("returns empty object for null input", () => {
    expect(safeParseFunctionArgs(null)).toEqual({});
  });
});

describe("sanitizeSaveLeadArgs", () => {
  it("keeps only allowed fields and enums", () => {
    const patch = sanitizeSaveLeadArgs({
      name: "  Chris  ",
      issue_summary: "  Burst pipe  ",
      urgency_level: "emergency",
      caller_intent: "new_job",
      next_action: "Call ASAP",
      unknown_key: "ignore"
    });

    expect(patch).toEqual({
      name: "Chris",
      issue_summary: "Burst pipe",
      urgency_level: "emergency",
      caller_intent: "new_job",
      next_action: "Call ASAP"
    });
  });

  it("drops invalid enum values and clamps confidence", () => {
    const patch = sanitizeSaveLeadArgs({
      urgency_level: "now",
      caller_intent: "made_up_intent",
      confidence: 7
    });

    expect(patch.urgency_level).toBeUndefined();
    expect(patch.caller_intent).toBeUndefined();
    expect(patch.confidence).toBe(1);
  });

  it("ignores empty strings", () => {
    const patch = sanitizeSaveLeadArgs({
      name: "  ",
      issue_type: ""
    });
    expect(patch).toEqual({});
  });

  it("truncates name to 200 characters", () => {
    const longName = "A".repeat(300);
    const patch = sanitizeSaveLeadArgs({ name: longName });
    expect(patch.name).toHaveLength(200);
  });

  it("truncates phone to 50 characters", () => {
    const longPhone = "1".repeat(100);
    const patch = sanitizeSaveLeadArgs({ phone: longPhone });
    expect(patch.phone).toHaveLength(50);
  });

  it("truncates address to 500 characters", () => {
    const longAddr = "B".repeat(600);
    const patch = sanitizeSaveLeadArgs({ address: longAddr });
    expect(patch.address).toHaveLength(500);
  });

  it("truncates issue_summary to 1000 characters", () => {
    const longSummary = "C".repeat(1500);
    const patch = sanitizeSaveLeadArgs({ issue_summary: longSummary });
    expect(patch.issue_summary).toHaveLength(1000);
  });

  it("truncates notes to 2000 characters", () => {
    const longNotes = "D".repeat(2500);
    const patch = sanitizeSaveLeadArgs({ notes: longNotes });
    expect(patch.notes).toHaveLength(2000);
  });

  it("truncates next_action to 500 characters", () => {
    const longAction = "E".repeat(600);
    const patch = sanitizeSaveLeadArgs({ next_action: longAction });
    expect(patch.next_action).toHaveLength(500);
  });

  it("truncates issue_type to 100 characters", () => {
    const longType = "F".repeat(200);
    const patch = sanitizeSaveLeadArgs({ issue_type: longType });
    expect(patch.issue_type).toHaveLength(100);
  });

  it("truncates preferred_time to 200 characters", () => {
    const longTime = "G".repeat(300);
    const patch = sanitizeSaveLeadArgs({ preferred_time: longTime });
    expect(patch.preferred_time).toHaveLength(200);
  });

  it("does not truncate values within limits", () => {
    const patch = sanitizeSaveLeadArgs({ name: "Chris", issue_type: "burst pipe" });
    expect(patch.name).toBe("Chris");
    expect(patch.issue_type).toBe("burst pipe");
  });

  it("clamps confidence at exactly 0", () => {
    const patch = sanitizeSaveLeadArgs({ confidence: 0 });
    expect(patch.confidence).toBe(0);
  });

  it("clamps confidence at exactly 1", () => {
    const patch = sanitizeSaveLeadArgs({ confidence: 1 });
    expect(patch.confidence).toBe(1);
  });

  it("clamps negative confidence to 0", () => {
    const patch = sanitizeSaveLeadArgs({ confidence: -0.5 });
    expect(patch.confidence).toBe(0);
  });

  it("drops NaN confidence", () => {
    const patch = sanitizeSaveLeadArgs({ confidence: NaN });
    expect(patch.confidence).toBeUndefined();
  });

  it("drops Infinity confidence", () => {
    const patch = sanitizeSaveLeadArgs({ confidence: Infinity });
    expect(patch.confidence).toBeUndefined();
  });

  it("accepts 'cancellation' as a valid caller_intent", () => {
    const patch = sanitizeSaveLeadArgs({ caller_intent: "cancellation" });
    expect(patch.caller_intent).toBe("cancellation");
  });

  it("accepts 'voicemail' as a valid caller_intent", () => {
    const patch = sanitizeSaveLeadArgs({ caller_intent: "voicemail" });
    expect(patch.caller_intent).toBe("voicemail");
  });

  it("accepts valid property_type values", () => {
    expect(sanitizeSaveLeadArgs({ property_type: "residential" }).property_type).toBe("residential");
    expect(sanitizeSaveLeadArgs({ property_type: "commercial" }).property_type).toBe("commercial");
    expect(sanitizeSaveLeadArgs({ property_type: "strata" }).property_type).toBe("strata");
    expect(sanitizeSaveLeadArgs({ property_type: "rental" }).property_type).toBe("rental");
  });

  it("drops invalid property_type values", () => {
    expect(sanitizeSaveLeadArgs({ property_type: "apartment" }).property_type).toBeUndefined();
    expect(sanitizeSaveLeadArgs({ property_type: "" }).property_type).toBeUndefined();
  });

  it("accepts valid caller_sentiment values", () => {
    expect(sanitizeSaveLeadArgs({ caller_sentiment: "positive" }).caller_sentiment).toBe("positive");
    expect(sanitizeSaveLeadArgs({ caller_sentiment: "neutral" }).caller_sentiment).toBe("neutral");
    expect(sanitizeSaveLeadArgs({ caller_sentiment: "frustrated" }).caller_sentiment).toBe("frustrated");
    expect(sanitizeSaveLeadArgs({ caller_sentiment: "distressed" }).caller_sentiment).toBe("distressed");
    expect(sanitizeSaveLeadArgs({ caller_sentiment: "rushed" }).caller_sentiment).toBe("rushed");
  });

  it("drops invalid caller_sentiment values", () => {
    expect(sanitizeSaveLeadArgs({ caller_sentiment: "angry" }).caller_sentiment).toBeUndefined();
    expect(sanitizeSaveLeadArgs({ caller_sentiment: "" }).caller_sentiment).toBeUndefined();
  });

  it("accepts valid job_value values", () => {
    expect(sanitizeSaveLeadArgs({ job_value: "small" }).job_value).toBe("small");
    expect(sanitizeSaveLeadArgs({ job_value: "medium" }).job_value).toBe("medium");
    expect(sanitizeSaveLeadArgs({ job_value: "large" }).job_value).toBe("large");
  });

  it("drops invalid job_value values", () => {
    expect(sanitizeSaveLeadArgs({ job_value: "huge" }).job_value).toBeUndefined();
    expect(sanitizeSaveLeadArgs({ job_value: 500 }).job_value).toBeUndefined();
  });
});

describe("sanitizeEndCallReason", () => {
  it("uses provided reason when non-empty", () => {
    expect(sanitizeEndCallReason({ reason: "lead collected" })).toBe("lead collected");
  });

  it("falls back to default reason for invalid payload", () => {
    expect(sanitizeEndCallReason({ reason: "  " })).toBe("conversation complete");
    expect(sanitizeEndCallReason({})).toBe("conversation complete");
  });

  it("truncates reason to 500 characters", () => {
    const longReason = "x".repeat(600);
    const result = sanitizeEndCallReason({ reason: longReason });
    expect(result).toHaveLength(500);
    expect(result).toBe("x".repeat(500));
  });

  it("keeps reason at exactly 500 characters unchanged", () => {
    const exact = "y".repeat(500);
    expect(sanitizeEndCallReason({ reason: exact })).toBe(exact);
  });
});
