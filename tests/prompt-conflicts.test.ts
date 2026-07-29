import { describe, it, expect } from "vitest";
import { buildSystemPrompt } from "../src/realtime/session.js";
import type { TenantRow } from "../src/db/repo.js";

/**
 * Instruction CONFLICT, not instruction length, is what OpenAI warns about for
 * large system prompts: "Instruction conflicts are more costly […] Remove
 * overlapping always, never, only, and must rules."
 * See docs/research/realtime-instruction-length-latency-2026-07.md.
 *
 * This prompt has grown by accretion across a fortnight of behaviour fixes and
 * has hit that failure mode four times, every one found only by reading a
 * transcript after a gate run:
 *
 *   1. A downed power line was "someone else's asset" in one section and "a
 *      real new_job" in another.
 *   2. The gas template said "give us a call back" while a rule ten lines below
 *      said to take the number then and there.
 *   3. "Ask twice then stop" did not say per detail or per call, and was read
 *      as "stop asking".
 *   4. A PAYMENT QUESTIONS template handed the model the exact sentence the
 *      price section bans, eighty lines apart — and that sentence is what the
 *      model actually said in the transcript where a caller asked for a price
 *      five times and never got asked their name.
 *
 * These tests exist so the fifth is caught by CI in two seconds instead of by a
 * $3 gate run and a transcript read.
 */

function tenant(trade: string, over: Partial<TenantRow> = {}): TenantRow {
  return {
    tenant_id: "t", name: "Test Trade Co", business_name: "Test Trade Co",
    trade_type: trade, ai_name: "Olivia", service_area: null,
    custom_instructions: null, timezone: "Australia/Sydney",
    ...over
  } as TenantRow;
}

const TRADES = ["plumber", "electrician", "roofer", "handyman"];

/**
 * Phrases the prompt explicitly forbids. If any of these ever appears as
 * something the prompt TELLS the model to say, the model has been handed a
 * script and a rule that contradict, and the script wins — every time so far.
 *
 * The exemption is deliberately narrow: only the lines whose job is to name the
 * phrase in order to ban it.
 */
const FORBIDDEN_PHRASES = [
  "I don't have that information",
  "I don't have pricing on hand",
  "I can't access their rates",
  "I don't have those details on hand"
];

const BANNING_LINE = /Do NOT say|one phrasing to avoid|Never say/;

describe("the prompt does not hand the model a phrase it also bans", () => {
  for (const trade of TRADES) {
    it(`${trade}`, () => {
      const lines = buildSystemPrompt(tenant(trade), [], "+61411222333").split("\n");
      for (const phrase of FORBIDDEN_PHRASES) {
        const offenders = lines.filter((l) => l.includes(phrase) && !BANNING_LINE.test(l));
        expect(offenders, `${trade} still offers "${phrase}": ${offenders[0]?.trim()}`).toEqual([]);
      }
    });
  }
});

describe("rules that reverse each other are visibly scoped", () => {
  // The emergency intake order is the reverse of the ordinary one. Both are
  // correct; what caused the name to become the most-dropped field across three
  // gate runs was that only one of them said when it applied.
  it("names when the emergency field order applies, and when it does not", () => {
    const prompt = buildSystemPrompt(tenant("electrician"), [], null);
    expect(prompt).toContain("On an emergency, ask for the phone number FIRST");
    expect(prompt).toContain("On an ordinary call");
    expect(prompt).toMatch(/applies ONLY there|do not carry it into a routine call/);
  });

  // "ALL paths must end with end_call()" sits two sections after two rules
  // about not closing early. It is about HOW a call ends, not when.
  it("does not let the end_call requirement read as licence to close early", () => {
    const prompt = buildSystemPrompt(tenant("plumber"), [], null);
    expect(prompt).toContain("ALL paths must end with end_call()");
    expect(prompt).toMatch(/it never licenses closing early/);
    expect(prompt).toContain("Never end a call while the caller is still talking");
  });
});

describe("the rule surface stays small enough to reason about", () => {
  // Not a style preference. Every conflict above was two imperatives that never
  // met, and the chance of that grows with the count. This is a tripwire, not a
  // target — if it fires, read the new rules against the old ones before
  // raising it.
  it("does not grow imperative rules without someone noticing", () => {
    const prompt = buildSystemPrompt(tenant("handyman"), [], "+61411222333");
    const imperatives = (prompt.match(/\b(ALWAYS|NEVER|MUST|always|never|must|Do NOT|do not|don't)\b/g) ?? []).length;
    // 74 at the time of writing (handyman, the longest prompt).
    expect(imperatives, `imperative count is ${imperatives} — read the new rules against the old before raising this`).toBeLessThanOrEqual(85);
  });
});
