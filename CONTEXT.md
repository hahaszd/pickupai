# PickupAI

A 24/7 AI receptionist for Australian tradies: it answers a tradie's inbound
calls, captures the caller's job details in conversation, and texts the tradie a
structured summary.

## Language

### The three parties

The word "lead" is dangerously overloaded here, because this business has a
sales funnel *and* sells a lead-capture product. Two different people are called
a "lead" depending on which one you mean. Use these three terms instead, and
never use "lead" for anything but the third.

**Prospect**:
A tradie business we might sell PickupAI to. Sourced by scraping directories and
state licence registers. Lives in the `prospects` table.
_Avoid_: lead, target, contact

**Tenant**:
A tradie business that has signed up — it owns a phone number, an AI persona and
its own isolated data. Lives in the `tenants` table.
_Avoid_: customer, client, account, user

**Lead**:
A job enquiry captured from someone who rang a Tenant's number. This is the
product's output and the thing the Tenant pays for. Lives in the `leads` table.
_Avoid_: prospect, enquiry, job, opportunity

> Known violation: the `npm run leads:*` scripts and the `leads-*.csv` gitignore
> entry all operate on **Prospects**, not Leads. Renaming them is safe cleanup;
> until then, read `leads:` in a script name as `prospects:`.

**Caller**:
The person on the phone during a call, before their details have been saved.
A Caller becomes a Lead at `save_lead()`.

### Persistence

**Blob**:
The entire SQLite database exported as a single binary value and stored as one
row in Postgres. Not a backup — it is the durable store. Every flush replaces it
in full.
_Avoid_: snapshot, dump, backup

**Flush**:
Writing the current Blob out, overwriting the previous one. Normally debounced
by 300 ms. Never a partial or incremental write — there is no such thing here.

**Critical write**:
A write whose loss would be visible to a paying customer — saving a Lead,
creating a Tenant, a Stripe state change. These bypass the debounce and Flush
synchronously. See [ADR-0002](./docs/adr/0002-critical-writes-flush-synchronously.md).

**In-flight draft**:
The partially-collected Lead held in memory while a call is still in progress.
It is not in the database, so it does not survive a restart on its own.
