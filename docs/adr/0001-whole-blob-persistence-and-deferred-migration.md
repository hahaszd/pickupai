---
status: accepted
date: 2026-07-27
---

# Whole-blob persistence, single instance, and deferring the Postgres migration

The database is SQLite (sql.js) held entirely in memory and persisted by
exporting the **whole** database as one blob into a single `sqlite_blob` row in
Neon Postgres. Because every flush overwrites that row in full, any two
instances that are alive at the same time will clobber each other: whichever
flushes last wins, and the other one's writes are lost silently. We are keeping
this architecture for now and running exactly **one** instance, because at
current scale (~2–3k prospects, a small number of paying tenants, a ~1–2 MB
blob) a real per-table Postgres migration would buy an ability we do not yet
need, at a cost of several days.

> **Measured 2026-08-14: the blob is 3.75 MB** (3,751,936 bytes), not the
> 1–2 MB estimated when this was written. Still under the 10 MB migration
> threshold below.

## Considered options

- **Migrate to native Postgres tables now** (`pg` or `drizzle-orm`). Rejected:
  it solves multi-instance scale-out, which is not a constraint we are hitting.
  Deferred, not abandoned — see the trigger below.
- **Keep zero-downtime (overlapping) deploys.** Rejected. See below.
- **Do nothing.** Rejected: writes are being lost on every deploy today.

## Consequences

**We chose durability over availability at deploy time.** With a whole-blob
store these are mutually exclusive: if a new instance loads the blob while the
old one is still writing, the new instance's first flush overwrites everything
the old one did after that load. Ironically, flushing the old instance *more*
cleanly on shutdown just means *more* gets overwritten. The only way to remove
the window is to let the old instance die completely before the new one boots:

- `RAILWAY_DEPLOYMENT_OVERLAP_SECONDS=0`
- `RAILWAY_DEPLOYMENT_DRAINING_SECONDS=15`

This costs roughly **30–60 seconds of hard downtime per deploy**. Deploys should
be scheduled off-peak, but note that off-peak is *not* a safe window in the way
it looks: after-hours emergency answering is an explicit selling point
(`docs/core-pricing-gtm.md`, `docs/gtm-playbook.md`), so overnight calls are
fewer but individually worth more. Treat off-peak scheduling as discipline, not
as a guarantee — it does nothing for crash restarts (`restartPolicyType:
ON_FAILURE`) or urgent daytime hotfixes.

**Railway's default grace period is 0 seconds.** A SIGTERM handler is worthless
without `RAILWAY_DEPLOYMENT_DRAINING_SECONDS` set; the process is SIGKILLed
before it can run.

**The service must stay at one replica.** Scaling up silently corrupts data
rather than failing loudly.

## When to revisit

"When we have more customers" is not a usable trigger, because the binding
variable is not customer count — it is `blob size × flush frequency`.
`calls.transcript` is a TEXT column inside the blob that `appendTranscript()`
appends to *during* a call (5–15 times per call), so total network cost grows
roughly with the square of cumulative call volume.

Migrate when **any** of these is hit:

| Signal | Threshold | How it is measured |
|---|---|---|
| Blob size | > 10 MB | Single reading. The blob only grows, so one sample is already the truth. |
| Flush duration | p95 > 1 s | Rolling window of 50 flushes, minimum 20 samples, **first 3 flushes after boot excluded**. |
| Neon usage | at plan limit | Manual — check the Neon dashboard. **FIRED 2026-08-14** — see below. |

These are instrumented in `flush()` and alert once per process by SMS to
`OWNER_PHONE_NUMBER` on threshold crossing — a deferral whose exit signal is
invisible is not a decision, it is forgetting. The live numbers are on
`/health/detailed` under `persistence`.

**Why duration needs a distribution and size does not.** The first flushes
after a deploy carry Neon connection setup and, on a suspended free-tier
database, the wake-up. That alone can exceed a second while the blob is still
a megabyte. The first implementation alerted on any single flush over the
threshold and duly fired on the very next deploy at 1282 ms, with a blob
nowhere near the size that would justify migrating. One slow flush is noise;
a slow 95th percentile is the blob genuinely getting expensive.

**The Neon trigger fired first, and on a cost this ADR did not model.** On
2026-08-14 a Neon alert put `neon-fuchsia-ocean` at 4 GB of its 5 GB monthly
public network transfer, with the blob at 3.75 MB and both other thresholds
comfortably unmet.

The blind spot is worth naming, because it survives the migration decision.
This document reasoned that "the binding variable is `blob size × flush
frequency`" — that is, **writes**. But Neon bills *egress only*, so flushes
are free and the entire bill is `blob size × process count`: `pgLoad` pulls the
whole database once per process, and every operator script is a process, not
just the server. Nothing instrumented that path — `onFlush` watches writes.
The penalty is also worse than a bill: the free plan **suspends compute** at
100%, and `openDb` throws rather than falling back, so production stops
booting.

Cheaper than migrating, in order: gzip the blob in `pgSave`/`pgLoad`; cache it
locally for scripts keyed on `updated_at`; prune `analytics_events` /
`chat_logs`. Tracked in `BACKLOG.md`.

**`calls` is the first table to move** when that day comes: transcripts are
append-only, read per-call, never aggregated, and are the dominant growth term.
Moving them stops the blob growing at all. `funnel_events` is already off the
blob and is the pattern to copy.

## Related

`prospects` is now dead weight — SMS outreach was tried and abandoned in favour
of SEO and offline channels — but it **cannot be dropped**: `unsubscribed_at`
is a column on that table (`src/db/schema.ts:205`), and those opt-out records
must be retained under the Spam Act. See `LISTS.md`.
