import { describe, expect, it } from "vitest";
import {
  INBOUND_SCENARIO_MATRIX,
  evaluateCaptureQuality,
  expectedSmsForIntent
} from "../src/testing/inbound-scenarios.js";

describe("inbound scenario matrix", () => {
  it("has unique scenario IDs", () => {
    const ids = INBOUND_SCENARIO_MATRIX.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("includes required P0 risk scenarios", () => {
    const p0Ids = INBOUND_SCENARIO_MATRIX.filter((s) => s.priority === "P0").map((s) => s.id);
    expect(p0Ids).toContain("p0_new_job_emergency");
    expect(p0Ids).toContain("p0_wrong_number");
    expect(p0Ids).toContain("p0_spam_or_telemarketer");
    expect(p0Ids).toContain("p0_silent_caller");
    expect(p0Ids).toContain("p0_abusive_caller");
  });

  it("aligns scenario SMS expectation with NO_SMS_INTENTS policy", () => {
    for (const scenario of INBOUND_SCENARIO_MATRIX) {
      expect(scenario.assertions.shouldSendOwnerSms).toBe(expectedSmsForIntent(scenario.intent));
    }
  });

  it("covers actionable P1/P2 intents with lead capture expectations", () => {
    const p1p2 = INBOUND_SCENARIO_MATRIX.filter((s) => s.priority !== "P0");
    expect(p1p2.length).toBeGreaterThanOrEqual(5);
    for (const scenario of p1p2) {
      if (scenario.category === "core") {
        expect(scenario.assertions.shouldEndCall).toBe(true);
        if (scenario.assertions.shouldSaveLead) {
          expect(["complete", "degraded"]).toContain(scenario.assertions.captureTarget);
        }
      }
    }
  });

  it("keeps noise scenarios non-capturing by default", () => {
    const noise = INBOUND_SCENARIO_MATRIX.filter((s) => s.category === "noise");
    for (const scenario of noise) {
      if (!scenario.assertions.shouldSaveLead) {
        expect(scenario.assertions.captureTarget).toBe("none");
      }
    }
  });
});

describe("dialog quality gates", () => {
  it("passes complete when all core fields are captured", () => {
    const quality = evaluateCaptureQuality({
      name: "James Wilson",
      phone: "+61412345678",
      issue_summary: "Burst pipe under sink",
      urgency_level: "emergency",
      caller_intent: "new_job",
      address: "Parramatta 2150"
    });
    expect(quality.level).toBe("pass_complete");
    expect(quality.missingCoreFields).toHaveLength(0);
  });

  it("passes degraded when callback number and summary are available", () => {
    const quality = evaluateCaptureQuality({
      phone: "+61412345678",
      issue_summary: "Power outage affecting half the house",
      urgency_level: null,
      caller_intent: null
    });
    expect(quality.level).toBe("pass_degraded");
    expect(quality.missingCoreFields.length).toBeGreaterThan(0);
  });

  it("fails when callback number is missing", () => {
    const quality = evaluateCaptureQuality({
      name: "Caller",
      issue_summary: "Need help with roof leak"
    });
    expect(quality.level).toBe("fail");
    expect(quality.reason).toContain("insufficient data");
  });
});
