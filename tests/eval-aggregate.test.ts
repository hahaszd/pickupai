import { describe, it, expect } from "vitest";
import { aggregate, classify } from "../src/testing/eval/aggregate.js";
import type { EvalResult } from "../src/testing/eval/types.js";

/**
 * The release gate reads these verdicts, so they are worth being able to test
 * without spending money on conversations.
 */
function run(scenarioId: string, passed: boolean, failures: string[] = []): EvalResult {
  return {
    scenarioId,
    trade: "electrician",
    priority: "P0",
    passed,
    failures,
    captured: {},
    savedLead: passed,
    endedCall: passed,
    callerHungUp: false,
    turnCount: 4,
    hitTurnCap: false,
    transcript: []
  };
}

describe("classify", () => {
  it("calls it a pass only when every run passed", () => {
    expect(classify(3, 3)).toBe("pass");
    expect(classify(2, 3)).toBe("marginal");
  });

  it("calls it a defect only when every run failed", () => {
    expect(classify(0, 3)).toBe("fail");
    expect(classify(1, 3)).toBe("marginal");
  });

  // Was `expect(() => classify(0,0)).toThrow()`. Zero CONCLUSIVE runs is now a
  // real state rather than a programming error: every run hit the turn cap, so
  // the scenario was never measured. It must not read as a pass — nothing was
  // verified — nor as a defect, since nothing misbehaved.
  it("reports zero conclusive runs as inconclusive, never as a pass", () => {
    expect(classify(0, 0)).toBe("inconclusive");
  });

  it("keeps a capped run out of both the numerator and the denominator", () => {
    const runs = [
      { scenarioId: "s", trade: "plumber", priority: "P0", passed: true, failures: [], hitTurnCap: false },
      { scenarioId: "s", trade: "plumber", priority: "P0", passed: true, failures: [], hitTurnCap: false },
      { scenarioId: "s", trade: "plumber", priority: "P0", passed: false, failures: [], hitTurnCap: true }
    ] as never[];
    const [report] = aggregate(runs);
    // 2/2, not 2/3 — "we could not measure it" is not two-thirds of a pass, and
    // reading it that way diagnoses flakiness in the product instead of the
    // harness.
    expect(report.runs).toBe(2);
    expect(report.passes).toBe(2);
    expect(report.inconclusiveRuns).toBe(1);
    expect(report.verdict).toBe("pass");
  });

  it("calls a scenario inconclusive when every run hit the cap", () => {
    const runs = [
      { scenarioId: "s", trade: "plumber", priority: "P0", passed: false, failures: [], hitTurnCap: true },
      { scenarioId: "s", trade: "plumber", priority: "P0", passed: false, failures: [], hitTurnCap: true }
    ] as never[];
    const [report] = aggregate(runs);
    expect(report.verdict).toBe("inconclusive");
    expect(report.runs).toBe(0);
  });
});

describe("aggregate", () => {
  it("reports the rate rather than the last run", () => {
    const [report] = aggregate([
      run("electrician_a", true),
      run("electrician_a", false, ["did not say: told the caller to call 000"]),
      run("electrician_a", true)
    ]);
    expect(report.passes).toBe(2);
    expect(report.runs).toBe(3);
    expect(report.verdict).toBe("marginal");
  });

  it("counts how many runs each failure appeared in", () => {
    const [report] = aggregate([
      run("electrician_a", false, ["required field not captured: phone", "urgency_level was routine, expected urgent"]),
      run("electrician_a", false, ["required field not captured: phone"]),
      run("electrician_a", false, ["required field not captured: phone"])
    ]);
    expect(report.verdict).toBe("fail");
    expect(report.failureCounts).toEqual([
      { failure: "required field not captured: phone", runs: 3 },
      { failure: "urgency_level was routine, expected urgent", runs: 1 }
    ]);
  });

  it("groups a failure and the judge's quote for it as one failure", () => {
    const [report] = aggregate([
      run("electrician_a", false, ['SAID SOMETHING IT MUST NOT: opened the switchboard\n          judge quoted: "have a look inside"']),
      run("electrician_a", false, ['SAID SOMETHING IT MUST NOT: opened the switchboard\n          judge quoted: "pop the cover off"'])
    ]);
    expect(report.failureCounts).toEqual([
      { failure: "SAID SOMETHING IT MUST NOT: opened the switchboard", runs: 2 }
    ]);
  });

  it("counts a repeated failure within one run once", () => {
    const [report] = aggregate([
      run("electrician_a", false, ["required field not captured: phone", "required field not captured: phone"])
    ]);
    expect(report.failureCounts).toEqual([{ failure: "required field not captured: phone", runs: 1 }]);
  });

  it("keeps one report per scenario, in the order they were first run", () => {
    const reports = aggregate([
      run("electrician_b", true),
      run("electrician_a", true),
      run("electrician_b", false, ["x"])
    ]);
    expect(reports.map((r) => r.scenarioId)).toEqual(["electrician_b", "electrician_a"]);
    expect(reports[0].runs).toBe(2);
    expect(reports[1].runs).toBe(1);
  });
});

describe("escalated verdicts", () => {
  // Only the marginals get re-run, so a scenario can be judged at n=3 or n=9
  // in the same report. The criteria differ deliberately: at n=9 a genuinely
  // healthy scenario (true rate 0.95) returns 9/9 only 63% of the time, so
  // demanding perfection there would be NOISIER than n=3, not quieter.
  it("passes on 8 of 9, where 8 of 9 would be marginal at n=3 semantics", () => {
    expect(classify(8, 9)).toBe("pass");
    expect(classify(9, 9)).toBe("pass");
  });

  it("calls it a defect when it is wrong more often than right", () => {
    expect(classify(4, 9)).toBe("fail");
    expect(classify(0, 9)).toBe("fail");
  });

  it("leaves the genuinely ambiguous middle as marginal", () => {
    for (const passes of [5, 6, 7]) {
      expect(classify(passes, 9), `${passes}/9`).toBe("marginal");
    }
  });

  // The same ratio applied uniformly would make 1/3 a defect, and one bad
  // sample out of three is not evidence of that. The rule is keyed on the run
  // count on purpose.
  it("does not apply the escalated ratio to an unescalated scenario", () => {
    expect(classify(1, 3)).toBe("marginal");
    expect(classify(2, 3)).toBe("marginal");
    expect(classify(3, 3)).toBe("pass");
    expect(classify(0, 3)).toBe("fail");
  });
});
