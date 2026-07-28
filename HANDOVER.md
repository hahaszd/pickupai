# Handover — 2026-07-28

Written at the end of a long session so the next one starts from here rather
than from a reading of the transcript. Delete or rewrite it once its contents
have been absorbed; it is a baton, not a document to maintain.

## Start here

1. **`BACKLOG.md`** — everything outstanding, ranked. The next task is at the
   top of P1: *"Make the eval report a pass RATE, not a single pass/fail"*.
2. **`CLAUDE.md`** — orientation, commands, the constraints that bite.
3. **`docs/channel-evidence.md`** — what has been tried to get customers and
   what the data actually said. Read before proposing anything about growth.
4. **`docs/eval.md`** — how the eval works and, at the bottom, what its first
   runs really measured.

## Standing rules

Four are in memory and load automatically; they are restated here because they
shaped everything below.

- **Think critically, don't comply.** Check the premise before acting. Say so
  when it is wrong. Recommend, including recommending against.
- **Do it, don't delegate back.** Anything doable is yours. When blocked on a
  credential, ask for the credential — not for the user to run the task.
- **Write findings down immediately.** A finding that changes a decision goes
  into the repo in the same turn, with its numbers and method.
- **Maintain the backlog.** New bug, feature or deferral goes into
  `BACKLOG.md` with a priority on discovery. Read it after finishing anything
  and recommend what is next.

## Where things stand

Everything is committed and pushed. `npm run check` is green: 341 tests, 0 lint
errors, 0 type errors. CI passes. Production is healthy and serving.

Today's substantive changes, all live:

- Toolchain repaired — lint had never worked, three test suites had been
  silently dead for months, 19 dependency CVEs down to 1 low, CI added.
- Three data-loss paths closed: deploys, crashes, and instance overlap.
  See [ADR-0001](docs/adr/0001-whole-blob-persistence-and-deferred-migration.md).
- Electrical safety advice now branches instead of sending every caller to the
  switchboard; a mains-shock rule was added. Handymen got a licensing boundary
  that had been switched off in code by a `!isHandyman` guard.
- Urgency is judged on the situation rather than on a keyword match.
- Owner SMS: `notes` now reaches the tradie, GSM-7 sanitising and an
  action-first layout took a realistic lead from 5 segments to 2.
- Site went from one indexable page to five, plus robots/sitemap/structured
  data. Search Console is verified.
- Voice moved to `gpt-realtime-2.1`; the eval moved to `gpt-5.6-luna`.
- A runnable eval exists: 47 scenarios, and it now runs.

## The next task, with the context it needs

**Make the eval report a pass rate.** Full detail is in `BACKLOG.md`; the short
version is that two consecutive runs of unchanged code gave 38/47 and 37/47
with only partly-overlapping failures, so a single run's number is not a
result. Six scenarios failed in *both* runs and are the only trustworthy
findings so far; they are listed there.

**The user has also proposed** running each eval with a fresh, context-free
agent, several different ones, with the driving agent separate from the judging
agent. **They asked for an assessment of that idea at the start of the next
session, before any implementation.** The proposal and the questions it needs
to answer are recorded in `BACKLOG.md`. Assess it honestly — the caller and
judge are already separate models, so the interesting version of the idea may
be fresh agents *generating* scenarios rather than *running* fixed ones.

## What to be careful of

**Six harness defects today shared one shape**: written, typechecked, tested,
shipped — and never once executed in the configuration it was built for. The
eval could not start without a full Twilio env; `tenant-profile` silently read
an empty local database because nothing loaded `.env`; the eval had no retry
and died on the first rate limit. Green unit tests said nothing about any of
them. **Run the thing.**

**The eval's early numbers were actively misleading.** The first run scored
8/21 and every failure read like the assistant failing to capture a name — it
had in fact never been given one, because no scenario named the caller.
Reporting that would have sent someone to fix a phantom. The judge separately
scored refusals as agreements three times, on exactly the safety fixes that
work. It now has to cite a quote, which makes its errors visible at a glance.
**Read the transcript before believing a red.**

**Do not loosen an assertion to make a test pass.** One was loosened today —
the switchboard scenario no longer demands a callback number — because the
prompt deliberately says not to hold an evacuating caller. The trade that
encodes went into `BACKLOG.md` as a decision. That is the difference between
matching the design and quietly agreeing with yourself.

## Owner-side items that no agent can do

In rough order of value:

1. **Ring Western Sealants** — Melbourne, the only real user this product has
   ever had. Ask what his calls are like, and how he found us; that path is
   currently the only working acquisition channel in evidence and nobody knows
   what it is. Do not open with an apology.
2. **Cloudflare** — its managed robots.txt is prepended to ours and still
   blocks `GPTBot`, `ClaudeBot` and `Google-Extended`. The user wants AI
   assistants to be able to recommend the product; this is what stops it.
3. **Search Console** — submit the sitemap and request indexing.
4. **Railway's `OPENAI_API_KEY`** is almost certainly still the Voice Spark
   key, so real customer calls are billed to the other project.
5. **Rotate the Neon password** — the connection string was pasted into a chat
   transcript.

## Credentials

`.env` holds `OPENAI_API_KEY` (a restricted `pickupai-local-dev` key in the
PickupAI project) and `DATABASE_URL` (production Neon, read-only use so far).
It is git-ignored. **Never paste a secret into the conversation** — transcripts
persist on disk; ask for it to be put in `.env` instead.
