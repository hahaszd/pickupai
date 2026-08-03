import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import type { ScenarioReport, EvalResult } from "./types.js";

/**
 * Write a run to disk, and compare two runs scenario by scenario.
 *
 * The harness wrote NOTHING until 2026-08-03. Every number in `docs/eval.md`
 * had been transcribed by a human from a console, and four things were
 * impossible as a result:
 *
 *   - **Reading a transcript you already paid for.** A scenario landed 7/9 with
 *     its two failures in OPPOSITE directions, and deciding whether to touch the
 *     prompt needed those nine transcripts. They were gone. Re-running to read
 *     them means buying the same conversations twice.
 *   - **A paired comparison.** The gate runs the SAME scenarios before and after
 *     a change, which is a matched design — and comparing two headline numbers
 *     throws that away. With σ≈2.7 scenarios per run, a 2-point move in the
 *     headline is noise, and this file records twice in one day that it was read
 *     as signal.
 *   - **Measuring the JUDGE.** Four of its verdicts have been overturned, all on
 *     mustSay / mustDiscourage / multi-turn transcripts. The only evidence about
 *     its accuracy is six single-sentence mustNotSay probes. Labelling 60 saved
 *     (transcript, item) pairs costs nothing in API calls — but only if they were
 *     saved.
 *   - **Testing whether the context-free scenario exercise worked.** A scenario
 *     written from outside the prompt's context should have a LOWER first-run
 *     pass rate than one restating a rule. Nobody computed it because per-run
 *     results were never stored.
 */

/** Everything a later run, or a human, needs. Versioned so a format change is visible. */
export type EvalRunFile = {
  formatVersion: 1;
  /** Passed in rather than read from the clock, so a caller can label a run. */
  startedAt: string;
  /** The exact argv, so a report can never be attributed to the wrong filters. */
  argv: string[];
  models: { assistant: string; caller: string; judge: string };
  repeat: number;
  totals: { scenarios: number; conversations: number; usd: number | null };
  reports: ScenarioReport[];
};

export function writeRunFile(path: string, run: EvalRunFile): void {
  mkdirSync(dirname(path), { recursive: true });
  // Pretty-printed on purpose: these get read by humans and diffed by git far
  // more often than they get parsed.
  writeFileSync(path, JSON.stringify(run, null, 2) + "\n", "utf8");
}

export function readRunFile(path: string): EvalRunFile {
  const parsed = JSON.parse(readFileSync(path, "utf8")) as EvalRunFile;
  if (parsed.formatVersion !== 1) {
    throw new Error(`unsupported eval run format ${parsed.formatVersion} in ${path}`);
  }
  return parsed;
}

export type ScenarioDelta = {
  scenarioId: string;
  priority: string;
  before: { passes: number; runs: number; verdict: string };
  after: { passes: number; runs: number; verdict: string };
  /** Positive means it improved. */
  change: number;
};

export type RunComparison = {
  /** Only in the new run — a scenario added since. */
  added: string[];
  /** Only in the baseline — deleted, or filtered out of this run. */
  removed: string[];
  regressed: ScenarioDelta[];
  improved: ScenarioDelta[];
  unchanged: number;
};

/**
 * Compare per SCENARIO, never headline to headline.
 *
 * The same scenario before and after a change is a paired observation, and
 * pairing is most of the statistical power available here. "38/47 became 37/47"
 * discards it and invites a conclusion the sample cannot support; "these two
 * scenarios got worse and these three got better" is a finding.
 *
 * A scenario present in only one run is reported separately rather than counted
 * as a change — a filter difference is not a regression, and silently treating
 * it as one is how a run comparison lies.
 */
export function compareRuns(baseline: EvalRunFile, current: EvalRunFile): RunComparison {
  const before = new Map(baseline.reports.map((r) => [r.scenarioId, r]));
  const after = new Map(current.reports.map((r) => [r.scenarioId, r]));

  const added = [...after.keys()].filter((id) => !before.has(id));
  const removed = [...before.keys()].filter((id) => !after.has(id));

  const regressed: ScenarioDelta[] = [];
  const improved: ScenarioDelta[] = [];
  let unchanged = 0;

  for (const [id, a] of after) {
    const b = before.get(id);
    if (!b) continue;

    // Rates, because the two runs may have different --repeat values, and
    // because escalation means one scenario can be n=3 while another is n=9.
    const rateBefore = b.runs > 0 ? b.passes / b.runs : 0;
    const rateAfter = a.runs > 0 ? a.passes / a.runs : 0;
    const delta: ScenarioDelta = {
      scenarioId: id,
      priority: a.priority,
      before: { passes: b.passes, runs: b.runs, verdict: b.verdict },
      after: { passes: a.passes, runs: a.runs, verdict: a.verdict },
      change: rateAfter - rateBefore
    };

    // A verdict change is the signal; a rate wobble inside the same verdict is
    // usually sampling. Both are reported, but the verdict is what ranks.
    if (a.verdict !== b.verdict || Math.abs(delta.change) > 1e-9) {
      if (rateAfter < rateBefore) regressed.push(delta);
      else if (rateAfter > rateBefore) improved.push(delta);
      else unchanged++;
    } else {
      unchanged++;
    }
  }

  const worst = (x: ScenarioDelta, y: ScenarioDelta) =>
    (x.priority === "P0" ? -1 : 0) - (y.priority === "P0" ? -1 : 0) || x.change - y.change;
  regressed.sort(worst);
  improved.sort((x, y) => y.change - x.change);

  return { added, removed, regressed, improved, unchanged };
}

/** Human-readable, for the console. Returns "" when there is nothing to say. */
export function formatComparison(cmp: RunComparison, baselinePath: string): string {
  const lines: string[] = [`\nAgainst baseline ${baselinePath}:`];

  const row = (d: ScenarioDelta) =>
    `  [${d.priority}] ${d.scenarioId}  ${d.before.passes}/${d.before.runs} ${d.before.verdict}` +
    `  →  ${d.after.passes}/${d.after.runs} ${d.after.verdict}`;

  if (cmp.regressed.length) {
    lines.push(`  ${cmp.regressed.length} REGRESSED:`);
    lines.push(...cmp.regressed.map(row));
  }
  if (cmp.improved.length) {
    lines.push(`  ${cmp.improved.length} improved:`);
    lines.push(...cmp.improved.map(row));
  }
  lines.push(`  ${cmp.unchanged} unchanged`);
  // Named, not silently folded in — a scenario that only exists on one side is
  // a filter difference, and reading it as a change is how a comparison lies.
  if (cmp.added.length) lines.push(`  ${cmp.added.length} not in baseline: ${cmp.added.join(", ")}`);
  if (cmp.removed.length) lines.push(`  ${cmp.removed.length} in baseline but not run: ${cmp.removed.join(", ")}`);

  return lines.join("\n");
}

/**
 * Every (transcript, assertion) pair from a saved run, for hand-labelling the
 * judge against a human.
 *
 * The judge has had four verdicts overturned and its measured accuracy is six
 * single-sentence mustNotSay probes. This turns a run already paid for into the
 * sample that would answer it — the assistant's words and the item, with the
 * judge's own answer withheld so a labeller is not anchored by it.
 */
export function judgeSample(run: EvalRunFile): Array<{
  scenarioId: string;
  assertion: string;
  kind: "mustSay" | "mustNotSay" | "mustDiscourage";
  assistantWords: string;
  judgeSaid: string;
}> {
  const out: ReturnType<typeof judgeSample> = [];
  for (const report of run.reports) {
    for (const r of report.results as EvalResult[]) {
      const words = r.transcript
        .filter((t) => t.role === "assistant")
        .map((t) => t.text)
        .join("\n");
      for (const f of r.failures) {
        const [head, ...rest] = f.split("\n");
        const kind = head.startsWith("SAID SOMETHING IT MUST NOT")
          ? "mustNotSay"
          : head.startsWith("did not tell the caller not to")
            ? "mustDiscourage"
            : head.startsWith("did not say")
              ? "mustSay"
              : null;
        if (!kind) continue;
        out.push({
          scenarioId: r.scenarioId,
          assertion: head.replace(/^[^:]+:\s*/, ""),
          kind,
          assistantWords: words,
          judgeSaid: rest.join(" ").trim()
        });
      }
    }
  }
  return out;
}
