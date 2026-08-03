/**
 * Run the inbound-call eval.
 *
 *   npx tsx scripts/run-eval.ts                      # everything, once each
 *   npx tsx scripts/run-eval.ts --trade plumber      # one trade
 *   npx tsx scripts/run-eval.ts --priority P0        # release gate only
 *   npx tsx scripts/run-eval.ts --id plumber_gas_smell_hot_water
 *   npx tsx scripts/run-eval.ts --repeat 3           # grade on a pass RATE
 *   npx tsx scripts/run-eval.ts --p0 --verbose       # print failing transcripts
 *
 * Needs OPENAI_API_KEY. Costs real money — each scenario run is a multi-turn
 * conversation plus a judge call, and --repeat multiplies that. Start with
 * --priority P0.
 */
// MUST be first: it fills the env that src/env.ts demands at import time,
// before any import below reaches it. Only OPENAI_API_KEY is really needed to
// run an eval, but env.ts throws on missing Twilio variables regardless.
import "../src/testing/eval/env-bootstrap.js";
import { ALL_EVAL_SCENARIOS } from "../src/testing/eval/scenarios/index.js";
import { runScenario } from "../src/testing/eval/runner.js";
import { gradeScenario } from "../src/testing/eval/grade.js";
import { aggregate, ESCALATE_TO_RUNS } from "../src/testing/eval/aggregate.js";
import { costReport, estimate, totalUsd } from "../src/testing/eval/cost.js";
import { writeRunFile, readRunFile, compareRuns, formatComparison } from "../src/testing/eval/persist.js";
import { ASSISTANT_MODEL, CALLER_MODEL } from "../src/testing/eval/runner.js";
import { JUDGE_MODEL } from "../src/testing/eval/grade.js";
import type { EvalResult, EvalScenario, ScenarioReport } from "../src/testing/eval/types.js";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const has = (name: string) => process.argv.includes(`--${name}`);

// How many conversations run at once.
//
// Default 1. The system prompt under test is ~7k tokens and is resent every
// turn, so on a 30k tokens-per-minute tier a single request is a fifth of the
// minute's budget and two conversations in parallel simply queue behind each
// other on retries. Raise it with --concurrency if the account has headroom.
const CONCURRENCY = Number(arg("concurrency") ?? 1);

// How many times each scenario runs.
//
// Default 1 because a full library at 3 costs triple, but a single run is not
// a result: two consecutive full runs of unchanged code gave 38/47 and 37/47
// with only partly-overlapping failures. Anything whose number will be quoted
// — a release gate, a before/after on a prompt change — wants at least 3.
const REPEAT = Math.max(1, Number(arg("repeat") ?? 1));

async function pooled<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    })
  );
  return out;
}

function select(): EvalScenario[] {
  let list = ALL_EVAL_SCENARIOS;
  // Comma-separated, because a staged slice is several scenarios and running
  // them one --id at a time gives several separate cost reports and several
  // separate pass rates — which is exactly what the slice is trying to avoid.
  const id = arg("id");
  if (id) {
    const wanted = new Set(id.split(",").map((x) => x.trim()).filter(Boolean));
    const picked = list.filter((s) => wanted.has(s.id));
    // A typo in a scenario id would otherwise silently shrink the slice, and a
    // slice that ran three of the four things you changed reads as a pass.
    const missing = [...wanted].filter((w) => !picked.some((s) => s.id === w));
    if (missing.length) {
      console.error(`No such scenario(s): ${missing.join(", ")}`);
      process.exit(1);
    }
    return picked;
  }
  const trade = arg("trade");
  if (trade) list = list.filter((s) => s.trade === trade);
  const priority = arg("priority") ?? (has("p0") ? "P0" : undefined);
  if (priority) list = list.filter((s) => s.priority === priority);
  return list;
}

/** Print the failing runs of one scenario, labelled so reds can be compared. */
function printTranscripts(report: ScenarioReport) {
  for (const [i, run] of report.results.entries()) {
    if (run.passed) continue;
    console.log(`\n${"═".repeat(60)}\n${report.scenarioId}  run ${i + 1}/${report.runs}`);
    for (const line of run.transcript) console.log(`  ${line.role.padEnd(9)} ${line.text}`);
  }
}

function printFailures(report: ScenarioReport) {
  for (const { failure, runs } of report.failureCounts) {
    console.log(`        ${report.runs > 1 ? `${runs}× ` : ""}${failure}`);
  }
}

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error("OPENAI_API_KEY is not set.");
    process.exit(2);
  }

  const scenarios = select();
  if (scenarios.length === 0) {
    console.error("No scenarios matched those filters.");
    process.exit(2);
  }

  // Scenario-major, so a scenario's repeats print together and the console can
  // be read as it goes.
  const work = scenarios.flatMap((scenario) =>
    Array.from({ length: REPEAT }, (_, run) => ({ scenario, run }))
  );
  // --estimate answers "is this a 40 cent run or a 40 dollar one" BEFORE
  // committing. Costing a run only afterwards is the wrong time to find out.
  if (has("estimate")) {
    console.log(`\nWould run: ${estimate(work.length)}\n`);
    process.exit(0);
  }

  console.log(
    `Running ${scenarios.length} scenario(s) × ${REPEAT} = ${work.length} conversation(s) ` +
      `at concurrency ${CONCURRENCY}\n` +
      `Projected cost: ${estimate(work.length)}\n`
  );

  const runAll = (
    batch: Array<{ scenario: EvalScenario; run: number }>,
    total: number
  ) => pooled<{ scenario: EvalScenario; run: number }, EvalResult>(
    batch,
    CONCURRENCY,
    async ({ scenario, run }) => {
      const label = total > 1 ? ` (run ${run + 1}/${total})` : "";
      try {
        const conversation = await runScenario(scenario);
        const result = await gradeScenario(scenario, conversation);
        console.log(
          `${result.passed ? "PASS" : "FAIL"}  [${scenario.priority}] ${scenario.id}${label}` +
            (result.passed ? "" : `\n        ${result.failures.join("\n        ")}`)
        );
        return result;
      } catch (err) {
        // A crashed run is a failure, not a reason to lose the whole eval.
        console.log(`ERROR [${scenario.priority}] ${scenario.id}${label}: ${(err as Error).message}`);
        return {
          scenarioId: scenario.id, trade: scenario.trade, priority: scenario.priority,
          passed: false, failures: [`runner threw: ${(err as Error).message}`],
          captured: {}, savedLead: false, endedCall: false, callerHungUp: false, turnCount: 0,
          hitTurnCap: false, transcript: []
        };
      }
    }
  );

  const startedAt = new Date().toISOString();
  const firstPass = await runAll(work, REPEAT);

  let results = firstPass;

  // ── Escalation ────────────────────────────────────────────────────────────
  //
  // A `marginal` at n=3 is mostly dice: with 35 healthy P0 scenarios at a true
  // per-run rate of 0.95, five marginals per gate are pure sampling, and the
  // one n=9 follow-up ever run by hand found four of five were noise. Nothing
  // about a 1/3 or a 2/3 is actionable, so the verdict was a place findings
  // went to be ignored.
  //
  // Only the marginals are re-run, and only up to n=9 total — the first three
  // runs are kept, because they are i.i.d. samples from the same distribution
  // and there is no reason to buy them twice. Roughly 5 scenarios × 6 runs
  // ≈ $0.72 on a full gate.
  const escalate = !has("no-escalate") && REPEAT < ESCALATE_TO_RUNS;
  if (escalate) {
    const toSettle = aggregate(firstPass).filter((r) => r.verdict === "marginal");
    if (toSettle.length > 0) {
      const extraPer = ESCALATE_TO_RUNS - REPEAT;
      const extra = toSettle.flatMap((r) => {
        const scenario = scenarios.find((sc) => sc.id === r.scenarioId)!;
        return Array.from({ length: extraPer }, (_, run) => ({ scenario, run }));
      });
      console.log(
        `\n${"─".repeat(60)}\n` +
        `Settling ${toSettle.length} marginal scenario(s) at n=${ESCALATE_TO_RUNS} — ` +
        `${extra.length} more conversation(s), ${estimate(extra.length)}\n` +
        `  ${toSettle.map((r) => r.scenarioId).join(", ")}\n` +
        `  Judged on >=8/9 rather than 3/3: a healthy scenario returns 9/9 only 63% of the time.\n`
      );
      results = firstPass.concat(await runAll(extra, ESCALATE_TO_RUNS));
    }
  }

  const reports = aggregate(results);
  const escalatedIds = new Set(
    reports.filter((r) => r.runs + (r.inconclusiveRuns ?? 0) > REPEAT).map((r) => r.scenarioId)
  );
  const defects = reports.filter((r) => r.verdict === "fail");
  const marginal = reports.filter((r) => r.verdict === "marginal");
  const passed = reports.filter((r) => r.verdict === "pass");
  // Never measured at all — every run hit the turn cap. Reported separately
  // from both passes and defects, and it blocks, because an unmeasured P0 is
  // not a P0 that behaved.
  const inconclusive = reports.filter((r) => r.verdict === "inconclusive");

  console.log(`\n${"─".repeat(60)}`);
  if (escalatedIds.size > 0) {
    // A verdict reached under a different rule must not look identical to one
    // reached under the default. "passed all 3 runs" and ">=8 of 9" are not the
    // same claim and the report should not let them read as one.
    console.log(
      `Settled at n=${ESCALATE_TO_RUNS} (>=8/9 to pass, <=4/9 a defect): ` +
      `${[...escalatedIds].join(", ")}\n`
    );
  }
  console.log(
    REPEAT > 1
      ? `${passed.length}/${reports.length} scenarios passed`
      : `${passed.length}/${reports.length} passed`
  );
  if (REPEAT > 1) {
    console.log(`  ${defects.length} failed every run`);
    console.log(`  ${marginal.length} marginal — passed some runs, failed others`);
  }

  // A run that hit the turn cap is INCONCLUSIVE: the assistant was never given
  // the turn in which it would have ended the call. It stopped being scored as
  // a defect on 2026-07-29 — and that alone would have turned a false red into
  // a false green, because an unreported inconclusive run reads as a pass.
  // So it is counted here, loudly, and the scenario is named.
  const cappedRuns = results.filter((r) => r.hitTurnCap);
  if (cappedRuns.length > 0) {
    const ids = [...new Set(cappedRuns.map((r) => r.scenarioId))];
    console.log(
      `\n  ⚠ ${cappedRuns.length} run(s) hit the turn cap and are INCONCLUSIVE, not passes: ${ids.join(", ")}`
    );
    console.log(
      "    The assistant never got the turn in which it would have ended the call."
    );
    console.log(
      "    A scenario capping repeatedly needs its caller script shortened, not its assertions loosened."
    );
  }

  // Per trade, counted on the scenario's verdict rather than on individual
  // runs: a scenario that flapped is not two-thirds of a pass.
  const byTrade = new Map<string, { pass: number; total: number }>();
  for (const r of reports) {
    const t = byTrade.get(r.trade) ?? { pass: 0, total: 0 };
    t.total++; if (r.verdict === "pass") t.pass++;
    byTrade.set(r.trade, t);
  }
  for (const [trade, t] of [...byTrade].sort()) {
    console.log(`  ${trade.padEnd(12)} ${t.pass}/${t.total}`);
  }

  if (defects.length > 0) {
    console.log(
      `\nDEFECTS — failed every run${REPEAT > 1 ? ", the only trustworthy reds" : ""}:`
    );
    for (const r of defects) {
      console.log(`  [${r.priority}] ${r.scenarioId}`);
      printFailures(r);
    }
  }

  // Reported separately and never rounded away. A scenario that flaps is
  // telling you the prompt is ambiguous at that point, which is a finding —
  // and it is also the shape a defect takes before anyone notices it.
  if (marginal.length > 0) {
    console.log(`\nMARGINAL — passed some runs, failed others:`);
    for (const r of marginal) {
      console.log(`  [${r.priority}] ${r.scenarioId}  ${r.passes}/${r.runs} passed`);
      printFailures(r);
    }
  }

  if (has("verbose")) {
    for (const r of [...defects, ...marginal]) printTranscripts(r);
  }

  // Always, and always before the verdict, so it is read rather than scrolled
  // past. Built from the token counts OpenAI returned, not from an assumption.
  // results.length, not work.length. `work` is the FIRST PASS only, so once
  // marginals started escalating this divided the whole bill by the smaller
  // number and reported $0.053 per conversation against an actual $0.023 —
  // 2.3x too high. docs/eval.md instructs updating
  // MEASURED_USD_PER_CONVERSATION from this very figure, so it would have been
  // believed and every future estimate inflated. "Never present an unexamined
  // column as a measurement" applies to the numbers this harness prints about
  // itself, not only to the ones it prints about the product.
  const report = costReport(results.length);
  if (report) console.log(report);

  // ── Persist ───────────────────────────────────────────────────────────────
  //
  // Written AFTER the cost report so `totalUsd()` is final. Until 2026-08-03
  // this harness wrote nothing at all: every figure in docs/eval.md was
  // transcribed by hand from a console, transcripts were discarded the moment
  // the process exited, and the same conversations had to be bought twice to
  // read one of them.
  const outPath = arg("out");
  if (outPath) {
    writeRunFile(outPath, {
      formatVersion: 1,
      startedAt,
      argv: process.argv.slice(2),
      models: { assistant: ASSISTANT_MODEL, caller: CALLER_MODEL, judge: JUDGE_MODEL },
      repeat: REPEAT,
      totals: { scenarios: reports.length, conversations: results.length, usd: totalUsd() },
      reports
    });
    console.log(`\nRun written to ${outPath} (${results.length} conversations, transcripts included)`);
  }

  // Paired, per scenario. The same scenarios run before and after a change are
  // a matched design, and comparing two headline numbers throws that away — with
  // sigma around 2.7 scenarios per run, a two-point move in the headline is
  // noise, and BACKLOG.md records that being read as signal twice in one day.
  const baselinePath = arg("baseline");
  if (baselinePath) {
    try {
      console.log(formatComparison(compareRuns(readRunFile(baselinePath), {
        formatVersion: 1, startedAt, argv: process.argv.slice(2),
        models: { assistant: ASSISTANT_MODEL, caller: CALLER_MODEL, judge: JUDGE_MODEL },
        repeat: REPEAT,
        totals: { scenarios: reports.length, conversations: results.length, usd: totalUsd() },
        reports
      }), baselinePath));
    } catch (err) {
      console.error(`\nCould not compare against ${baselinePath}: ${(err as Error).message}`);
    }
  }

  // The gate is the rate. A P0 that fails every run is a defect and blocks; a
  // P0 that flaps is not a release blocker, but it is not a pass either and
  // must not be able to hide inside a headline number.
  // An unmeasured P0 is not a P0 that behaved. This blocks alongside defects,
  // because the alternative is a gate that goes green by never running.
  const p0Inconclusive = inconclusive.filter((r) => r.priority === "P0");
  if (inconclusive.length > 0) {
    console.log(
      `\n${inconclusive.length} scenario(s) NEVER MEASURED — every run hit the turn cap: ` +
      inconclusive.map((r) => r.scenarioId).join(", ")
    );
  }

  // A PROHIBITION is not a rate. Capture is: whether a name came back on a
  // given run is sampling, and averaging it over three runs is the right
  // treatment. But "For a drain clear you're looking at $340 all up" is not a
  // sampling outcome — it is a sentence that was said to a caller, and in
  // production it gets said once. A single occurrence anywhere in the run is
  // the finding, and until 2026-07-31 one violation in three runs graded
  // `marginal`, printed under "not blocking, not passing", and exited zero.
  //
  // grade.ts already shouts these in caps. Nothing downstream read the label.
  const spoken = results.flatMap((r) =>
    r.failures
      .filter((f) => f.startsWith("SAID SOMETHING IT MUST NOT") || f.startsWith("did not tell the caller not to"))
      .map((f) => ({ scenarioId: r.scenarioId, priority: r.priority, failure: f.split("\n")[0].trim() }))
  );
  if (spoken.length > 0) {
    console.log(`\n${spoken.length} PROHIBITION BREACH(ES) — counted per occurrence, not per scenario:`);
    for (const v of [...new Set(spoken.map((v) => `  [${v.priority}] ${v.scenarioId}\n      ${v.failure}`))]) {
      console.log(v);
    }
  }

  // Suite-wide counts by kind. docs/eval.md has quoted "zero MUST NOT
  // violations across 102 conversations" since the day the judge was fixed,
  // and nothing in the code could compute that number.
  const kinds = new Map<string, number>();
  for (const r of results) {
    for (const f of new Set(r.failures.map((x) => x.split("\n")[0].trim()))) {
      const kind = f.startsWith("SAID SOMETHING IT MUST NOT") ? "prohibition breached"
        : f.startsWith("did not tell the caller not to") ? "failed to discourage"
        : f.startsWith("did not say") ? "required line not said"
        : f.startsWith("required field not captured") ? "field not captured"
        : f.startsWith("capture quality") ? "capture quality"
        : f.startsWith("caller_intent") ? "wrong caller_intent"
        : "other";
      kinds.set(kind, (kinds.get(kind) ?? 0) + 1);
    }
  }
  if (kinds.size > 0) {
    console.log("\nFailures by kind, across all runs:");
    for (const [k, n] of [...kinds].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${String(n).padStart(3)}  ${k}`);
    }
  }

  const p0Spoken = spoken.filter((v) => v.priority === "P0");
  const p0Defects = defects.filter((r) => r.priority === "P0");
  const p0Marginal = marginal.filter((r) => r.priority === "P0");

  if (p0Marginal.length > 0) {
    console.log(
      `\n${p0Marginal.length} P0 scenario(s) are marginal — not blocking, not passing. ` +
        `Read the transcripts before treating this run as green.`
    );
  }
  if (p0Defects.length > 0 || p0Inconclusive.length > 0 || p0Spoken.length > 0) {
    if (p0Spoken.length > 0) {
      console.log(
        `\n${p0Spoken.length} P0 prohibition breach(es) — these block release at n>=1. ` +
        `A thing said to a caller is not averaged away.`
      );
    }
    if (p0Defects.length > 0) {
      console.log(`\n${p0Defects.length} P0 defect(s) — these block release.`);
    }
    if (p0Inconclusive.length > 0) {
      console.log(
        `\n${p0Inconclusive.length} P0 scenario(s) were never measured — these block too. ` +
        `Shorten the caller script or raise the turn cap; do not loosen the assertions.`
      );
    }
    process.exit(1);
  }
  const nonP0 = defects.length + marginal.length - p0Defects.length - p0Marginal.length;
  if (nonP0 > 0) {
    console.log(`\n${nonP0} non-P0 scenario(s) not passing — backlog, not a blocker.`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
