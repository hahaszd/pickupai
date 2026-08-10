# PickupAI — 24/7 AI receptionist for Australian tradies

Node 20 + TypeScript + Express. Answers inbound Twilio calls with an OpenAI
Realtime voice agent, extracts a structured lead, SMSes the business owner, and
serves an owner dashboard + admin panel. Deployed on Railway from `Dockerfile`.

## Read this first

**[`PRINCIPLES.md`](PRINCIPLES.md) is the north star** — what this product is and
what it refuses to be. It outranks anything in `BACKLOG.md`, which is a task
list. If a proposed feature and `PRINCIPLES.md` disagree, the document wins or
the document gets changed on purpose.

The one-line version: **the receptionist records, it does not judge.** It answers
the phone, finds out what the caller needs, writes it down faithfully and passes
it on — and that is the whole job, not a step towards something more impressive.
The tradie decides. Urgency grading, callback-time promises, price answers and
**all safety advice** were built and then deleted for this reason; the evidence
is in the file.

Two clarifications from 2026-08-03, because the absolute version was unusable:

- **"Does not judge" means does not judge OUT LOUD.** The assistant classifies
  constantly — `caller_intent`, sentiment, job size, what to ask next — and must,
  or it cannot run a call. Those are filed next to the caller's own words and the
  tradie overrules them by reading. What it never does is tell the CALLER what it
  thinks their situation is or what they should do about it.
- **It gives no safety advice and asks nobody to do anything to the property.**
  People with real emergencies ring 000, not a plumber. One line survives, for
  three caller-stated facts. Everything else — a shock that already happened, a
  hot switchboard, a sounding alarm — is written down, not advised on.

Anything customer-facing that claims otherwise is a false claim, not just stale
copy: `tests/marketing-claims.test.ts` fails CI on a banned-phrase list across
`public/*.html`, the dashboard, the support bot and the demo scripts.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Dev server on :3000 (`tsx watch`) |
| `npm run build` | `tsc` → `dist/` (src only) |
| `npm start` | Run compiled server |
| `npm run typecheck` | Type-checks `src/` **and** `tests/`, `scripts/*.ts` — `build` does not |
| `npm run lint` | ESLint 9 flat config |
| `npm test` | Vitest unit tests, no network |
| `npm run test:e2e` | Lifecycle suite — **needs a running server + real Twilio/admin creds** |
| `npm run check` | typecheck + lint + test. Run this before declaring work done. |

`npm run check` must stay green — CI (`.github/workflows/ci.yml`) runs exactly
it, plus `npm run build` and a `docker build` of the deploy image, on every push
and PR to `main`. Lint reports a few hundred warnings and 0 errors; the warnings
are a known `any` backlog, but **the error count must stay at 0**.

`npm audit` is advisory-only in CI (`continue-on-error`) and gated at
`--audit-level=moderate`. One low esbuild advisory is known and accepted:
Windows-only dev server, pinned by vitest's dependency range.

## Architecture

Everything is wired in `src/server.ts` (~4.9k lines — one Express app, all
routes). Route groups, in file order:

- `/twilio/*` — voice + SMS webhooks, all behind `twilioVerify` signature check
- `/mobilemsg/*` — Mobile Message SMS webhooks (the cheap AU SMS provider)
- `/admin/*`, `/api/admin/*` — admin panel, `adminGuard` / `adminHtmlAuth`
- `/dashboard/*` — tenant owner UI, `dashAuth` (cookie session)
- `/stripe/webhook` — **must** stay mounted with `express.raw` before the
  global JSON parser, or signature verification breaks
- `/`, `/demo`, `/r/:prospectId`, `/api/funnel/event` — marketing funnel
- `/u/:token` — public one-click email unsubscribe (GET human / POST RFC 8058);
  stamps the cross-channel suppression record

### Voice call flow

`POST /twilio/voice/incoming` → TwiML `<Stream>` to `wss://…/media-stream`
carrying a one-time stream token → `wss` handler in `server.ts` opens an
OpenAI Realtime session (`src/realtime/session.ts`) → model calls `save_lead()`
/ `end_call()` tools → lead persisted → owner SMS via `src/twilio/sms.ts`.

- Model defaults to `gpt-realtime-2.1`; roll back with `OPENAI_REALTIME_MODEL=gpt-realtime-2`
  or `gpt-realtime-1.5` (no redeploy needed). Reasoning effort via
  `OPENAI_REALTIME_REASONING_EFFORT`, default `low`.
- `MAX_CALL_DURATION_MS` (default 5 min) force-ends calls the model never closes.
- Tool-call guards live in `src/realtime/tool-call-guards.ts` and are well covered by tests.

### The database — read this before touching persistence

`src/db/db.ts` runs **sql.js (SQLite) fully in memory**, and persists by
exporting the entire database as one blob:

- No `DATABASE_URL` → blob written to `SQLITE_PATH` on disk (local dev).
- With `DATABASE_URL` → blob written to a single `sqlite_blob` row in Postgres.

Writes schedule a debounced flush (300 ms). **Every flush overwrites the whole
blob.** With more than one Railway instance running, concurrent writers silently
clobber each other's rows.

So: anything append-only and high-concurrency (funnel events, outreach logs)
must be written **directly to Postgres** via `db.pg`, with a `sql.js` fallback
for when `db.pg` is null in local dev. `/api/funnel/event` is the reference
implementation. Do not add a new high-write table to the sql.js path.

`src/db/repo.ts` holds every query; `src/db/schema.ts` holds DDL + migrations.
Tables: `tenants`, `calls`, `leads`, `notifications`, `analytics_events`,
`system_config`, `tenant_users`, `demo_sessions`, `prospects`, `outreach_log`,
`chat_logs`, `tenant_sms_log`.

### Multi-tenancy

`tenants.twilio_number` maps an inbound number to a tenant. Every query that
returns tenant data takes a `tenantId` and filters on it — `repo.test.ts` has a
cross-tenant leak test; keep that shape when adding queries.
`TWILIO_DEFAULT_VOICE_NUMBER` is only for seeding the first tenant and for
placing simulated demo calls.

### Background jobs

Plain `setInterval` in `server.ts`, no scheduler: onboarding nudge SMS (30 min),
trial-expiry sweep, number-release sweep. They run on **every** instance —
anything new here needs to be idempotent.

### Config

All env goes through the Zod schema in `src/env.ts`, parsed at import time. It
throws on a missing required var, which means **any module that transitively
imports `env.ts` cannot be imported without a full env**. Tests get theirs from
`tests/setup-env.ts` (wired via `vitest.config.ts`). Add new vars to `env.ts`,
`.env.example`, and the `DEPLOY.md` table together.

## Conventions

**`CODING_STANDARDS.md` holds the checkable rules** — ESM `.js` extensions,
persistence, tenant filtering, SSR escaping, env vars, SMS compliance, naming,
tests. Read it before writing code; it is also what `/code-review` reviews
against. Rules live there and are not repeated here, so they cannot drift.

Beyond those:

- Dashboard and admin pages are server-rendered template strings in
  `src/dashboard/pages.ts` and `src/admin/pages.ts`. No frontend framework, no
  build step for UI.
- `scripts/` is operator tooling (lead scraping, SMS batches, diagnostics), run
  ad hoc with `node --env-file=.env` or `tsx`. Held to a looser lint bar. It is
  not part of the deployed image.
- Comments explain *why*, not *what* — match the existing density.

## Hard constraints

- **Never commit secrets.** `SECURITY.md` documents a historical leak of
  production Twilio + Neon credentials into git history.
- **Marketing SMS *and email* are legally constrained** — Australian Spam Act
  2003 / ACMA, penalties scale to the company ($36,400 per consent breach at
  2026 rates). Read `LISTS.md` before touching anything that sends or any
  prospect list; the statutory analysis is
  `docs/research/spam-act-email-outreach-2026-08.md`.
- **`TWILIO_VALIDATE_SIGNATURE=true` in production.** Off by default for local dev.
- **Keep Railway at 1 replica**, and keep `RAILWAY_DEPLOYMENT_OVERLAP_SECONDS=0`
  / `RAILWAY_DEPLOYMENT_DRAINING_SECONDS=15` set. See ADR-0001 — without them
  the shutdown handler never runs and deploys silently lose writes.
- Don't push, deploy, or run outbound-messaging scripts (SMS **or** email)
  without being asked.

## Agent skills

Configured in `docs/agents/issue-tracker.md`. In routine use here:

- **`/code-review`** — reviews a diff against `CODING_STANDARDS.md`. The single
  biggest gap on a solo repo is that nobody else reads the code.
- **`diagnosing-bugs`** — for the timing-dependent Twilio ↔ WebSocket ↔ OpenAI
  failures that cannot be reasoned out by reading.
- **`research`** — for ACMA, Twilio AU regulatory and OpenAI API facts, where
  guessing is expensive. Output goes to `docs/research/`.
- **`email-consent-check`** (`.claude/skills/`, this repo's first project
  skill) — establishes, address by address, whether a published email may be
  emailed under the Spam Act's inferred-consent rule. Use it for any outreach
  list work; never write results back to `prospects` from it.

The issue-tracker-centric skills (`to-tickets`, `triage`, `to-spec`,
`wayfinder`) are deliberately not set up — see `docs/agents/issue-tracker.md`.

## Before building something the owner specified

Three lines in the reply, every time, **before** the work starts:

1. **What it costs** — tokens, time, money. A number, not "somewhat expensive".
2. **The design choice you would make differently, and why** — or say plainly
   that you would not change it.
3. **What would make this not worth doing at all.**

Either those three lines are there or they are not; that is the check. A
disposition to "think critically" does not fire on its own, and it fails in a
specific place: a well-formed proposal suppresses questions when it should
invite more of them, because its design choices are already made and therefore
already invisible. Measured 2026-08-10 — 23 subagents spawned on a suggestion
with the cost named only afterwards (761k tokens, 30% of it spent on a row that
could never be a customer).

**Spec'd, simple delegated work goes to a cheap model.** Say which model and
why. The exception is not optional: a cheap model is safe when its failure is
**visible**. Where the failure is silent — a check that can miss something and
report nothing, like the stage-2 reader in `email-consent-check` — calibrate it
against known answers before trusting it.

## Docs

`CONTEXT.md` is the glossary — read it before naming anything. In particular,
**Prospect** (a tradie we might sell to), **Tenant** (a tradie who pays) and
**Lead** (a job enquiry from someone who rang a Tenant) are three different
things, and "lead" is only ever the third.

**`docs/channel-evidence.md` holds what has actually been tried to get
customers, with the raw numbers.** Read it before proposing anything about
acquisition, and before repeating an experiment. It records, among other
things, that the 560-SMS campaign produced zero genuine human clicks — the 60
`link_clicked_at` stamps are carrier link scanners — and that the only signup
in the product's history arrived organically (and never activated: no number
provisioned, no calls — see `BACKLOG.md`, "the SMS campaign was NOT sent to
the wrong people").

**Read `HANDOVER.md` first if it exists** — it is a baton from the previous
session, not a maintained document, and can be deleted once absorbed.

**`PRINCIPLES.md` is the north star and outranks the backlog.** A conclusion
that would still matter after every backlog item is done does not belong in the
backlog — it belongs there.

**`BACKLOG.md` at the repo root is the single list of outstanding work.** Add
an item with a priority the moment it is discovered — a bug found while doing
something else, a feature agreed in conversation, a deliberate deferral, an
open question. Read it after finishing a task and recommend what is next,
ranked, rather than asking what was outstanding.

**When an investigation turns up something that changes a decision, write it
into that file in the same turn.** A finding that lives only in a conversation
is a finding that gets re-derived from the database months later, or
misremembered. Record the numbers and the method, not just the verdict, and
record disproved claims too.

`docs/adr/` holds architecture decisions:

- [0001](docs/adr/0001-whole-blob-persistence-and-deferred-migration.md) — why
  persistence is a whole-database blob, why the service must stay at one
  replica, why deploys take downtime, and the measured thresholds that trigger
  the Postgres migration.
- [0002](docs/adr/0002-critical-writes-flush-synchronously.md) — why saving a
  Lead deliberately blocks on a flush.

`docs/product-workflow.md` (EN) and `docs/产品工作流程说明.md` (CN) are the
architecture references. `DEPLOY.md` is the Railway runbook. `LISTS.md` is the
marketing consent register (SMS **and** email — per-source consent basis, the
send-day runbook, and the phone-call rules for follow-ups).
`docs/launch-runbook-OPERATOR.md` is the launch checklist.
