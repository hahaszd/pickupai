---
name: email-consent-check
description: Establish, address by address, whether a tradie's published email may be emailed under the Spam Act's inferred-consent rule. Fetches each business's own site, reads every privacy/terms page one at a time, and verifies each finding against the source text. Use when building or extending an email outreach list, checking whether a prospect can be emailed, or populating the email section of LISTS.md.
---

# Email consent check

Produces one auditable row per email address: may we send to it, on what basis,
and what was read to decide. The output is consent-register evidence, not a
list of leads.

**Read [`docs/research/spam-act-email-outreach-2026-08.md`](../../../docs/research/spam-act-email-outreach-2026-08.md) before running this the first time.**
Everything below implements it. `LISTS.md` is where the conclusions go.

## What the law actually asks

Inferred consent under **Spam Act 2003 Schedule 2 cl 4(2)**. Four conditions and
a proviso, all of which must hold, **for that one address**:

| | Condition | Who can decide it |
|---|---|---|
| (a) | The address reaches a role-holder in the business | mechanical |
| (b) | It is **conspicuously published** | mechanical |
| (c) | It is reasonable to assume it was published **with their agreement** | needs judgement — their own site yes, a directory listing no |
| (d) | The publication is **not accompanied by** a statement that they do not want unsolicited commercial messages, **"or a statement to similar effect"** | needs judgement — no keyword list covers "similar effect" |
| — | The message is **relevant to their work function** | needs judgement, and it is about the message, not the address |

**Section 16(5) puts the burden on the sender**, address by address. That is why
this skill is per-address and why it keeps the pages it read. "We ran a script
over 10,000 sites" is not a discharge of that burden; "here is the page, here is
the date, here is what it said" is.

## The four stages, and why they are separate

**Stage 0 — filter the list. Do this before spending anything.**

The first real run put **7 of its 23 agents (30% of the spend) on the Electrical
Trades Union** — a trade union, not a tradie business, which could never be a
customer. The `prospects` table holds non-businesses: unions, industry bodies,
plumbing *suppliers* like Reece. `--exclude` in stage 1 drops them by name and
prints what it dropped; widen the pattern rather than paying to read a union's
terms and conditions.

Filtering costs nothing and is the single biggest saving available. Do it first.

**Stage 1 — fetch. Judges nothing.**

```
npx tsx scripts/collect-email-evidence.ts --limit 10 --state NSW [--trade plumber]
```

Read-only against the database, writes only to `data/email-evidence/` (gitignored).
Per prospect it saves the homepage, every same-domain privacy/terms/legal page
linked from it, the contact page, and a `manifest.json` listing candidate
addresses. **Start at `--limit 10`.** Ten is enough to see whether the pipeline
works and cheap to throw away.

**Stage 2 — read. One agent per page.**

For every page in every manifest, spawn **one** agent whose whole context is that
one page.

**Know what this buys and what it costs, because the first run measured both.**

The reason is *not* hallucination — stage 3 already catches a fabricated quote.
The reason is **skimming**. Stage 3 can only verify a claim that was made; it is
blind to a refusal the reader walked past. **A false negative is invisible to
every check in this pipeline, and it is the direction that costs money** — you
email someone who said not to. An agent handed seven pages reads the first two
properly. An agent handed one page and asked for a verbatim quote either finds
the sentence or does not.

The cost, measured 2026-08-10 on 10 NSW prospects:

| | |
|---|---|
| Agents | 23 (one per saved page) |
| Total | **761,308 subagent tokens** |
| Per business reached | ~109,000 |
| Per agent | ~33,000, of which **the page itself is ~1,700** |

**95% of each agent is fixed startup overhead**, not reading. That is what
per-page buys the isolation with, and it scales badly: 100 businesses is roughly
11M tokens.

**Two things have been settled by measurement — `scripts/plant-refusal-fixtures.ts`
builds the known-answer set: three real refusal sentences planted in three
different page positions, plus one untouched page so a reader that says yes to
everything scores 3/4.**

**1. Page position does not matter, so do not skip pages.** The tempting cut is
to give only policy/terms pages an agent. Tested: the refusal planted in a
homepage footer and the one on a contact page were caught exactly as readily as
the one buried mid-way through a long privacy policy. There is no basis for
skipping non-policy pages. **Read every page.**

**2. Question 1 runs on a cheap model.** Haiku scored **4/4** — all three plants
found, all three quotes verbatim and confirmed by stage 3, control correctly
negative. That is the ~10x saving, and note what it is *not*: it does not reduce
the agent count at all. The answer to "how do we spawn fewer agents" is that you
do not — you make each one cheap.

**3. But question 2 wants a stronger reader.** On the same page Haiku marked the
Cloudflare obfuscation placeholder `[email protected]` as a genuine business
address; the stronger model had excluded it. That is the harmless direction — one
junk address in a list a human vets anyway — but it is the difference between
the two questions. If they are ever split, question 1 goes to every page on the
cheap model, question 2 runs once per prospect over the candidate list.

**The limit of this evidence:** three planted sentences, all written by us. Real
wording in the wild may be subtler than anything we thought to plant. This shows
a cheap reader is not blind; it does not prove it is sufficient. Re-run the
fixtures — and add to them — whenever a real refusal is found in the field.

Give each agent exactly this job:

> Read the page text at `<absolute path>`. It was fetched from `<url>`.
>
> Answer two questions about **this page only**. Do not reason about the
> business, the trade, or anything not written on this page.
>
> 1. Does it contain a statement to the effect that the account-holder does not
>    want to receive unsolicited commercial electronic messages — or a statement
>    to similar effect? Wording varies: "no unsolicited approaches", "we do not
>    accept marketing enquiries", "this address is for customer enquiries only",
>    "marketing emails will be deleted", a no-spam clause in a privacy policy.
>    A general privacy policy about how they handle *customer* data is **not**
>    such a statement. Neither is an anti-spam promise about *their own*
>    sending.
> 2. For each email address on the page, is it the **business's own** contact
>    address, or someone else's — a web developer, a marketing agency, a font
>    licence comment, a `donotreply@`, a supplier?
>
> Return JSON only:
> `{"prospect_id": "...", "page_file": "...", "page_url": "...", "refuses_marketing": bool, "quote": "<verbatim sentence, or null>", "addresses": [{"email": "...", "belongs_to_business": bool, "why": "..."}]}`
>
> **The quote must be copied character-for-character from the file.** It is
> checked against the source afterwards by literal string match. If you cannot
> find such a statement, return `false` and `null` — that is a complete and
> correct answer, and guessing is worse than nothing.

Collect every agent's JSON into `data/email-evidence/verdicts.json` as an array.

**Stage 3 — verify. Deterministic.**

```
npx tsx scripts/verify-consent-quotes.ts data/email-evidence/verdicts.json
```

Literal substring match of every quote against the saved page. A refusal claim
whose quote is not in the file is **discarded and the whole run is suspect** —
a reader that fabricated once was not reading. Exit code 1 means redo stage 2.

This is the repo's own rule from `CODING_STANDARDS.md`: *a test must detect by a
different mechanism than the code computes by.* A model checking a model shares
the failure. A substring match cannot hallucinate.

## What the output means, and what it does not

An address that survives all three stages has passed **(b), (c) and (d)**. Two
things are still open and neither is this skill's to answer:

- **Relevance.** cl 4(2) only infers consent for messages relevant to that
  person's work function. That is a property of the message you send, decided
  when the copy is written, not here.
- **Everything under the Privacy Act 1988.** Collecting contact details engages
  APP 3, 5 and 7 independently of the Spam Act, and the small-business exemption
  should not be assumed. Unexamined — see §7 of the research file.

And the message itself still has to satisfy **s 17** (accurate sender identity,
contact details valid ≥30 days) and **s 18** (clear unsubscribe, functional
≥30 days per message, no login or fee). Those are not optional and s 17 has no
consent defence — the third-largest Spam Act penalty on record, $3.96m against
Latitude Finance, was an s 17 case with no consent count in it at all.

## Rules that came from getting this wrong

- **A keyword regex reporting zero refusals is worth nothing.** One did exactly
  that on 26 NSW sites on 2026-08-10, because it never followed the
  privacy-policy link. Recorded in `BACKLOG.md`. That is the reason stage 2
  exists.
- **Cost the run before starting it, not after.** The first run spent 761k
  tokens before anyone had said out loud what it would cost. The number was not
  unreasonable; not knowing it in advance was.
- **A zero is only worth what the method behind it is worth.** Two runs reported
  zero refusals. The regex zero meant nothing. The 23-agent zero means "nobody
  who read a page found one", which is worth something and still is not a base
  rate at n=23.
- **Do not let an agent fetch and judge in one step.** Then there is no saved
  page to check the quote against, and stage 3 becomes impossible.
- **A directory listing is not a publication by the business.** hipages,
  Oneflare, truelocal, Yellow Pages and ServiceSeeking listings fail cl 4(2)(c);
  two of those companies have themselves been penalised by ACMA for spamming.
  Own-domain sources only.
- **Never write results back to `prospects` from this skill.** The evidence
  directory is the record. A row in the database with `email` set and no
  provenance is exactly the thing that cannot discharge s 16(5).
