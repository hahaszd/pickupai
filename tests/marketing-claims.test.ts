import { describe, it, expect } from "vitest";
import { readFile, readdir } from "node:fs/promises";

/**
 * A product promise is a claim, and capabilities that were deliberately
 * deleted kept being sold afterwards — in JSON-LD on the trade pages (so
 * Google may surface it), in the $149/month feature list, and in the demo
 * audio a prospect actually hears.
 *
 * Urgency grading went on 2026-07-28. Safety advice went on 2026-07-31.
 *
 * This is a misleading-representation exposure under ACL s18/s29 to the tradie
 * who BUYS — which needs no novel reasoning about AI, unlike the duty-of-care
 * question to the caller, which is open and in docs/research/.
 *
 * ── Why this file was rewritten on 2026-08-17 ────────────────────────────────
 *
 * The previous version passed while `pricing.html` advertised "Emergency
 * flagging, with a follow-up nudge if you haven't rung back", three trade
 * pages promised "flags the lead as an emergency so it stands out in your
 * texts", and four served MP3s had the assistant saying "that sounds really
 * urgent" and telling a caller to shut off a stopcock.
 *
 * It missed all of it for one reason: it matched PHRASES. It banned
 * "detects emergenc" and "flags them as priority"; the pages said "flags THE
 * LEAD as AN EMERGENCY". It banned "turn the water off"; the demo said "turn
 * IT off". Its own commit message — "seventeen more lines my phrase-sweep
 * missed, and a shape-based guard" — had already recorded the lesson, and it
 * was applied to half the file.
 *
 * So: every rule below matches on SHAPE, and every rule is calibrated against
 * a line that really shipped. The calibration test at the bottom is not
 * decoration — a guard whose failure mode is silence has to be shown catching
 * something before it can be trusted to report nothing.
 */

/** Claims about what the PRODUCT does. Applied to every customer-facing surface. */
const CLAIM_SHAPES: Array<[string, RegExp]> = [
  ["claims the product grades, flags or detects urgency",
    /\b(flag|mark|grade|detect|prioriti[sz]|escalat|classif|triage|rank|treat|identif)\w*\b[^.<>]{0,60}\b(emergenc|urgen|priority|critical|hazard)/i],
  // The trailing \s matters: it keeps this on prose and off identifiers.
  // `urgencyBadge(level)` in the dashboard is honest code — it renders nothing
  // when a lead has no grade, which is every lead since 2026-07-28.
  ["names urgency grading as a feature",
    /\b(emergenc\w*|urgenc\w*|priority)\s[^.<>]{0,40}\b(flagging|detection|grading|triage|scoring|levels?)\b/i],
  ["promises a chase-up message",
    /\b(second|another|follow[- ]?up)\b[^.<>]{0,20}\b(text|sms|message|nudge|reminder)\b/i],
  // "sending the caller away from the outlet and telling them to call 000"
  // shipped on the electricians page and the first version of this rule missed
  // it, because it only looked for "the caller" and the sentence said "them".
  //
  // The trailing group is what separates an INSTRUCTION from a STATEMENT, and
  // the product genuinely does one of those: "it tells them the outage is the
  // distributor's" is a referral the prompt requires (session.ts:812), while
  // "it tells them to leave the building" is advice it is forbidden to give.
  ["claims the product gives advice or coaches the caller",
    /\bsafety (tip|advice|instruction|guidance)\b|\b(gives?|giving|offers?)\b[^.<>]{0,25}\badvice\b|\b(tell|telling|tells|talk|talking|walk|walking|send|sending|sends|coach\w*)\b[^.<>]{0,15}\b(?:the caller|them)\b\s*(?:not to|to|away|through|where|how)\b/i],
  ["claims it captures the caller's urgency",
    /\b(gets?|captures?|collects?|records?|asks? for)\b[^.<>]{0,30}\burgenc/i],
  // PRINCIPLES.md: no promises at all, and the callback time was the biggest.
  ["promises a person, a callback or a time",
    /\b(promis\w*|assur\w*|guarantee\w*)\b[^.<>]{0,40}\b(callback|call back|someone|get back|in touch|morning|business day)\b|\b(you'll|they'll|someone will|the team will)\b[^.<>]{0,25}\b(call|be in touch|get back|follow up)\b/i]
];

/**
 * A denial is not a claim. "the AI doesn't give safety advice" and "not a
 * safety tip from a machine that can't see it" are the honest copy this file
 * exists to protect, and a guard that deletes them to go green would be
 * enforcing the opposite of the principle. The window is deliberately narrow —
 * "Emergency flagging, with a follow-up nudge if you haven't rung back" also
 * contains a negation, twenty characters too late to mean anything.
 *
 * Bare "no" is deliberately absent. It exempted a demo line beginning
 * "Oh no, that sounds really urgent" — the interjection read as a denial.
 */
const NEGATION = /\b(not|never|don't|doesn't|do not|does not|isn't|is not|won't|will not|without|nothing|neither|nor)\b[^.<>]{0,12}$/i;

/** What the ASSISTANT says in the demo scripts. A prospect hears these. */
const DEMO_SHAPES: Array<[string, RegExp]> = [
  ["promises a person or an action",
    /will call you|will be onto|someone will|will give you a call|will be in touch|they'll call|get someone (?:out|back)/i],
  ["promises a time",
    /first[- ]thing|\btomorrow\b|\btonight\b|within the hour|\bshortly\b|real soon|as soon as/i],
  ["claims the call was flagged",
    /I'll flag|I've flagged|logged this as (?:a )?(?:urgent|priority|safety|security)/i],
  // The single most central prohibition in the product — and the one the old
  // guard had no rule for at all. src/realtime/session.ts: "Never say a
  // situation is or is not dangerous, urgent, or serious."
  ["characterises the caller's situation",
    /\b(?:that(?:'s| is| sounds)|this (?:is|sounds)|sounds)\b[^.!?]{0,40}\b(?:urgent|serious|dangerous|emergency|risky)\b|\b(?:safety|security) concern\b/i],
  ["asks the caller to act on the property",
    /\b(?:turn|switch|shut)\b[^.!?]{0,20}\b(?:off|on)\b|\b(?:find|locate|unplug|isolate|check)\b[^.!?]{0,40}\b(?:valve|stopcock|mains|switchboard|breaker|fuse|meter|tap)\b|please call 000|if it gets worse|deadbolt|bucket|towels|avoid touching/i]
];

async function surfaces(): Promise<Array<{ name: string; text: string }>> {
  const out: Array<{ name: string; text: string }> = [];
  for (const f of await readdir(new URL("../public/", import.meta.url))) {
    if (!f.endsWith(".html")) continue;
    out.push({ name: `public/${f}`, text: await readFile(new URL(`../public/${f}`, import.meta.url), "utf8") });
  }
  for (const f of ["src/dashboard/pages.ts", "src/chat/system-prompt.ts", "scripts/generate-demos.ts"]) {
    out.push({ name: f, text: await readFile(new URL(`../${f}`, import.meta.url), "utf8") });
  }
  return out;
}

/**
 * Comments explaining a removal are the point, not a violation — a check that
 * cannot tell the ban from the thing banned forces the explanation to be
 * deleted, which is how the reason for a rule gets lost. Caller dialogue is
 * skipped for the same reason: a caller saying "it's an emergency" is a caller
 * talking, and policing it would make the demos stop sounding like real calls.
 */
function isExempt(line: string): boolean {
  if (/^\s*(\/\/|\*|<!--|\/\*)/.test(line) || /speaker:\s*"caller"/.test(line)) return true;
  // A question is not a representation; its answer is, and every answer is
  // checked. "Will it promise a time someone will turn up?" is the customer's
  // own question and the honest answer below it is "No".
  const visible = line
    .replace(/<[^>]*>/g, "")
    .replace(/^\s*"[a-z@]+"\s*:\s*/i, "")
    .trim()
    .replace(/[",]+$/, "")
    .trim();
  return visible.endsWith("?");
}

function offend(line: string, shapes: Array<[string, RegExp]>): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  if (isExempt(line)) return out;
  for (const [why, pat] of shapes) {
    const m = pat.exec(line);
    if (!m) continue;
    if (NEGATION.test(line.slice(0, m.index))) continue;
    out.push([why, m[0].trim().slice(0, 80)]);
  }
  return out;
}

function scan(text: string, shapes: Array<[string, RegExp]>, name: string): string[] {
  const hits: string[] = [];
  text.split("\n").forEach((line, i) => {
    for (const [why, matched] of offend(line, shapes)) {
      hits.push(`${name}:${i + 1}  [${why}]  …${matched}…`);
    }
  });
  return hits;
}

describe("we do not sell capabilities the product does not have", () => {
  it("no customer-facing surface claims urgency grading, emergency flagging, a chase-up text, or safety advice", async () => {
    const offenders: string[] = [];
    for (const { name, text } of await surfaces()) offenders.push(...scan(text, CLAIM_SHAPES, name));
    expect(offenders, `selling something the product deliberately does not do:\n${offenders.join("\n")}`)
      .toEqual([]);
  });

  it("the demo scripts promise no person, no time, no priority — and never judge the caller's situation", async () => {
    const raw = await readFile(new URL("../scripts/generate-demos.ts", import.meta.url), "utf8");
    const aiLines = raw
      .split("\n")
      .map((l, i) => [l, i + 1] as const)
      .filter(([l]) => /speaker:\s*"ai"/.test(l));
    const offenders: string[] = [];
    for (const [line, n] of aiLines) {
      for (const [why, matched] of offend(line, DEMO_SHAPES)) {
        offenders.push(`generate-demos.ts:${n}  [${why}]  …${matched}…`);
      }
    }
    expect(offenders, `a demo line the assistant must not say:\n${offenders.join("\n")}`).toEqual([]);
  });

  // A guard that can only report "nothing found" is indistinguishable from a
  // guard that cannot find anything. These are verbatim lines that shipped and
  // that the previous version of this file passed over.
  it("catches the lines that actually shipped past the old guard", () => {
    const KNOWN_BAD: Array<[string, Array<[string, RegExp]>]> = [
      ["<li>Emergency flagging, with a follow-up nudge if you haven't rung back</li>", CLAIM_SHAPES],
      ["PickupAI flags the lead as an emergency when the caller describes a burst pipe", CLAIM_SHAPES],
      ["and sends a second text a couple of minutes later if you haven't rung back yet.", CLAIM_SHAPES],
      ["The AI answers, gets the address and urgency, and texts you the lead", CLAIM_SHAPES],
      ["Listen for it telling the caller where the mains tap is.", CLAIM_SHAPES],
      ["Listen for it flagging the job and giving the one safety tip that matters", CLAIM_SHAPES],
      ["Listen for it sending the caller away from the outlet and telling them to call 000.", CLAIM_SHAPES],
      ["<h3>Flags emergencies</h3>", CLAIM_SHAPES],
      ["It also gives one practical safety tip.", CLAIM_SHAPES],
      // Every one of these shipped in the homepage demo picker's DEMO_META.
      ['note: "AI flags the call as urgent, collects all details, and assures someone will get back to them."', CLAIM_SHAPES],
      ['note: "AI identifies the safety hazard, treats it as urgent, and gathers all contact details."', CLAIM_SHAPES],
      ['note: "AI collects details, gives safety advice, and promises a morning callback."', CLAIM_SHAPES],
      ['note: "AI gives immediate practical advice, marks it as urgent, and promises a fast callback."', CLAIM_SHAPES],
      ['note: "AI acknowledges the missed follow-up and marks it as a priority for you."', CLAIM_SHAPES],
      ['note: "AI takes the job scope and confirms you\'ll call back with pricing."', CLAIM_SHAPES],
      ['{ speaker: "ai", text: "Oh no, that sounds really urgent — you\'ve definitely called the right place." },', DEMO_SHAPES],
      ['{ speaker: "ai", text: "that\'s a real safety concern. Can I grab your name?" },', DEMO_SHAPES],
      ['{ speaker: "ai", text: "if you can find the water isolation valve under the tap and turn it off" },', DEMO_SHAPES]
    ];
    const missed = KNOWN_BAD
      .filter(([line, shapes]) => offend(line, shapes).length === 0)
      .map(([line]) => line);
    expect(missed, `the guard no longer catches a line that really shipped:\n${missed.join("\n")}`).toEqual([]);
  });

  // The other half of calibration, and the more dangerous one to get wrong: a
  // guard tuned only against bad lines gets "fixed" by deleting the honest
  // copy that denies the very capability. These must stay legal.
  it("does not flag the honest denials", () => {
    const MUST_PASS: Array<[string, Array<[string, RegExp]>]> = [
      ["so the AI doesn't give safety advice and doesn't decide what counts as urgent.", CLAIM_SHAPES],
      ["gets their words written down and sent to you — not a safety tip from a machine that can't see it.", CLAIM_SHAPES],
      ["A: It does not try to. The AI does not give safety advice.", CLAIM_SHAPES],
      ["function urgencyBadge(level: string | null) {", CLAIM_SHAPES],
      ['<div class="demo-label">Plumber - After-hours emergency</div>', CLAIM_SHAPES],
      ['{ speaker: "ai", text: "Thanks Mark. Whereabouts are you located?" },', DEMO_SHAPES]
    ];
    const wrongly = MUST_PASS
      .filter(([line, shapes]) => offend(line, shapes).length > 0)
      .map(([line, shapes]) => `${line}\n     -> ${JSON.stringify(offend(line, shapes))}`);
    expect(wrongly, `the guard is flagging honest copy:\n${wrongly.join("\n")}`).toEqual([]);
  });
});
