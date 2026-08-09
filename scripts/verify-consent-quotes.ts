/**
 * Stage 3 of the email consent check: verify the readers did not make it up.
 *
 *   npx tsx scripts/verify-consent-quotes.ts data/email-evidence/verdicts.json
 *
 * Stage 2 asks one agent per page whether the page carries a statement
 * refusing unsolicited commercial email (Spam Act 2003 Schedule 2 cl 4(2)(d)),
 * and requires it to QUOTE the sentence it relied on. This script checks each
 * quote actually appears in the saved page text.
 *
 * WHY THIS EXISTS
 * ---------------
 * An agent's verdict is a claim, not evidence. `CODING_STANDARDS.md` already
 * carries the rule this implements — *a test must detect by a different
 * mechanism than the code computes by* — after three tests in this repo agreed
 * with the bug they shared. A model reading a page and a model checking that
 * reading share the failure. A literal substring match does not: it cannot
 * hallucinate, and a sentence that is not in the file is not in the file.
 *
 * So the rule enforced here is absolute:
 *
 *   FOUND + quote present in the source   → the finding stands
 *   FOUND + quote absent from the source  → DISCARDED, and reported loudly
 *   NOT FOUND                             → nothing to verify; taken as read
 *
 * A discarded finding is not "probably fine". It means that reader fabricated,
 * so every other verdict from that run is suspect and the run should be redone.
 *
 * EVERY RETURNED ADDRESS IS CHECKED THE SAME WAY, and that check was added
 * because a reader failed it. On 2026-08-10 a cheap-model reader handed back
 * `hello@sunnydayselectrical.com.au` and `info@sunnydayselectrical.com.au` with
 * confident reasoning — "domain matches SOURCE-URL; appears in privacy policy
 * contact section" — for a file that contains no email address at all. It had
 * been perfect on refusals in the same run. An address that is not in the page
 * is an address nobody published, and mailing it is both useless and, on a real
 * business's domain, worse than useless.
 *
 * Exit codes: 0 everything verified · 1 at least one fabrication · 2 bad input.
 */
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";

type Verdict = {
  prospect_id: string;
  business_name?: string;
  page_file: string;      // relative to the prospect's evidence dir
  page_url?: string;
  refuses_marketing: boolean;
  quote: string | null;
  addresses?: { email: string; belongs_to_business?: boolean }[];
  note?: string;
};

/** Collapse everything a copy-paste can plausibly change, and nothing else. */
const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‐-―]/g, "-")
    .replace(/\s+/g, " ")
    .trim();

async function main() {
  const path = process.argv[2];
  if (!path) {
    console.error("Usage: npx tsx scripts/verify-consent-quotes.ts <verdicts.json>");
    process.exit(2);
  }

  let verdicts: Verdict[];
  try {
    const raw = JSON.parse(await readFile(path, "utf8"));
    verdicts = Array.isArray(raw) ? raw : raw.verdicts;
    if (!Array.isArray(verdicts)) throw new Error("expected an array, or { verdicts: [...] }");
  } catch (e) {
    console.error(`Could not read verdicts from ${path}: ${(e as Error).message}`);
    process.exit(2);
  }

  const evidenceRoot = dirname(path);
  const fabricated: Verdict[] = [];
  const confirmed: Verdict[] = [];
  const unreadable: { v: Verdict; why: string }[] = [];
  let clean = 0;

  const ghostAddresses: { v: Verdict; email: string }[] = [];
  let addressesChecked = 0;

  for (const v of verdicts) {
    // Read the page once — both checks below need it.
    let text: string | null = null;
    const file = join(evidenceRoot, v.prospect_id, v.page_file);
    try {
      text = await readFile(file, "utf8");
    } catch (e) {
      unreadable.push({ v, why: (e as Error).message });
    }

    // An address the page does not contain was invented, whatever the reader
    // said about it. Checked for every verdict, refusal or not.
    if (text !== null) {
      for (const a of v.addresses ?? []) {
        if (!a?.email) continue;
        addressesChecked++;
        if (!text.toLowerCase().includes(a.email.toLowerCase())) ghostAddresses.push({ v, email: a.email });
      }
    }

    if (!v.refuses_marketing) {
      clean++;
      continue;
    }
    if (!v.quote || !v.quote.trim()) {
      fabricated.push({ ...v, note: "claimed a refusal with no quote at all" });
      continue;
    }
    if (text === null) continue; // already reported as unreadable
    if (norm(text).includes(norm(v.quote))) confirmed.push(v);
    else fabricated.push(v);
  }

  const line = "─".repeat(72);
  console.log(`\n${line}\nQuote verification — ${verdicts.length} verdict(s) from ${path}\n${line}`);
  console.log(`  no refusal claimed        ${clean}`);
  console.log(`  refusal, quote VERIFIED   ${confirmed.length}`);
  console.log(`  refusal, quote FABRICATED ${fabricated.length}`);
  console.log(`  addresses checked         ${addressesChecked}`);
  console.log(`  addresses NOT IN SOURCE   ${ghostAddresses.length}`);
  if (unreadable.length) console.log(`  page file unreadable      ${unreadable.length}`);

  if (confirmed.length) {
    console.log(`\nCONFIRMED REFUSALS — these addresses cannot use inferred consent (cl 4(2)(d)):`);
    for (const v of confirmed) {
      console.log(`\n  ${v.business_name ?? v.prospect_id}  [${v.page_url ?? v.page_file}]`);
      console.log(`    "${v.quote!.trim().slice(0, 300)}"`);
    }
  }

  for (const u of unreadable) {
    console.log(`\n  UNREADABLE  ${u.v.prospect_id}/${u.v.page_file} — ${u.why}`);
  }

  if (ghostAddresses.length) {
    console.log(`\n${line}\nINVENTED ADDRESSES — not present anywhere in the saved page\n${line}`);
    for (const g of ghostAddresses) {
      console.log(`  ${g.email}   (${g.v.business_name ?? g.v.prospect_id} · ${g.v.page_file})`);
    }
    console.log(
      `\nDrop every one of them. A reader can be perfect on refusals in the same\n` +
        `run that invents an address — the two questions fail independently, so\n` +
        `passing one is no evidence about the other.`
    );
  }

  if (fabricated.length || ghostAddresses.length) {
    if (!fabricated.length) process.exit(1);
    console.log(`\n${line}\nFABRICATED — the quoted sentence is not in the saved page\n${line}`);
    for (const v of fabricated) {
      console.log(`\n  ${v.business_name ?? v.prospect_id}  ${v.page_file}`);
      console.log(`    claimed: "${(v.quote ?? "(none)").trim().slice(0, 300)}"`);
      if (v.note) console.log(`    ${v.note}`);
    }
    console.log(
      `\nThese verdicts are DISCARDED. Do not treat them as findings, and do not\n` +
        `treat the rest of this run as sound either — a reader that fabricated once\n` +
        `was not reading. Re-run stage 2 for every page before using any of it.`
    );
    process.exit(1);
  }

  console.log(`\nEvery refusal claim is backed by a sentence that is really in the page.`);
  console.log(`Addresses on pages with NO refusal are still only past cl 4(2)(d) — relevance`);
  console.log(`and whether the address is really the business's own are separate questions.\n`);
  process.exit(0);
}

void main();
