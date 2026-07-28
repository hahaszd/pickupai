import { describe, it, expect } from "vitest";
import { ALL_EVAL_SCENARIOS } from "../src/testing/eval/scenarios/index.js";
import { NO_SMS_INTENTS } from "../src/twilio/sms.js";

/**
 * Structural checks only — these run offline in CI and cost nothing.
 * Actually driving the conversations costs money and needs a key, so that
 * lives in `npx tsx scripts/run-eval.ts`.
 *
 * The point of these is that a malformed scenario should fail here, in a
 * second, rather than halfway through a paid eval run.
 */
describe("eval scenario library", () => {
  it("has scenarios for every trade the reviews covered", () => {
    const trades = new Set(ALL_EVAL_SCENARIOS.map((s) => s.trade));
    expect([...trades].sort()).toEqual(["electrician", "handyman", "plumber", "roofer"]);
  });

  it("has unique ids", () => {
    const ids = ALL_EVAL_SCENARIOS.map((s) => s.id);
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    expect(dupes).toEqual([]);
  });

  it("prefixes every id with its trade", () => {
    for (const s of ALL_EVAL_SCENARIOS) {
      expect(s.id.startsWith(`${s.trade}_`)).toBe(true);
    }
  });

  it("gives every scenario a caller who can actually talk", () => {
    // A scenario with no opening or no facts cannot be run — the caller model
    // would have nothing to say and the conversation would collapse.
    for (const s of ALL_EVAL_SCENARIOS) {
      expect(s.callerOpening.trim().length, s.id).toBeGreaterThan(10);
      expect(s.callerFacts.length, s.id).toBeGreaterThan(0);
    }
  });

  it("requires phone and issue_summary wherever a lead is expected", () => {
    // Those two are what make a lead callable. Anything less is not a lead.
    for (const s of ALL_EVAL_SCENARIOS) {
      if (!s.expected.shouldSaveLead || s.expected.captureTarget === "none") continue;
      expect(s.mustCapture, s.id).toContain("phone");
      expect(s.mustCapture, s.id).toContain("issue_summary");
    }
  });

  it("keeps shouldSendOwnerSms consistent with the SMS suppression policy", () => {
    // If these disagree, the eval asserts behaviour the product deliberately
    // does not have, and every run fails for the wrong reason.
    for (const s of ALL_EVAL_SCENARIOS) {
      if (NO_SMS_INTENTS.has(s.intent)) {
        expect(s.expected.shouldSendOwnerSms, `${s.id} (${s.intent} is suppressed)`).toBe(false);
      }
    }
  });

  it("always expects end_call — a call that never ends bills the tenant", () => {
    for (const s of ALL_EVAL_SCENARIOS) {
      expect(s.expected.shouldEndCall, s.id).toBe(true);
    }
  });

  it("explains why every scenario exists", () => {
    for (const s of ALL_EVAL_SCENARIOS) {
      expect(s.whyThisMatters.trim().length, s.id).toBeGreaterThan(20);
    }
  });

  it("covers the safety-critical behaviours that motivated the harness", () => {
    // These are the findings that a capture-only eval structurally cannot
    // catch: the assistant can save a flawless lead while having told the
    // caller to open a burning switchboard.
    const withSpeechAssertions = ALL_EVAL_SCENARIOS.filter(
      (s) => (s.mustSay?.length ?? 0) > 0 || (s.mustNotSay?.length ?? 0) > 0
    );
    expect(withSpeechAssertions.length).toBeGreaterThanOrEqual(6);

    const electricalSafety = ALL_EVAL_SCENARIOS.filter(
      (s) => s.trade === "electrician" && (s.mustNotSay?.length ?? 0) > 0
    );
    expect(electricalSafety.length).toBeGreaterThanOrEqual(2);

    const handymanLicensing = ALL_EVAL_SCENARIOS.filter(
      (s) => s.trade === "handyman" && (s.mustSay?.length ?? 0) > 0
    );
    expect(handymanLicensing.length).toBeGreaterThanOrEqual(1);
  });

  // There used to be a check here that the library contained negative controls
  // against emergency over-tagging. It went with urgency_level itself on
  // 2026-07-28: there is no label left to over-apply. The calls those controls
  // covered are still in the library and still assert a full capture, which is
  // now the whole of what they test.
});
