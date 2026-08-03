import { describe, it, expect } from "vitest";
import { readFile, readdir } from "node:fs/promises";

/**
 * A product promise is a claim, and the two capabilities below were sold for
 * days after they were deliberately removed — in JSON-LD on the front page (so
 * Google may surface it), in the $149/month feature list, and by the support
 * bot that answers prospects' questions.
 *
 * Urgency grading went on 2026-07-28. Safety advice went on 2026-07-31. Neither
 * deletion touched the marketing, because nothing connected them.
 *
 * This is a misleading-representation exposure under ACL s18/s29 to the tradie
 * who BUYS — which needs no novel reasoning about AI, unlike the duty-of-care
 * question to the caller, which is open and in docs/research/.
 */
const FORBIDDEN = [
  /detects? emergenc/i,
  /emergency detection/i,
  /emergency handling/i,
  /clear safety advice/i,
  /detects urgency/i,
  /flags? (?:them|it) as (?:high )?priorit/i,
  /priority flagging/i,
  /urgency level/i
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

describe("we do not sell capabilities the product does not have", () => {
  it("claims no emergency detection, urgency grading, or safety advice anywhere customer-facing", async () => {
    const offenders: string[] = [];
    for (const { name, text } of await surfaces()) {
      text.split("\n").forEach((line, i) => {
        // Comments explaining the removal are the point, not a violation.
        if (/^\s*(\/\/|\*|<!--)/.test(line)) return;
        for (const pat of FORBIDDEN) {
          if (pat.test(line)) offenders.push(`${name}:${i + 1}  ${line.trim().slice(0, 110)}`);
        }
      });
    }
    expect(offenders, `selling something the product deliberately does not do:\n${offenders.join("\n")}`)
      .toEqual([]);
  });

  // The demo scripts are the strongest claim of all — a prospect hears them.
  it("the demo scripts promise no person, no time, and no priority", async () => {
    const raw = await readFile(new URL("../scripts/generate-demos.ts", import.meta.url), "utf8");
    // Only the spoken lines. The file's header QUOTES each banned phrase in
    // order to explain why it was removed, and a check that cannot tell the ban
    // from the thing banned would force the explanation to be deleted — which
    // is how the reason for a rule gets lost.
    // Only what the ASSISTANT says. A caller line — "I noticed tonight that my
    // front door lock isn't working" — is the caller talking, and policing it
    // would force the demos to stop sounding like real calls.
    const text = raw
      .split("\n")
      .filter((l) => /speaker:\s*"ai"/.test(l))
      .join("\n");
    // By SHAPE, not by phrase. A phrase list caught 16 lines and missed 17 more
    // that said the same things differently — "the team will call you first
    // thing tomorrow", "I've flagged this as a security concern", "is there a
    // deadbolt or chain you could use on the door". The generation had already
    // started on those before a second sweep caught them.
    const SHAPES: Array<[string, RegExp]> = [
      ["promises a person or an action",
        /will call you|will be onto|someone will|will give you a call|will be in touch|they'll call|get someone (?:out|back)/i],
      ["promises a time",
        /first[- ]thing|\btomorrow\b|\btonight\b|within the hour|\bshortly\b|real soon|as soon as/i],
      ["claims the call was flagged",
        /I'll flag|I've flagged|logged this as (?:a )?(?:urgent|priority|safety|security)/i],
      ["gives advice or asks the caller to act",
        /please call 000|if it gets worse|deadbolt|bucket|towels|safety tip|avoid touching|turn the water off/i]
    ];
    for (const [why, pat] of SHAPES) {
      const bad = text.split("\n").filter((l) => pat.test(l)).map((l) => l.trim().slice(0, 110));
      expect(bad, `a demo line ${why}:\n${bad.join("\n")}`).toEqual([]);
    }
  });
});
