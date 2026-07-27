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

| Signal | Threshold |
|---|---|
| Blob size | > 10 MB |
| Flush duration | p95 > 1 s |
| Neon usage | at plan limit |

These are instrumented in `flush()` and alert once by SMS to
`OWNER_PHONE_NUMBER` on threshold crossing — a deferral whose exit signal is
invisible is not a decision, it is forgetting.

**`calls` is the first table to move** when that day comes: transcripts are
append-only, read per-call, never aggregated, and are the dominant growth term.
Moving them stops the blob growing at all. `funnel_events` is already off the
blob and is the pattern to copy.

## Related

`prospects` is now dead weight — SMS outreach was tried and abandoned in favour
of SEO and offline channels — but it **cannot be dropped**: `unsubscribed_at`
is a column on that table (`src/db/schema.ts:205`), and those opt-out records
must be retained under the Spam Act. See `LISTS.md`.
