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
import { aggregate } from "../src/testing/eval/aggregate.js";
import { costReport, estimate } from "../src/testing/eval/cost.js";
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
  const id = arg("id");
  if (id) return list.filter((s) => s.id === id);
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

  const results = await pooled<{ scenario: EvalScenario; run: number }, EvalResult>(
    work,
    CONCURRENCY,
    async ({ scenario, run }) => {
      const label = REPEAT > 1 ? ` (run ${run + 1}/${REPEAT})` : "";
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

  const reports = aggregate(results);
  const defects = reports.filter((r) => r.verdict === "fail");
  const marginal = reports.filter((r) => r.verdict === "marginal");
  const passed = reports.filter((r) => r.verdict === "pass");

  console.log(`\n${"─".repeat(60)}`);
  console.log(
    REPEAT > 1
      ? `${passed.length}/${reports.length} scenarios passed all ${REPEAT} runs`
      : `${passed.length}/${reports.length} passed`
  );
  if (REPEAT > 1) {
    console.log(`  ${defects.length} failed every run`);
    console.log(`  ${marginal.length} marginal — passed some runs, failed others`);
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
  const report = costReport(work.length);
  if (report) console.log(report);

  // The gate is the rate. A P0 that fails every run is a defect and blocks; a
  // P0 that flaps is not a release blocker, but it is not a pass either and
  // must not be able to hide inside a headline number.
  const p0Defects = defects.filter((r) => r.priority === "P0");
  const p0Marginal = marginal.filter((r) => r.priority === "P0");

  if (p0Marginal.length > 0) {
    console.log(
      `\n${p0Marginal.length} P0 scenario(s) are marginal — not blocking, not passing. ` +
        `Read the transcripts before treating this run as green.`
    );
  }
  if (p0Defects.length > 0) {
    console.log(`\n${p0Defects.length} P0 defect(s) — these block release.`);
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
