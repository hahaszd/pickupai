import type { EvalResult, ScenarioReport, ScenarioVerdict } from "./types.js";

/**
 * Collapse N runs of a scenario into one verdict.
 *
 * Pure, so the classification the release gate depends on is unit-testable
 * without spending a cent on conversations.
 */
/**
 * The threshold at which a scenario is re-run to settle a `marginal`, and the
 * criteria used once it has been.
 *
 * At n=3, `marginal` is mostly dice. With 35 healthy P0 scenarios at a true
 * per-run pass rate of 0.95, **5.0 marginals per gate are pure sampling** —
 * and the measured baseline was 5 of 21, of which an n=9 follow-up found 4
 * were noise. Nothing about a 1/3 or 2/3 is actionable.
 *
 * Re-running only the marginals to n=9 improves BOTH ends, which is the
 * ordinary return on sample size rather than a trade:
 *
 *   true rate   P(pass) at 3/3   P(pass) at >=8/9
 *      0.95          85.7%            92.9%
 *      0.70          34.3%            19.6%
 *      0.50          12.5%             2.0%
 *
 * The criterion has to loosen from "every run" to ">=8/9" in the same move: a
 * genuinely healthy p=0.95 scenario returns 9/9 only 63% of the time, so
 * demanding perfection at n=9 would be noisier than n=3, not quieter.
 */
export const ESCALATE_TO_RUNS = 9;
const ESCALATED_PASS = 8;   // >= 8 of 9
const ESCALATED_FAIL = 4;   // <= 4 of 9 — wrong more often than right

export function classify(passes: number, runs: number): ScenarioVerdict {
  // runs here is the CONCLUSIVE count. Zero means every run hit the turn cap
  // and the scenario has no measurement at all — which must not read as a pass
  // (nothing was verified) or as a defect (nothing misbehaved).
  if (runs <= 0) return "inconclusive";

  // Escalated scenarios are judged on a rate. Keyed on the run count rather
  // than a ratio applied uniformly, because the same ratio at n=3 would make
  // 1/3 a defect and that is not what a single bad sample means.
  if (runs >= ESCALATE_TO_RUNS) {
    if (passes >= ESCALATED_PASS) return "pass";
    if (passes <= ESCALATED_FAIL) return "fail";
    return "marginal";
  }

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
    // Capped runs come out of the denominator as well as the numerator. Leaving
    // them in the denominator turns "we could not measure it" into a pass rate
    // of 2/3, which reads as flakiness in the product rather than in the
    // harness — and that is a wrong diagnosis someone then acts on.
    const conclusive = runs.filter((r) => !r.hitTurnCap);
    const passes = conclusive.filter((r) => r.passed).length;

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
      runs: conclusive.length,
      passes,
      inconclusiveRuns: runs.length - conclusive.length,
      verdict: classify(passes, conclusive.length),
      failureCounts: [...counts]
        .map(([failure, n]) => ({ failure, runs: n }))
        .sort((a, b) => b.runs - a.runs || a.failure.localeCompare(b.failure)),
      results: runs
    };
  });
}
