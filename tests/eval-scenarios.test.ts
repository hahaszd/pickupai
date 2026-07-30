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

  it("requires issue_summary, and either a captured number or a request for one", () => {
    // issue_summary is written by the assistant from what it heard, so it never
    // depends on the caller's cooperation and is always demandable.
    //
    // The phone is not. From 2026-07-29 nothing is compulsory: the assistant
    // asks at most twice and lets it go, and the number the caller rang from
    // reaches the owner anyway. So a scenario must assert one of two things —
    // that the number was captured, which is fair where the scripted caller
    // co-operates, or that the assistant ASKED, which is the half we control.
    // Asserting neither would let a silent regression through.
    for (const s of ALL_EVAL_SCENARIOS) {
      // "not_a_lead" exempt for the opposite reason to "none": that call must
      // not produce a usable lead at all, so requiring issue_summary and a
      // number would assert the thing the scenario forbids.
      if (!s.expected.shouldSaveLead) continue;
      if (s.expected.captureTarget === "none" || s.expected.captureTarget === "not_a_lead") continue;
      expect(s.mustCapture, s.id).toContain("issue_summary");
      const asksForANumber = (s.mustSay ?? []).some((m) => /number/i.test(m));
      expect(
        s.mustCapture.includes("phone") || asksForANumber,
        `${s.id}: must either capture a phone or assert that it asked for one`
      ).toBe(true);
    }
  });

  it("keeps shouldSendOwnerSms consistent with the SMS suppression policy", () => {
    // If these disagree, the eval asserts behaviour the product deliberately
    // does not have, and every run fails for the wrong reason.
    // Both directions. Only the first was checked until 2026-07-29, and taking
    // referred_out OUT of the suppression list left two scenarios still
    // expecting no SMS — one of which then failed 3/3 in the gate for a reason
    // that was a stale expectation rather than a product defect.
    for (const s of ALL_EVAL_SCENARIOS) {
      if (!s.expected.shouldSaveLead) continue;
      expect(
        s.expected.shouldSendOwnerSms,
        `${s.id}: intent "${s.intent}" is ${NO_SMS_INTENTS.has(s.intent) ? "" : "NOT "}suppressed`
      ).toBe(!NO_SMS_INTENTS.has(s.intent));
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

describe("the caller brief does not contradict the scenario", () => {
  // The first version of this test re-derived its expectation with a COPY of
  // the same regex the production code used — so when that regex extracted
  // "Bendigo and you have already decided it needs replacing", the test
  // certified it. Two things share a bug and agree with each other.
  //
  // So the detection here is deliberately DIFFERENT from the mechanism: the
  // code reads an explicit `callerSuburb` field and never parses prose, and
  // this scans prose broadly and demands the field be set. Neither can quietly
  // adopt the other's mistake.
  const NAMES_A_PLACE =
    /\b(?:You (?:are|live) in|The (?:property|house|place|unit|premises) is in|It is a[^"]{0,60}? in)\s+[A-Z]/;

  it("sets callerSuburb wherever the facts name a place", async () => {
    const { ALL_EVAL_SCENARIOS } = await import("../src/testing/eval/scenarios/index.js");

    const unset = ALL_EVAL_SCENARIOS
      .filter((s) => s.callerFacts.some((f) => NAMES_A_PLACE.test(f)) && !s.callerSuburb)
      .map((s) => s.id);
    expect(unset, "these name a place in callerFacts but leave callerSuburb unset — " +
      "the caller model gets a hashed suburb AND the scenario's place, and picks one")
      .toEqual([]);
  });

  it("puts callerSuburb in the brief, and nothing else where it is unset", async () => {
    const { ALL_EVAL_SCENARIOS } = await import("../src/testing/eval/scenarios/index.js");
    const { buildCallerBriefForTest } = await import("../src/testing/eval/runner.js");

    let checked = 0;
    for (const s of ALL_EVAL_SCENARIOS) {
      if (!s.callerSuburb) continue;
      expect(buildCallerBriefForTest(s), `${s.id}`).toContain(`You live in ${s.callerSuburb}`);
      checked++;
    }
    // If this drops the assertion has quietly stopped testing anything.
    expect(checked).toBeGreaterThan(8);
  });

  // The corruption that made this necessary: a whole clause hoisted into the
  // identity line, which the caller volunteers immediately, rather than staying
  // in callerFacts where it is revealed only when asked.
  it("never puts a caller's own diagnosis into the identity line", async () => {
    const { ALL_EVAL_SCENARIOS } = await import("../src/testing/eval/scenarios/index.js");
    for (const s of ALL_EVAL_SCENARIOS) {
      if (!s.callerSuburb) continue;
      expect(s.callerSuburb.length, `${s.id}: callerSuburb "${s.callerSuburb}" is a sentence, not a place`)
        .toBeLessThan(40);
      expect(s.callerSuburb, `${s.id}`).not.toMatch(/\b(?:and|you|because|already|told)\b/i);
    }
  });
});
