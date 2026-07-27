---
status: accepted
date: 2026-07-27
---

# Critical writes flush synchronously

Writes normally schedule a debounced 300 ms flush, so up to 300 ms of work is
only in memory at any moment. For a **critical write** — one whose loss is
visible to a paying customer — we flush immediately instead, accepting a few
hundred milliseconds of latency to shrink the loss window to approximately zero.

Critical writes are: **saving a lead**, **creating a tenant / completing
signup**, and **Stripe webhook state changes**. Everything else, including
`appendTranscript()`, stays on the debounced path — transcript appends are by
far the most frequent write and losing a fragment of one is not
customer-visible.

How strong the guarantee is depends on what the call site can do:

- **Signup** and the **Stripe webhook** are async handlers, so they `await` the
  flush before responding. The Stripe handler returns **500 if the flush fails**,
  so Stripe retries rather than us acknowledging state we did not persist.
- **`save_lead` / `end_call`** arrive on synchronous, `void`-returning realtime
  tool-call callbacks, so there is nothing to await into. They start the flush
  immediately and log failures. The window shrinks from "300 ms debounce + flush"
  to "flush", which is the part that matters, but it is not a hard guarantee.

## Prerequisite: `flush()` had to be made honest first

The original `flush()` began with `if (flushing) return`. A caller awaiting a
flush while another was already running got an immediately-resolved promise for
a write that had exported the database *before* their row existed — a durability
promise that was not kept. The same guard could also strand a debounced batch in
memory indefinitely, because the timer had already been cleared and nothing
rescheduled it.

Flushes are now serialised on a promise chain, and each one re-exports inside
its own queued step, so awaiting a flush always covers your own write.
`tests/db-flush.test.ts` pins this; the first test fails against the old guard.

## Why this and not just a shutdown handler

A SIGTERM handler plus Railway's draining/overlap settings (see
[ADR-0001](./0001-whole-blob-persistence-and-deferred-migration.md)) only help
when the process is *politely asked* to stop. Crashes, OOM kills and platform
SIGKILLs are not polite. Synchronous flushing is the only one of the three
measures that survives them, and it works regardless of any Railway
configuration:

| Measure | Graceful stop | Crash / OOM / SIGKILL |
|---|---|---|
| SIGTERM handler + draining | yes | no |
| `OVERLAP_SECONDS=0` | yes | no |
| **Critical-write immediate flush** | yes | **yes** |

## Consequences

Saving a lead now blocks on a full-blob upload to Neon. At current blob size
(~1–2 MB) that is a few hundred milliseconds, and it happens at the end of a
call while the assistant is already saying goodbye, so it is inaudible to the
caller. **This assumption breaks as the blob grows** — it is one of the reasons
ADR-0001's 10 MB threshold matters.

A future reader will be tempted to "optimise" this back onto the debounced path.
Don't. It is deliberate.

This ADR retires when ADR-0001's migration happens: once `leads` is a native
Postgres table, the row is durable on INSERT and no blob flush is involved.
