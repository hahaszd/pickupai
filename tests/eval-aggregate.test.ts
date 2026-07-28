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

  it("refuses to grade zero runs rather than reporting a pass", () => {
    expect(() => classify(0, 0)).toThrow();
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
