/**
 * Run the inbound-call eval.
 *
 *   npx tsx scripts/run-eval.ts                      # everything
 *   npx tsx scripts/run-eval.ts --trade plumber      # one trade
 *   npx tsx scripts/run-eval.ts --priority P0        # release gate only
 *   npx tsx scripts/run-eval.ts --id plumber_gas_smell_hot_water
 *   npx tsx scripts/run-eval.ts --p0 --verbose       # print failing transcripts
 *
 * Needs OPENAI_API_KEY. Costs real money — each scenario is a multi-turn
 * conversation plus a judge call, so a full run is roughly 45 conversations.
 * Start with --priority P0.
 */
// MUST be first: it fills the env that src/env.ts demands at import time,
// before any import below reaches it. Only OPENAI_API_KEY is really needed to
// run an eval, but env.ts throws on missing Twilio variables regardless.
import "../src/testing/eval/env-bootstrap.js";
import { ALL_EVAL_SCENARIOS } from "../src/testing/eval/scenarios/index.js";
import { runScenario } from "../src/testing/eval/runner.js";
import { gradeScenario } from "../src/testing/eval/grade.js";
import type { EvalResult, EvalScenario } from "../src/testing/eval/types.js";

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
  console.log(`Running ${scenarios.length} scenario(s) at concurrency ${CONCURRENCY}…\n`);

  const results = await pooled<EvalScenario, EvalResult>(scenarios, CONCURRENCY, async (scenario) => {
    try {
      const run = await runScenario(scenario);
      const result = await gradeScenario(scenario, run);
      console.log(
        `${result.passed ? "PASS" : "FAIL"}  [${scenario.priority}] ${scenario.id}` +
          (result.passed ? "" : `\n        ${result.failures.join("\n        ")}`)
      );
      return result;
    } catch (err) {
      // A crashed scenario is a failure, not a reason to lose the whole run.
      console.log(`ERROR [${scenario.priority}] ${scenario.id}: ${(err as Error).message}`);
      return {
        scenarioId: scenario.id, trade: scenario.trade, priority: scenario.priority,
        passed: false, failures: [`runner threw: ${(err as Error).message}`],
        captured: {}, savedLead: false, endedCall: false, turnCount: 0, transcript: []
      };
    }
  });

  const failed = results.filter((r) => !r.passed);
  const p0Failed = failed.filter((r) => r.priority === "P0");

  console.log(`\n${"─".repeat(60)}`);
  console.log(`${results.length - failed.length}/${results.length} passed`);

  const byTrade = new Map<string, { pass: number; total: number }>();
  for (const r of results) {
    const t = byTrade.get(r.trade) ?? { pass: 0, total: 0 };
    t.total++; if (r.passed) t.pass++;
    byTrade.set(r.trade, t);
  }
  for (const [trade, t] of [...byTrade].sort()) {
    console.log(`  ${trade.padEnd(12)} ${t.pass}/${t.total}`);
  }

  if (has("verbose")) {
    for (const r of failed) {
      console.log(`\n${"═".repeat(60)}\n${r.scenarioId}`);
      for (const line of r.transcript) console.log(`  ${line.role.padEnd(9)} ${line.text}`);
    }
  }

  if (p0Failed.length > 0) {
    console.log(`\n${p0Failed.length} P0 failure(s) — these block release.`);
    process.exit(1);
  }
  if (failed.length > 0) {
    console.log(`\n${failed.length} non-P0 failure(s) — backlog, not a blocker.`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
