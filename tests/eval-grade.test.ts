import { describe, it, expect } from "vitest";
import { gradeScenario } from "../src/testing/eval/grade.js";
import type { EvalScenario, EvalResult } from "../src/testing/eval/types.js";

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
  it("names the harness turn cap instead, when that is what ended the run", async () => {
    const result = await gradeScenario(scenario, conversation({ hitTurnCap: true }));
    expect(result.failures.join(" ")).toContain("hit the harness turn cap");
    expect(result.failures.join(" ")).not.toContain("the line would stay open");
  });
});
