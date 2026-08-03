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
  "I don't have those details on hand",
  // Added 2026-07-31 after the Emergency farewell was found handing the model
  // "Someone from X will be in touch as soon as possible" — a person AND a
  // timing, both banned sixty lines above it in the same file. It survived
  // every paid gate run because every promise-shaped assertion in the eval
  // library is about a DAY, DATE, CLOCK TIME or DURATION, and "as soon as
  // possible" is none of those. Two seconds of CI beats a $4.40 gate that
  // structurally cannot see it.
  "we'll have someone there",
  "will be in touch as soon as possible"
];

/**
 * Strip the BANNING clauses from a line, leaving the part the model is actually
 * told to say.
 *
 * This used to exempt the whole LINE whenever it contained a banning marker,
 * and that is exactly backwards for the one line that matters. The PAYMENT
 * QUESTIONS bullet carries a template the model speaks AND the words "is the
 * one phrasing to avoid" in the same line — so the entire bullet was exempt,
 * and conflict #4 in the header above, the one that produced a transcript where
 * a caller asked for a price five times and was never asked their name, was the
 * single line this test could not fail on. Proven by inserting the banned
 * phrase into that template: 7 passed, 0 failed.
 *
 * Exempt the clause, never the line.
 */
export function sayablePart(line: string): string {
  return line
    // - No "…", no "…", no "…"  — the shortest banning form, and the one the
    //   price section does NOT use, so it was missed until the promise bans
    //   were added. Case-insensitive and global because only the first item in
    //   the list is capitalised. Without this, the new entries above
    //   false-positive on the very line that bans them.
    .replace(/\bno\s+"[^"]*"/gi, "")
    // - Do NOT say "…", "…", or "…"  — the ban is usually a LIST, so take the
    //   whole comma/or-separated run, not just the first quoted span.
    .replace(
      /(?:Do NOT say|Never say)\s*[:,]?\s*"[^"]*"(?:\s*,?\s*(?:or|and)?\s*"[^"]*")*/gi,
      ""
    )
    // - … "…" is the one phrasing to avoid …
    .replace(/"[^"]*"\s*(?:is|are)\s+(?:the\s+)?(?:one\s+)?phrasing(?:s)? to avoid/gi, "")
    // - … avoid "…" / never "…"
    .replace(/(?:avoid|never)\s+"[^"]*"/gi, "");
}

describe("the prompt does not hand the model a phrase it also bans", () => {
  // Both caller-ID branches. The withheld branch is longer and carries two
  // extra spoken scripts, and until 2026-07-30 this scanned only the reachable
  // one — so the cheap CI gate could not fail on conditional prompt content,
  // which is where the newest scripts live.
  for (const trade of TRADES) {
    for (const [label, from] of [["reachable caller ID", "+61411222333"], ["withheld", null]] as const) {
      it(`${trade} — ${label}`, () => {
        const lines = buildSystemPrompt(tenant(trade), [], from).split("\n");
        for (const phrase of FORBIDDEN_PHRASES) {
          const offenders = lines.filter((l) => sayablePart(l).includes(phrase));
          expect(offenders, `${trade}/${label} still offers "${phrase}": ${offenders[0]?.trim()}`).toEqual([]);
        }
      });
    }
  }

  // The exemption itself, tested. Without this, narrowing it is unverifiable —
  // and the old whole-line version passed every test above while being blind to
  // the one line the whole file exists for.
  it("exempts the ban and not the template beside it", () => {
    const real =
      `- PAYMENT QUESTIONS: "Pricing and accounts are something the team handles with you directly." ` +
      `Then back to what they need — and note that "I don't have those details on hand" is the one phrasing to avoid.`;
    expect(sayablePart(real)).not.toContain("I don't have those details on hand");

    // Same line, with the banned phrase moved INTO the spoken template. This is
    // the regression the whole-line exemption could not see.
    const broken = real.replace(
      `"Pricing and accounts are something the team handles with you directly."`,
      `"I don't have those details on hand — the team handles it."`
    );
    expect(sayablePart(broken)).toContain("I don't have those details on hand");

    // A pure ban line stays fully exempt, including the list form the prompt
    // actually uses.
    expect(sayablePart(`- Do NOT say "I don't have that information".`))
      .not.toContain("I don't have that information");
    const list = `- Do NOT say "I don't have that information", "I don't have pricing on hand", or "I can't access their rates". Those sound like a lookup you failed.`;
    for (const p of ["I don't have that information", "I don't have pricing on hand", "I can't access their rates"]) {
      expect(sayablePart(list), `list ban should exempt "${p}"`).not.toContain(p);
    }
  });
});

describe("rules that reverse each other are visibly scoped", () => {
  // The emergency intake order is the reverse of the ordinary one. Both are
  // correct; what caused the name to become the most-dropped field across three
  // gate runs was that only one of them said when it applied.
  it("names when the reversed field order applies, and when it does not", () => {
    const prompt = buildSystemPrompt(tenant("electrician"), [], null);

    // The reversal survived the 2026-07-31 deletion of the hazard scripts: on a
    // call where someone is walking out of a building the number comes first
    // and the rest is dropped, which is the opposite of the ordinary order.
    // Both sides must still say when they apply — that is the whole rule, and
    // the one time only the emergency side was scoped, the caller's name became
    // the most-dropped field across three gate runs.
    expect(prompt).toMatch(/Ask for their number in the same breath, not after/i);
    // The rule that came back from a paid slice: the 000 line used to end
    // "call us back whenever you're safe and I'll take your details then",
    // which the eval caught as telling the caller to hang up and ring later —
    // exactly what the deleted gas script warned about, in writing, for a
    // reason that was never about safety.
    expect(prompt).toMatch(/Do NOT tell them to ring you back/i);
    expect(prompt).toContain("applies ONLY there; do not carry it into a routine call");
    expect(prompt).toContain("A caller who is leaving a building reverses it");
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

describe("a banned ACT is not re-mandated elsewhere", () => {
  // This file catches a banned PHRASE the prompt also hands the model as a
  // script. It could not see a banned ACT — and the first version of the
  // never-ask rule was an absolute ("never ask a caller to DO anything… the
  // only thing on this call you will ever ask anyone to do") that the same
  // prompt contradicts eight times over.
  //
  // An absolute the prompt breaks is not a rule, it is a coin toss about which
  // half the model keeps, and CODING_STANDARDS says the concrete quoted
  // instruction wins over the abstract qualifier beside it.
  const ORDINARY_ASKS = [
    /could you say that again/i,
    /ask the caller to spell it/i,
    /what's the best number to reach you on/i,
    /Sound right\?/,
    /anything else you'd like to pass on/i
  ];

  for (const trade of TRADES) {
    it(`${trade} — the never-ask rule leaves the ordinary asks alone`, () => {
      const prompt = buildSystemPrompt(tenant(trade), [], null);

      // The rule is scoped to the property, not to asking as such.
      expect(prompt).toContain("Never ask a caller to go and inspect anything, or to do anything to the property");
      expect(prompt).not.toContain("Never ask a caller to DO anything");
      expect(prompt).not.toMatch(/the only thing on this call you will ever ask anyone to do/i);

      // And every ordinary ask is still there to be broken by a future absolute.
      for (const ask of ORDINARY_ASKS) {
        expect(prompt, `${trade} lost an ordinary ask: ${ask}`).toMatch(ask);
      }
    });
  }
});
