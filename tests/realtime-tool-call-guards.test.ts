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
});

describe("sanitizeEndCallReason", () => {
  it("uses provided reason when non-empty", () => {
    expect(sanitizeEndCallReason({ reason: "lead collected" })).toBe("lead collected");
  });

  it("falls back to default reason for invalid payload", () => {
    expect(sanitizeEndCallReason({ reason: "  " })).toBe("conversation complete");
    expect(sanitizeEndCallReason({})).toBe("conversation complete");
  });
});
