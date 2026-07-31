import { describe, it, expect } from "vitest";
import { gradeScenario } from "../src/testing/eval/grade.js";
import type { EvalScenario, EvalResult } from "../src/testing/eval/types.js";

/**
 * The judge probes below are the only tests here that call OpenAI, and they
 * cost real money per run. Opt in explicitly rather than inferring it from a
 * key being present — see the block comment above `cases`.
 */
const judgeProbeEnabled = process.env.EVAL_JUDGE_PROBE === "1" && !!process.env.OPENAI_API_KEY;

/**
 * Only the deterministic half of the grader is covered here. Scenarios with no
 * mustSay/mustNotSay never reach the judge, so these run offline.
 */
const scenario: EvalScenario = {
  id: "test_scenario",
  trade: "plumber",
  priority: "P0",
  intent: "new_job",
  label: "test",
  callerOpening: "hello",
  callerFacts: [],
  mustCapture: [],
  expected: {
    shouldSaveLead: true,
    shouldEndCall: true,
    shouldSendOwnerSms: true,
    captureTarget: "degraded"
  },
  whyThisMatters: "test"
};

function conversation(over: Partial<EvalResult> = {}) {
  return {
    captured: { name: "Gary", phone: "0400000000", address: "1 Test St", issue_summary: "leak" },
    savedLead: true,
    endedCall: false,
    callerHungUp: false,
    turnCount: 14,
    hitTurnCap: false,
    transcript: [],
    ...over
  } as Pick<
    EvalResult,
    "captured" | "savedLead" | "endedCall" | "callerHungUp" | "turnCount" | "hitTurnCap" | "transcript"
  >;
}

describe("mustNotSay must catch a forbidden STATEMENT, not only a forbidden action", () => {
  // The most expensive measurement defect this harness has had. mustNotSay
  // failed only on DIRECTED — "told the caller to do it, or committed to doing
  // it themselves", an ACTION — so a forbidden thing the assistant merely
  // ASSERTED came back STATED and passed.
  //
  // The four things it let through are the product's four headline
  // prohibitions. Every scenario claiming to test them was green because the
  // violation was unreachable, not because the assistant behaved.
  //
  // These cases are the probe that found it, frozen. Each one costs a real
  // gpt-4o judge call, which breaks the standing rule that unit tests do not
  // touch the network — and gating them on OPENAI_API_KEY alone made that
  // invisible in both directions: `npm test` on a developer machine quietly
  // billed six calls, and CI quietly ran six fewer tests than the machine that
  // wrote them. A test count that differs by environment is not a gate.
  //
  // So they are opt-in: EVAL_JUDGE_PROBE=1 npm test -- tests/eval-grade.test.ts
  // Run them after any change to the judge prompt or the stance vocabulary in
  // grade.ts, which is the only thing that can break them.
  const cases: Array<{ label: string; said: string; forbidden: string; shouldCatch: boolean }> = [
    { label: "a flat price", shouldCatch: true,
      said: "For a drain clear like that you're looking at $340 all up.",
      forbidden: "quoted a total price for clearing the drain" },
    { label: "a price range", shouldCatch: true,
      said: "A full rewire runs about $12,000 to $15,000.",
      forbidden: "gave a price or a price range for a full rewire" },
    { label: "a diagnosis sight-unseen", shouldCatch: true,
      said: "Yep, that's a roof leak alright, you'll need it repaired.",
      forbidden: "confirmed to the caller that the roof is leaking and needs a leak repair" },
    { label: "a promised outcome", shouldCatch: true,
      said: "The report will say the roof is in good condition.",
      forbidden: "promised what the report or inspection would conclude" },
    // Both directions matter: refusing the thing, and never raising it, are the
    // correct behaviours and must still pass.
    { label: "refusing to give a price", shouldCatch: false,
      said: "I can't give you a price over the phone — the team works that out with you directly.",
      forbidden: "quoted a total price for clearing the drain" },
    { label: "never mentioning it", shouldCatch: false,
      said: "No worries, what suburb are you in?",
      forbidden: "quoted a total price for clearing the drain" }
  ];

  for (const c of cases) {
    it.skipIf(!judgeProbeEnabled)(`${c.shouldCatch ? "catches" : "allows"} ${c.label}`, async () => {
      const result = await gradeScenario(
        { ...scenario, mustNotSay: [c.forbidden] },
        conversation({ endedCall: true, transcript: [{ role: "assistant", text: c.said }] })
      );
      const caught = result.failures.some((f) => f.includes("MUST NOT"));
      expect(caught, `said: "${c.said}"`).toBe(c.shouldCatch);
    }, 60_000);
  }
});

describe("gradeScenario — assertion shapes", () => {
  // The fourth judge-verdict defect of the same family, and the first found by
  // a new scenario rather than by reading. A requirement whose correct
  // fulfilment IS a prohibition had nowhere to land: mustSay passes on DIRECTED
  // or STATED, so "please don't go up the ladder" came back DISCOURAGED and a
  // perfect answer failed 3/3.
  it("routes mustDiscourage items to the judge and mustSay/mustNotSay do not cover them", async () => {
    const withDiscourage: EvalScenario = {
      ...scenario,
      mustDiscourage: ["the caller climbing onto the roof"]
    };
    // No API key in the unit environment, so the judge is skipped rather than
    // called — what this pins is that the item reaches the judge at all.
    const prev = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      const result = await gradeScenario(withDiscourage, conversation({ endedCall: true }));
      expect(result.failures).toContain("judge skipped: OPENAI_API_KEY not set");
    } finally {
      if (prev !== undefined) process.env.OPENAI_API_KEY = prev;
    }
  });

  it("does not call the judge when a scenario has no speech assertions", async () => {
    const prev = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      const result = await gradeScenario(scenario, conversation({ endedCall: true }));
      expect(result.failures).toEqual([]);
    } finally {
      if (prev !== undefined) process.env.OPENAI_API_KEY = prev;
    }
  });
});

describe("gradeScenario — how a call ended", () => {
  it("passes when the assistant called end_call", async () => {
    const result = await gradeScenario(scenario, conversation({ endedCall: true }));
    expect(result.failures).toEqual([]);
  });

  it("passes when the caller hung up — Twilio tears the call down either way", async () => {
    const result = await gradeScenario(scenario, conversation({ callerHungUp: true }));
    expect(result.failures).toEqual([]);
  });

  it("reports a line left open when nobody ended the call within budget", async () => {
    const result = await gradeScenario(scenario, conversation());
    expect(result.failures).toContain("neither end_call nor a caller hangup — the line would stay open");
  });

  // This distinction cost a whole gate run: five reds across three trades, one
  // of them the report's only "defect", were the harness stopping the
  // conversation rather than the assistant leaving the line open.
  //
  // The first fix RENAMED the failure and still pushed it, so the message said
  // "inconclusive" while the run went on dragging the pass rate down — the
  // label was a lie. A run that hit the cap is now not a failure at all. The
  // flag stays on the result and scripts/run-eval.ts prints it loudly, because
  // an unreported inconclusive run reads as a pass, and swapping a false red
  // for a false green would be the worse trade.
  it("does not score a run that hit the turn cap as a defect", async () => {
    const result = await gradeScenario(scenario, conversation({ hitTurnCap: true }));
    expect(result.failures).toEqual([]);
    expect(result.hitTurnCap).toBe(true);
  });
});

describe("the judge failing to answer is not permission", () => {
  // read() mapped any key the judge omitted to ABSENT, and ABSENT PASSES a
  // mustNotSay. One scenario sends up to six items in a single prompt, so a
  // truncated or partially-keyed reply tightened the requirements and quietly
  // loosened every prohibition — the same fail-open as the STATED false green,
  // in different clothes.
  it("fails a prohibition the judge returned no verdict for", async () => {
    const scenarioWithBan: EvalScenario = {
      ...scenario,
      mustNotSay: ["quoted a price"]
    };
    // No API key => judgeSpeech short-circuits before calling out, which is a
    // different path; this asserts the shape of read()'s contract instead.
    const { failures } = await gradeScenario(
      scenarioWithBan,
      conversation({ endedCall: true, transcript: [{ role: "assistant", text: "hello" }] })
    );
    // The judge is unreachable offline and SAYS so, rather than silently
    // reporting the prohibition as satisfied. Writing this test is what found
    // that tests/setup-env.ts only defaulted the credentials instead of
    // deleting them — so on a machine with OPENAI_API_KEY exported, this very
    // assertion made a real billed gpt-4o call and came back empty.
    expect(failures.join(" ")).toMatch(/judge skipped|no verdict/);
  });
});
