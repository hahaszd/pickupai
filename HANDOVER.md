# Handover — 2026-08-09

A baton, not a document to maintain. Written so the next session starts here
rather than from a transcript. **Delete it once absorbed.**

Replaces the 2026-07-28 handover, which described safety behaviour that has
since been deleted — see §2. If you are reading a copy of that file, discard it.

---

## Read these first, in this order

1. **`PRINCIPLES.md`** — the north star. It changed twice this week (§2), and
   the two clarifications are what make it followable.
2. **`docs/channel-evidence.md`** — before proposing anything about acquisition.
   It records a 560-SMS campaign that produced **zero** genuine human clicks,
   and why the 60 that look like clicks are carrier link scanners.
3. **`BACKLOG.md`** P0 section.

---

## 1. Where the product stands

- **1 real user ever** (Western Sealants, Melbourne, organic, 2026-07-26).
  **0 paying.** The one channel that was worked produced nothing; the one user
  came through a channel nobody worked.
- **467 tests** (461 passed, 6 skipped — the skipped six are billed judge
  probes, opt-in via `EVAL_JUDGE_PROBE=1`), 0 lint errors, `npm run check` green.
- No real phone call has ever been placed against the current prompt. **Audio,
  VAD, latency and Twilio have zero coverage** and everything in §2 changed the
  words the assistant says.

---

## 2. What changed this week, and why it matters

Two owner decisions, both now in `PRINCIPLES.md` §8. Do not undo them by
accident — several documents and 11 eval scenarios were rewritten to match.

**The receptionist no longer handles emergencies.** Seven hazard-specific
safety scripts and twelve per-trade safety tips were deleted. What survives is
one line — *"That sounds like one for triple zero — give them a ring first.
Before you go though, what's the best number for you?"* — for three
caller-stated facts (fire/smoke/burning, gas, someone badly hurt). Everything
else, including an electric shock that already happened, is **recorded, not
advised on**.

Two reasons, and the second is the one to remember: people with real
emergencies ring 000, not a plumber — and **giving safety advice is Principle 1
in a costume**. Deciding what is dangerous, and what someone should do about it,
is exactly the judgement this product hands to the tradie everywhere else.

**It never asks a caller to do anything to the property.** No climbing, no
photographing the roof, no going to look at the meter — and it declines
*without* explaining it as a danger, because explaining it that way is the
judgement all over again. **Questions are still the job**: "is there water on
the ground?" is a question; "go and look for me" is a request for labour.

**"Makes no judgements" was scoped to "makes no judgements OUT LOUD."** The
first wording was false about the product on the day it was written — the
assistant classifies constantly and must (`caller_intent`, sentiment, job size,
what to ask next). The line is between what is **filed** (recoverable; the
tradie overrules it by reading) and what is **spoken** (the caller has already
acted on it).

**When a caller asks outright what to do, there is now a sentence**, because a
ban with no replacement gets improvised and the improvisation reads as a system
failing — measured four times in this repo, most expensively on price.

---

## 3. The one thing only the owner can do

**Make a real phone call to the product.** This is the top of the list and has
been for days.

Everything in §2 is text-simulated only. The eval drives chat completions
against a different model, with no audio, no VAD, no barge-in, no latency and
no Twilio. A green eval says *"no P0 assertion failed all three times, over
text, on a different model, on assertions largely derived from the prompt being
tested"* — and that is all it says.

**Two things to listen for specifically**, both introduced this week:

1. Does the TTS say **"triple zero"** or "zero zero zero"? The prompt now
   instructs the former in words, but nothing has heard it.
2. Does the new "I'm the AI receptionist, so I'm not the one to tell you what
   to do" sentence land warmly, or does it sound like a refusal?

Also still open and cheap: **ring Western Sealants.** He is the only working
acquisition path in evidence and nobody has asked him how he found us. It has
been P1 for two weeks.

---

## 4. Email outreach — DECIDED, and the current work

**Owner decision 2026-08-09: email outreach is going ahead, and building it is
the priority.** The owner is separately running the real phone call (§3)
himself, so those two tracks run in parallel.

What is NOT yet decided is the **target**: amplifiers or tradies (see below).
The infrastructure is the same either way, so it is being built first and the
fork is being resolved by research rather than by argument.

Three findings from a first pass, all verified:

**(a) There are zero email addresses.** All 11 scrapers in `scripts/scrape-*`
write `email: ""`. The `prospects` table has the column; nothing has ever
populated it. The 10,614 scraped prospects are **phone-only**.

**(b) Bulk email scraping is a different legal question from SMS.**
`LISTS.md`'s inferred-consent analysis is about **phone numbers** on public
registers. The Spam Act 2003 separately prohibits **address harvesting and the
use of harvested-address lists** — a distinct offence from sending without
consent. "Scrape emails off 10,614 business websites" is close to that
definition. **This needs research against legislation.gov.au before any
scraping is built**, in the style of
`docs/research/duty-of-care-ai-answering-service-2026-08.md` (primary sources
only, states plainly where the law is unsettled).

**(c) The SMS failure was a message-and-offer problem, not a pipe problem.**
`docs/channel-evidence.md`, in its own words: *"The messages were delivered — 6
people opted out and 2 replied, so humans read them. They read them and did not
tap."* Switching pipe does not fix that, and email is the channel a tradie on a
roof is **least** likely to read.

### The open fork: amplifiers or tradies

The recommendation is to test email **on amplifiers, not on tradies**: accountants and bookkeepers who
serve tradies, industry associations, trade-focused agencies. Each holds
20–200 tradies. Their email addresses are published on their own websites as
their business contact, so 100 can be gathered **by hand** — which is also
FireCut's actual method, not a compromise on it. Email is their native channel;
it is a tradie's worst one.

The measurement must be defined **before** sending, because the last campaign
was read as engagement when it was scanner traffic:

| | |
|---|---|
| ❌ Open rate | **Do not use.** Pixels are pre-fetched by mail clients — the same trap as `link_clicked_at` |
| ✅ A human reply | The only unambiguous signal |
| ✅ `funnel_events` | JavaScript actually ran in a real browser |
| ✅ A call to the demo number | Strongest, because it is zero-friction |

Threshold to call the channel working: **100 sends → ≥3 human replies.**

**What resolves the fork:** `docs/research/spam-act-email-outreach-2026-08.md`,
commissioned 2026-08-09. If hand-collection is clean and scraping is not, the
tradie path needs 10,614 addresses gathered by hand and is effectively closed;
the amplifier path needs 100 and is open today. If both are clean, the fork is a
judgement call about channel fit rather than about law.

### What would have to be built

- `outreach_log` has no `email` channel; outreach is SMS-only end to end.
- `src/utils/email.ts` is nodemailer/SMTP and is **transactional only** (owner
  notifications). No marketing path, no unsubscribe link, no suppression.
- A new `LISTS.md` section establishing the consent basis for email, at the
  same standard as the phone sections.

### The product gap that decides whether any of this works

Outreach can say **"ring this number and hear it"** instead of "click this
link", which directly attacks the measured failure mode — people read the SMS
and did not tap. A phone number needs no tap.

`public/demo.html` already offers **+61 2 8000 0796** as "tap to call our AI
demo". **But that number is also the seed tenant's**, so unless a demo session
is live, a stranger ringing it hears *"My Tradie Business"* with `trade_type:
"tradie"` — not a plumber, not an electrician. **Verify what that number
actually answers with before it becomes the centrepiece of any outreach.** The
per-tenant demo number is behind `dashAuth`, i.e. requires signup first.

---

## 5. Development work outstanding

**Eval, and none of it needs the owner:**

- **The 7/9 marginal.** `handyman_gas_smell_while_asking_about_a_shelf` settled
  at n=9 with its two failures in **opposite** directions — once pressing the
  gas smell a second time after the caller brushed it off, once never saying the
  line at all. No obvious edit; a prompt change on 1-in-9 evidence would be
  guessing. Now readable, because `--out` saves transcripts.
- **Judge accuracy has never been measured.** Four verdicts overturned, every
  one on a `mustSay`, a `mustDiscourage` or a multi-turn transcript — and the
  only evidence is six single-sentence `mustNotSay` probes. `judgeSample()`
  makes this **zero API cost** on a run already paid for.
- **Five prompt branches have no paid coverage** because `evalTenant` is a
  frozen literal: withheld caller ID, returning-caller history,
  `custom_instructions`, vacation mode, demo mode.
- **The full gate has not been run** since the changes: 61 scenarios × 3 ≈
  **$4.40**, plus ~$0.72 if marginals escalate. Worth running **after** the real
  phone call, not before — a call may invalidate prompt work and waste it.

**Still living inside `main()` in `server.ts` and therefore untestable.** Six
extractions this week each uncovered a defect that had survived multiple
reviews, so treat the remainder as suspect rather than clean:

- The media-stream WebSocket handler — the largest, and possibly wants a
  different treatment than "extract a function", because it owns a real socket
  lifecycle. Decide after hearing a real call.
- `onEndCall`.

**Known and unfixed:**

- `getTenantLeadStats` and the dashboard's urgency filter still read
  `urgency_level`, deleted 2026-07-28. The chips can never match a new lead.
- `upsertLead`'s UPDATE branch is now tenant-scoped, but three other queries in
  `repo.ts` still have no isolation test.
- The admin token is accepted in the query string and logged in the clear by
  `pinoHttp` (no `redact` configured).

---

## 6. Owner actions, ranked

1. **Make a real phone call** (§3) — nothing substitutes for it.
2. **Ring Western Sealants** — the only working acquisition path in evidence,
   unexplored.
3. **Decide the email question** (§4): amplifiers first, or tradies as
   originally framed.
4. `SEED_PASSWORD` still falls back to nothing now — seeding refuses without it,
   which is correct, but **`scripts/test-lifecycle.ts` needs `ADMIN_TOKEN`,
   `SEED_EMAIL` and `SEED_PASSWORD` set** or `npm run test:e2e` exits early. CI
   does not run it, so this is silent.

---

## 7. How this session worked, if it is worth repeating

Five independent review agents, one of them explicitly briefed to **argue the
owner's own principle was wrong**. It succeeded on two points and the owner's
answers scoped both into something checkable. That was the highest-value hour
of the week.

Three rules earned the hard way and now in `CODING_STANDARDS.md`:

- **A scripted multi-part edit verifies every part before writing any of it.**
  An assert that throws on the third replacement discards the first two and
  never reaches `write_text` — the file keeps the old text while the script
  reports success. This produced a **commit message claiming four fixes where
  the diff had one**.
- **A mutation that does not apply is not evidence.** A whole mutation matrix
  was nearly filed on six "surviving" mutations that had never been applied.
- **A test must detect by a different mechanism than the code computes by.**
  Three tests here re-derived their expectation from a copy of the thing under
  test and each agreed with the bug it shared.
