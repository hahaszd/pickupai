/**
 * Build a known-answer test set for the stage-2 reader in `email-consent-check`.
 *
 *   npx tsx scripts/plant-refusal-fixtures.ts
 *
 * WHY
 * ---
 * Stage 3 verifies a claimed refusal against the source text, so a FABRICATED
 * finding cannot survive. Nothing checks the other direction: a reader that
 * walks past a real refusal reports `false`, and `false` is indistinguishable
 * from a clean page. That miss is the one that costs money — you email someone
 * who said not to.
 *
 * The first run found zero refusals in 23 pages, so there is no natural
 * positive to calibrate against. This plants them: real refusal wording, in
 * three different page positions, plus an untouched page as a negative control.
 * A reader that answers "yes" to everything must score 3/4, not 4/4.
 *
 * It answers two questions at once:
 *   1. Does a refusal get missed when it is NOT on a policy page? — decides
 *      whether stage 2 can skip homepages and contact pages, cutting agents ~78%.
 *   2. Does a cheap model catch these? — the bigger lever, since ~95% of each
 *      agent's tokens are fixed overhead that no restructuring removes.
 *
 * Fixtures land in `data/email-evidence-plant/` (gitignored). Source pages are
 * read from a completed stage-1 run and never modified.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const SRC = process.argv[2] ?? "./data/email-evidence";
const OUT = process.argv[3] ?? "./data/email-evidence-plant";

/**
 * Wording drawn from how businesses actually phrase this, escalating in
 * subtlety. None of them uses the statute's own words — that is the point:
 * cl 4(2)(d) covers "a statement to similar effect".
 */
const FIXTURES = [
  {
    id: "plant-a-homepage",
    src: "001742ee-6ac3-405e-adef-ecace092a9c0/00-homepage.txt",
    position: "homepage, in the footer",
    expect: true,
    anchor: /Contact|Email|Phone/i,
    insert:
      "We do not accept unsolicited marketing emails or cold approaches of any kind. Any such message sent to the address on this page will be deleted unread.",
  },
  {
    id: "plant-b-contact",
    src: "009f7bb4-9542-483f-b6c6-197f39fcce7b/02-contact.txt",
    position: "contact page, next to the address",
    expect: true,
    anchor: /Email|Contact/i,
    insert:
      "Please note: the email address above is for customer enquiries only. We are not interested in offers of SEO, web design, advertising or lead generation services and ask that you do not contact us about them.",
  },
  {
    id: "plant-c-policy-buried",
    src: "005e5009-498b-4f65-b878-146e41ead576/01-policy.txt",
    position: "privacy policy, buried mid-document",
    expect: true,
    anchor: /information|data|collect/i,
    insert:
      "9.4 Use of published contact details. You must not use any email address published on this website to send commercial electronic messages that we have not asked for.",
  },
  {
    id: "control-untouched-policy",
    src: "009c59b4-9cb2-4c69-b69b-3b999c5aa55b/00-homepage.txt",
    position: "unmodified — negative control",
    expect: false,
    anchor: null,
    insert: null,
  },
];

/**
 * Second question, worth 3.3x on cost: can ONE agent read a whole prospect's
 * pages in a single bundle, or does it skim?
 *
 * The position test showed a reader finds a refusal anywhere WITHIN one page.
 * It says nothing about the fourth page of four. So the plant goes in the LAST
 * document of each bundle — the position a skimmer reaches last, or not at all —
 * plus a clean bundle so "yes to everything" does not pass.
 */
const BUNDLES = [
  {
    id: "bundle-a-plant-in-last",
    srcs: [
      "009f7bb4-9542-483f-b6c6-197f39fcce7b/00-homepage.txt",
      "009f7bb4-9542-483f-b6c6-197f39fcce7b/01-contact.txt",
      "009f7bb4-9542-483f-b6c6-197f39fcce7b/02-contact.txt",
    ],
    plantInto: 2,
    expect: true,
    insert:
      "A note to marketers: we do not want unsolicited commercial email at any address on this site, and we do not respond to it.",
  },
  {
    id: "bundle-b-plant-in-middle",
    srcs: [
      "005e5009-498b-4f65-b878-146e41ead576/00-homepage.txt",
      "005e5009-498b-4f65-b878-146e41ead576/01-policy.txt",
      "005e5009-498b-4f65-b878-146e41ead576/02-contact.txt",
      "005e5009-498b-4f65-b878-146e41ead576/03-contact.txt",
    ],
    plantInto: 1,
    expect: true,
    insert:
      "We ask that our published email addresses are not added to any marketing or mailing list without our prior written agreement.",
  },
  {
    id: "bundle-c-control-clean",
    srcs: [
      "001742ee-6ac3-405e-adef-ecace092a9c0/00-homepage.txt",
      "001742ee-6ac3-405e-adef-ecace092a9c0/01-contact.txt",
      "001742ee-6ac3-405e-adef-ecace092a9c0/02-contact.txt",
    ],
    plantInto: -1,
    expect: false,
    insert: null,
  },
];

async function buildBundles(answers: any[]) {
  for (const b of BUNDLES) {
    const docs: string[] = [];
    for (const [i, src] of b.srcs.entries()) {
      let t = await readFile(join(SRC, src), "utf8");
      if (b.insert && i === b.plantInto) {
        const lines = t.split("\n");
        const at = Math.min(lines.length - 1, Math.floor(lines.length * 0.6));
        lines.splice(at, 0, "", b.insert, "");
        t = lines.join("\n");
        if (!t.includes(b.insert)) throw new Error(`${b.id}: insertion into doc ${i} did not take`);
      }
      docs.push(`===== PAGE ${i + 1} OF ${b.srcs.length} =====\n${t}`);
    }
    const dir = join(OUT, b.id);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "page.txt"), docs.join("\n\n"), "utf8");
    answers.push({
      id: b.id,
      page: join(dir, "page.txt"),
      from: b.srcs,
      position: b.insert ? `bundle of ${b.srcs.length}, planted in page ${b.plantInto + 1}` : `bundle of ${b.srcs.length}, unmodified`,
      expect_refuses_marketing: b.expect,
      planted_sentence: b.insert,
    });
    console.log(`  ${b.id.padEnd(28)} expect=${String(b.expect).padEnd(5)} ${b.srcs.length} pages, plant in #${b.plantInto + 1 || "none"}`);
  }
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const answers: any[] = [];

  for (const f of FIXTURES) {
    const raw = await readFile(join(SRC, f.src), "utf8");
    let out = raw;

    if (f.insert) {
      const lines = raw.split("\n");
      // Drop it after the first line that looks like page body, not the header,
      // so it reads as part of the page rather than as metadata.
      let at = lines.findIndex((l, i) => i > 3 && f.anchor!.test(l) && l.trim().length > 20);
      if (at < 0) at = Math.min(lines.length - 1, Math.floor(lines.length / 2));
      lines.splice(at + 1, 0, "", f.insert, "");
      out = lines.join("\n");
      if (!out.includes(f.insert)) throw new Error(`${f.id}: insertion did not take`);
    }

    const dir = join(OUT, f.id);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "page.txt"), out, "utf8");
    answers.push({
      id: f.id,
      page: join(dir, "page.txt"),
      from: f.src,
      position: f.position,
      expect_refuses_marketing: f.expect,
      planted_sentence: f.insert,
    });
    console.log(`  ${f.id.padEnd(28)} expect=${String(f.expect).padEnd(5)} ${f.position}`);
  }

  await buildBundles(answers);

  await writeFile(join(OUT, "answers.json"), JSON.stringify(answers, null, 2), "utf8");
  console.log(`\n${answers.length} fixtures → ${OUT}`);
  console.log(`Answer key: ${join(OUT, "answers.json")} — do NOT give this to the readers.`);
}

void main();
