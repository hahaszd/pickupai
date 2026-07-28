import type { EvalResult, ScenarioReport, ScenarioVerdict } from "./types.js";

/**
 * Collapse N runs of a scenario into one verdict.
 *
 * Pure, so the classification the release gate depends on is unit-testable
 * without spending a cent on conversations.
 */
export function classify(passes: number, runs: number): ScenarioVerdict {
  if (runs <= 0) throw new Error("classify() needs at least one run");
  if (passes === runs) return "pass";
  if (passes === 0) return "fail";
  return "marginal";
}

/**
 * A failure message carries the judge's quote on a second line, which differs
 * between runs of the same underlying failure. Counting has to group on the
 * failure, not on the evidence for it, or every run looks like a new problem.
 */
function failureKey(failure: string): string {
  return failure.split("\n")[0].trim();
}

/**
 * Group runs by scenario, in the order the scenarios were first seen, so the
 * report reads in the same order the run printed.
 */
export function aggregate(results: EvalResult[]): ScenarioReport[] {
  const byScenario = new Map<string, EvalResult[]>();
  for (const r of results) {
    const existing = byScenario.get(r.scenarioId);
    if (existing) existing.push(r);
    else byScenario.set(r.scenarioId, [r]);
  }

  return [...byScenario.values()].map((runs) => {
    const passes = runs.filter((r) => r.passed).length;

    const counts = new Map<string, number>();
    for (const run of runs) {
      // Within one run the same failure can only count once, otherwise a
      // scenario that lists two missing fields would inflate its own rate.
      for (const failure of new Set(run.failures.map(failureKey))) {
        counts.set(failure, (counts.get(failure) ?? 0) + 1);
      }
    }

    return {
      scenarioId: runs[0].scenarioId,
      trade: runs[0].trade,
      priority: runs[0].priority,
      runs: runs.length,
      passes,
      verdict: classify(passes, runs.length),
      failureCounts: [...counts]
        .map(([failure, n]) => ({ failure, runs: n }))
        .sort((a, b) => b.runs - a.runs || a.failure.localeCompare(b.failure)),
      results: runs
    };
  });
}
