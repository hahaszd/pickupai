/**
 * What a run of the eval actually costs.
 *
 * Every scenario run is a multi-turn conversation plus a judge call, and
 * `--repeat` multiplies it. Before this existed the only way to know the bill
 * was to open the OpenAI dashboard afterwards, which is the wrong time to find
 * out — so the runner now reports an estimate at the end of every run, and
 * `--estimate` prints one before spending anything.
 *
 * The numbers come from the token counts OpenAI returns on every response, so
 * only the per-million prices below are an assumption.
 */

/** USD per million tokens. Source: docs/research/openai-platform-2026-07.md. */
const PRICES: Record<string, { in: number; out: number; cachedIn?: number }> = {
  // 90% cache discount, which matters: the ~7k system prompt is resent every turn.
  "gpt-5.6-luna": { in: 1.0, out: 6.0, cachedIn: 0.1 },
  "gpt-4o": { in: 2.5, out: 10.0, cachedIn: 1.25 },
  "gpt-4o-mini": { in: 0.15, out: 0.6, cachedIn: 0.075 }
};

type Tally = { in: number; cachedIn: number; out: number; calls: number };

const tallies = new Map<string, Tally>();

/** Unknown models are recorded but priced at zero, and named in the report. */
const unpriced = new Set<string>();

export type OpenAiUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number };
};

/** Call once per OpenAI response, with whatever `usage` came back. */
export function recordUsage(model: string, usage: OpenAiUsage | undefined): void {
  if (!usage) return;
  const t = tallies.get(model) ?? { in: 0, cachedIn: 0, out: 0, calls: 0 };
  const cached = usage.prompt_tokens_details?.cached_tokens ?? 0;
  t.cachedIn += cached;
  t.in += Math.max(0, (usage.prompt_tokens ?? 0) - cached);
  t.out += usage.completion_tokens ?? 0;
  t.calls += 1;
  tallies.set(model, t);
  if (!PRICES[model]) unpriced.add(model);
}

function costOf(model: string, t: Tally): number {
  const p = PRICES[model];
  if (!p) return 0;
  const cachedRate = p.cachedIn ?? p.in;
  return (t.in * p.in + t.cachedIn * cachedRate + t.out * p.out) / 1_000_000;
}

export function totalCostUsd(): number {
  let sum = 0;
  for (const [model, t] of tallies) sum += costOf(model, t);
  return sum;
}

/** Human-readable breakdown for the end of a run. Empty when nothing was spent. */
/** The run's total in dollars, for the saved run file. null if nothing billed. */
export function totalUsd(): number | null {
  if (tallies.size === 0) return null;
  return [...tallies].reduce((sum, [model, t]) => sum + costOf(model, t), 0);
}

export function costReport(conversations: number): string {
  if (tallies.size === 0) return "";
  const lines: string[] = ["", "─".repeat(60), "Estimated cost (from OpenAI's own token counts):"];
  for (const [model, t] of [...tallies].sort((a, b) => costOf(b[0], b[1]) - costOf(a[0], a[1]))) {
    const tokens = t.in + t.cachedIn + t.out;
    lines.push(
      `  ${model.padEnd(16)} $${costOf(model, t).toFixed(3).padStart(7)}` +
      `   ${t.calls} calls, ${(tokens / 1000).toFixed(0)}k tokens` +
      (t.cachedIn ? ` (${Math.round((100 * t.cachedIn) / (t.in + t.cachedIn))}% cached)` : "")
    );
  }
  const total = totalCostUsd();
  lines.push(`  ${"TOTAL".padEnd(16)} $${total.toFixed(3).padStart(7)}`);
  if (conversations > 0) {
    lines.push(`  ${"per conversation".padEnd(16)} $${(total / conversations).toFixed(4).padStart(7)}`);
  }
  if (unpriced.size) {
    lines.push(`  NOT PRICED (counted as $0): ${[...unpriced].join(", ")} — add them to cost.ts`);
  }
  return lines.join("\n");
}

/**
 * What a run will cost, before it runs.
 *
 * Deliberately a single number with its basis stated rather than a range: the
 * point is to answer "is this a 40 cent run or a 40 dollar one" before
 * committing, and the measured per-conversation figure is stable enough for
 * that. Update it from the reported per-conversation cost when the prompt or
 * the models change.
 */
// Measured 2026-07-29 over two scenarios, one with a judge call and one
// without: $0.0324 and $0.0321. Dominated by the assistant resending the ~7k
// system prompt every turn — the 90% cache discount is what keeps it at three
// cents rather than twenty. Re-measure from the reported per-conversation
// figure whenever the prompt grows noticeably or a model changes.
export const MEASURED_USD_PER_CONVERSATION = 0.032;

export function estimate(conversations: number, perConversation = MEASURED_USD_PER_CONVERSATION): string {
  if (perConversation <= 0) {
    return `${conversations} conversation(s) — no measured per-conversation cost recorded yet; run once and read the reported figure.`;
  }
  return `${conversations} conversation(s) × ~$${perConversation.toFixed(4)} ≈ **$${(conversations * perConversation).toFixed(2)}**`;
}
