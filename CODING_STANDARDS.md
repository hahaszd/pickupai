# Coding standards

Rules a reviewer can check against a diff. Each one exists because breaking it
has a specific, non-obvious cost in this codebase — most of them fail silently
rather than loudly, which is why they are written down.

Anything a tool already enforces (`npm run check`) is deliberately absent.

## Modules

- **Relative imports must carry the `.js` extension**, even in `.ts` files —
  `import { env } from "./env.js"`. This is a native-ESM project; omitting it
  compiles fine and then fails at runtime.

## Persistence

See [ADR-0001](docs/adr/0001-whole-blob-persistence-and-deferred-migration.md)
and [ADR-0002](docs/adr/0002-critical-writes-flush-synchronously.md).

- **Do not add a new high-write table to the sql.js path.** Every write
  re-uploads the entire database. Append-only or high-frequency data goes
  directly to Postgres via `db.pg`, with a sql.js fallback for when `db.pg` is
  null in local dev. `/api/funnel/event` is the reference implementation.
- **A write whose loss a paying customer would notice must flush immediately** —
  `await db.flush()` where the call site is async, `flushCritical()` where it is
  not. Currently: saving a lead, signup, Stripe webhook.
- **Background jobs must be idempotent.** They are plain `setInterval` in
  `server.ts` and run on every instance and on every restart.

## Multi-tenancy

- **Every query returning tenant data takes a `tenantId` and filters on it.**
  `tests/repo.test.ts` has a cross-tenant leak test; new query shapes should
  extend it rather than route around it.

## Web layer

- **Escape interpolated user data in SSR templates.** Pages are template
  strings; use `esc()` in `src/admin/pages.ts` and `escape()` in
  `src/dashboard/pages.ts`. Any `${...}` carrying user or caller input without
  it is an XSS hole.
- **`/stripe/webhook` must stay mounted with `express.raw` before the global
  JSON parser.** Signature verification needs the unparsed body.
- **All `/twilio/*` routes go through `twilioVerify`.** An unguarded webhook is
  spoofable by anyone who learns the URL.

## Configuration

- **A new env var lands in three places in the same change**: the Zod schema in
  `src/env.ts`, `.env.example`, and the table in `DEPLOY.md`. `env.ts` parses at
  import time and throws, so a var that only exists in code takes production
  down on the next deploy.
- **Secrets are read from `process.env` and hard-fail when missing.** Never
  inline a credential, not even in `scripts/`. See `SECURITY.md` — this repo has
  already leaked production credentials into git history once.

## Outbound SMS

- **Read `LISTS.md` before touching anything that sends.** Australian Spam Act
  2003 / ACMA; penalties scale to the company.
- Marketing sends go through the suppression check; the opt-out line is not
  optional; quiet hours are not optional. `TEST_OVERRIDE_PHONE` is the single
  audited bypass and matches exactly one number.

## Naming

- **Follow `CONTEXT.md`.** In particular **Prospect** (a tradie we might sell
  to), **Tenant** (a tradie who pays) and **Lead** (a job enquiry from someone
  who rang a Tenant) are three different things, and "lead" is only ever the
  third.

## Evidence and measurement

- **Never present an unexamined column as a measurement.** `link_clicked_at`
  looks like engagement and is not — see `docs/channel-evidence.md`. Before
  quoting a number, know what writes it and what else could.
- **Measure human engagement on `funnel_events`**, which requires JavaScript to
  have run, not on server-side hit counters that any scanner trips.
- **Findings that change a decision go into the repo in the same change**, with
  their raw numbers and how they were obtained. `docs/channel-evidence.md` for
  market and channel evidence, `docs/adr/` for decisions.

## Editing the system prompt

`src/realtime/session.ts` builds a ~10k-token prompt that has grown by accretion
across many behaviour fixes. OpenAI's own guidance for prompts this size is that
**instruction conflict, not length, is what costs you** — and this prompt has hit
that four times, every one found by reading a transcript after a paid eval run
rather than by review.

- **Review before you spend. Widen before you conclude.** The order is: draft →
  an **independent agent reviews** it (one with no stake in the wording, asked
  to find fault) → a second agent polishes → review again → test the **smallest
  slice** that could show the effect → widen → full gate last. A 3-scenario
  slice at `--repeat 3` costs ~$0.30 against ~$3.30 for the gate, so ten slices
  are cheaper than one gate. Reviewers cost less than either and catch the class
  testing finds slowly: contradiction, unscoped limits, a ban with no
  replacement sentence.
- **Stop the run the moment a problem is obvious.** Do not let 102
  conversations finish to confirm what the third transcript already showed. Kill
  it, fix it, re-run the slice. Free checks — typecheck, unit tests,
  `tests/prompt-conflicts.test.ts` — always run immediately; this rule is about
  the paid ones.
- **A prompt edit is global, so the FINAL check is global.** Every rule reaches
  every call of every trade. Verifying only against the three scenarios you were
  thinking about is how a fix for one trade taught another to misfile a
  referral. `npm run eval:p0` before believing a prompt change — but as the last
  step, not the first.
- **Change one thing per measurement.** Two prompt edits in one gate run cannot
  be told apart afterwards, and one of them is usually a regression hiding
  behind the other's improvement.
- **Measure the neighbours, not just the target.** When changing a rule, include
  the scenarios that share its code path in the same batch. That is the only
  thing that has ever caught this class.
- **Trade-specific knowledge goes in `TRADE_CONFIGS`, never in a global
  section.** A general "some jobs are partly someone else's" paragraph taught a
  plumber to file a referral as a job. `extraScope` exists for boundaries that
  must reach one trade only.
- **When you ban something, supply the sentence to say instead.** A prohibition
  with no replacement gets improvised, and the improvisation is usually worse:
  "NEVER promise prices" with no alternative produced "I don't have pricing on
  hand", which reads as a failed lookup and invites the caller to ask again —
  five times, in the transcript that found it.
- **A concrete quoted template beats an abstract rule stated nearby.** The model
  follows whatever is closest to the words it is about to say. If a rule and a
  template disagree, the template wins — so edit the template, do not add
  another rule.
- **An item with a quoted line gets said. An item with only a description gets
  skipped.** Four independent measurements now: the price boundary produced an
  evasive improvised sentence until it was given one; the gas template kept its
  "ring us back" line until the number request was written into it; the
  pre-close check was a rule and stayed unfired; and of three things to capture
  on an agency call, the two with quoted lines were asked and the one described
  as "ask what it is" was skipped a third of the time — **6/9 → 9/9 from adding
  eleven words in quotation marks**. If an instruction matters, write the
  sentence.
- **Scope a limit explicitly: per what, for how long, when it resets.** "Ask
  twice then stop" did not say per detail or per call, and was read as "stop
  asking" — the assistant abandoned an entire intake after two deflections on
  one question.
- **Two rules that reverse each other must both say when they apply.** The
  emergency field order is the reverse of the ordinary one; only the emergency
  side was scoped, and the caller's name became the most-dropped field across
  three gate runs.
- **`tests/prompt-conflicts.test.ts` catches the cheap half of this in CI** —
  a banned phrase that also appears as something the prompt tells the model to
  say, and reversed rules that are not both scoped. Add to it when you find a
  new conflict shape; two seconds in CI beats a $3 gate run and a transcript.

## Tests

- **A test must be able to fail.** Assert on the mechanism under test, not on a
  side effect that happens to correlate. This repo has shipped a test that
  filtered on a column the query no longer read, so it passed no matter what the
  code did.
- **When behaviour is deliberately removed, update the test to assert its
  absence** rather than deleting the test. Three tests here spent months
  asserting a feature that had been intentionally deleted.
- **Unit tests do not touch the network.** `tests/setup-env.ts` deliberately
  leaves optional credentials unset so the offline paths are exercised.
