import { describe, it, expect } from "vitest";
import { rm } from "node:fs/promises";
import { writeRunFile, readRunFile, compareRuns, judgeSample, type EvalRunFile } from "../src/testing/eval/persist.js";

function report(id: string, passes: number, runs: number, verdict: string, priority = "P0") {
  return {
    scenarioId: id, trade: "plumber", priority, runs, passes, verdict,
    inconclusiveRuns: 0, failureCounts: [], results: [] as unknown[]
  };
}
function run(reports: unknown[]): EvalRunFile {
  return {
    formatVersion: 1, startedAt: "2026-08-03T00:00:00.000Z", argv: [],
    models: { assistant: "a", caller: "c", judge: "j" }, repeat: 3,
    totals: { scenarios: reports.length, conversations: reports.length * 3, usd: 1 },
    reports: reports as never
  };
}

describe("eval run files", () => {
  it("round-trips, transcripts and all", async () => {
    const path = `.tmp/test-run-${Date.now()}.json`;
    const withTranscript = {
      ...report("s1", 3, 3, "pass"),
      results: [{
        scenarioId: "s1", trade: "plumber", priority: "P0", passed: true, failures: [],
        captured: { name: "Gary" }, savedLead: true, endedCall: true, callerHungUp: false,
        turnCount: 6, hitTurnCap: false,
        transcript: [{ role: "assistant", text: "hello" }, { role: "caller", text: "hi" }]
      }]
    };
    writeRunFile(path, run([withTranscript]));
    const back = readRunFile(path);
    // The transcripts are the whole point — a run file without them cannot
    // answer the question that motivated this file.
    expect(back.reports[0].results[0].transcript).toHaveLength(2);
    expect(back.reports[0].results[0].captured).toEqual({ name: "Gary" });
    await rm(path, { force: true });
  });

  it("refuses a format it does not understand rather than guessing", async () => {
    const path = `.tmp/test-run-bad-${Date.now()}.json`;
    const bad = { ...run([]), formatVersion: 2 } as unknown as EvalRunFile;
    writeRunFile(path, bad);
    expect(() => readRunFile(path)).toThrow(/unsupported eval run format/);
    await rm(path, { force: true });
  });
});

describe("comparing two runs", () => {
  it("pairs by scenario rather than comparing headline totals", () => {
    const before = run([report("a", 3, 3, "pass"), report("b", 3, 3, "pass"), report("c", 0, 3, "fail")]);
    const after = run([report("a", 3, 3, "pass"), report("b", 1, 3, "marginal"), report("c", 3, 3, "pass")]);
    const cmp = compareRuns(before, after);
    // Headline is 6/9 both times. Paired, one scenario broke and one was fixed
    // — which is the finding, and the headline hides it completely.
    expect(cmp.regressed.map((d) => d.scenarioId)).toEqual(["b"]);
    expect(cmp.improved.map((d) => d.scenarioId)).toEqual(["c"]);
    expect(cmp.unchanged).toBe(1);
  });

  it("names scenarios present on only one side instead of counting them as change", () => {
    const before = run([report("a", 3, 3, "pass"), report("gone", 3, 3, "pass")]);
    const after = run([report("a", 3, 3, "pass"), report("new", 0, 3, "fail")]);
    const cmp = compareRuns(before, after);
    // A filter difference is not a regression. Silently treating it as one is
    // how a comparison lies to the person reading it.
    expect(cmp.added).toEqual(["new"]);
    expect(cmp.removed).toEqual(["gone"]);
    expect(cmp.regressed).toEqual([]);
  });

  it("compares rates, so an escalated n=9 scenario is comparable to an n=3 one", () => {
    const before = run([report("a", 3, 3, "pass")]);          // 100%
    const after = run([report("a", 7, 9, "marginal")]);         // 78%
    const cmp = compareRuns(before, after);
    expect(cmp.regressed).toHaveLength(1);
    expect(cmp.regressed[0].change).toBeCloseTo(7 / 9 - 1, 5);
  });

  it("ranks P0 regressions above the rest", () => {
    const before = run([report("p2", 3, 3, "pass", "P2"), report("p0", 3, 3, "pass", "P0")]);
    const after = run([report("p2", 0, 3, "fail", "P2"), report("p0", 2, 3, "marginal", "P0")]);
    expect(compareRuns(before, after).regressed[0].scenarioId).toBe("p0");
  });
});

describe("judgeSample", () => {
  // The judge has had four verdicts overturned and its only measured accuracy
  // is six single-sentence mustNotSay probes. This turns a run already paid for
  // into the sample that would answer it.
  it("extracts every judged assertion with the words it judged", () => {
    const r = run([{
      ...report("s1", 0, 1, "fail"),
      results: [{
        scenarioId: "s1", trade: "plumber", priority: "P0", passed: false,
        failures: [
          'SAID SOMETHING IT MUST NOT: quoted a price\n          judge quoted: "that\'ll be $340"',
          "did not say: asked for a number\n          judge stance: ABSENT",
          "required field not captured: name"
        ],
        captured: {}, savedLead: true, endedCall: true, callerHungUp: false,
        turnCount: 4, hitTurnCap: false,
        transcript: [{ role: "assistant", text: "that'll be $340" }, { role: "caller", text: "ok" }]
      }]
    }]);
    const sample = judgeSample(r);
    // Only judged items. "required field not captured" is deterministic and
    // has nothing to do with the judge's accuracy.
    expect(sample).toHaveLength(2);
    expect(sample.map((s) => s.kind).sort()).toEqual(["mustNotSay", "mustSay"]);
    // Assistant words only — a labeller grades what the judge graded.
    expect(sample[0].assistantWords).toBe("that'll be $340");
    expect(sample[0].assistantWords).not.toContain("ok");
  });
});
