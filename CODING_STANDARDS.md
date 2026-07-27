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
