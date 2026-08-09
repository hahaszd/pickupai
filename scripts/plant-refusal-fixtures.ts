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

  await writeFile(join(OUT, "answers.json"), JSON.stringify(answers, null, 2), "utf8");
  console.log(`\n${answers.length} fixtures → ${OUT}`);
  console.log(`Answer key: ${join(OUT, "answers.json")} — do NOT give this to the readers.`);
}

void main();
