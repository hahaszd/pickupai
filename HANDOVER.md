# Handover — 2026-09-01

A baton, not a document to maintain. **Delete it once absorbed.** Replaces the
2026-08-19 handover, which is fully absorbed: its 81 unpushed commits are
deployed, and its marketing-claims work is live and verified.

## Where things stand

- **Everything committed and pushed. Deployed and verified.** `/version` returns
  `6171b55`, which is `origin/main`. `npm run check` green: 30 files, 501 passed
  + 6 skipped, 0 lint errors. Working tree clean.
- **Production had been running 2026-07-29 code for 34 days.** It no longer is.
  The prompt that told callers to turn off the mains and get away from the
  switchboard — deleted from the repo on 2026-08-03, never deployed — is off
  production as of 16:26 today. So are the marketing claims that sold it.
- **The first-ever `trial` signup was fraudulent** and is fully closed out:
  tenant deactivated, Twilio number `+61 2 5944 1492` released and verified gone,
  Stripe trial cancelled by the owner, card fingerprint `8kz83DZECv7tC4q9` and
  domain `emalupe.com` added to Radar blocklists. Real paying customers: still
  **zero**. Western Sealants remains the only genuine signup and is still `demo`.
- **Shipped today, beyond the backlog deploy:** signup/settings/admin now reject
  non-mobile owner phones (`validateOwnerPhone`, 4 write paths, 5 tests); AI call
  recording deleted outright; `AUTO_PROVISION_NUMBERS` defaults **false**, so a
  paid checkout now waits for owner approval in admin.
- **Railway CLI is now installed and linked** (`brew install railway`, project
  `PickupAI` / service `pickupai`). `railway run <cmd>` injects production env —
  that is how the logs and the database were read today, read-only.

## The next task

**`BACKLOG.md` P0: request headers are logged in full** (`server.ts:213` +
`:1024`, `pinoHttp` with no `redact`). Every completed request writes the
`dashAuth` session cookie — which *is* the tenant login — and the `/admin`
`Authorization` header, at `info`. I read those logs today, so they are not
theoretical. Fix is one `redact` array; then rotate the admin token and the
tenant session tokens.

Two decisions the next session should carry, both in `BACKLOG.md`:

- **`calls.transcript` has never held a word of dialogue** — 107 calls, largest
  1505 bytes, only `[lead]`/`[event]` markers. The dashboard shows it to tradies
  under a heading that says "Transcript". Decide whether the lead fields are the
  faithful record (then delete the column and the heading, which currently lie)
  or whether verbatim capture is a real feature. **This is a `PRINCIPLES.md`
  question, not a coding one.** It also falsifies ADR-0001's growth model, which
  is now corrected in the ADR itself.
- **Do not migrate to Postgres on the strength of today's `flush p95 6336ms`
  alert.** It fired at exactly `FLUSH_MIN_SAMPLES`, with no size alert beside it,
  in the same burst as the signup. `/health/detailed` → `persistence` settles it.

## What to be careful of

**Three claims were reported to the owner as fact today and all three were
wrong in the same shape: the tool output was real, and the interpretation added
one unchecked step on top of it.**

- `GET / referer=https://www.google.com/` became "the customer found us through
  Google". It came from **Google's own prefetch proxy**; a prefetch fires when a
  result is *shown*. Two other browsers in two countries were in that session.
- `grep … | head -8` returned nothing relevant and became "this was never
  written in any document". It was in `DEPLOY.md:56`. **A truncated search is
  not a negative result.**
- Production `403`s became a filed P0. They were deliberate (the owner zeroed
  the Mobile Message credit), already documented, and already fixed by the
  morning's deploy.

The last handover's rule was "a passing check is a claim about the checker".
The inverse is the one that cost time today: **a coherent story is the least
checked kind of answer, because it closes the question instead of opening it.**
The genuinely valuable finding of the day — that transcripts contain no
dialogue — was found only while going back to verify a conclusion already said
out loud.

Also: **every push to `main` is a deploy.** Batch documentation commits.

## Waiting on the owner

1. **Env vars, asked 2026-08-11, still unanswered** — `OUTREACH_SENDER_LEGAL_NAME`
   (personal ABN or company? a real decision), `OUTREACH_SENDER_CONTACT_EMAIL`
   (must be monitored; noreply is rejected), `OUTREACH_UNSUBSCRIBE_SECRET`
   (≥16 chars, **permanent once the first email goes out**). Into `.env` /
   Railway, never the repo.
2. **The `calls.transcript` decision** above.
3. **`N` for a deploy-staleness alert.** The materials exist and need no new
   plumbing: `/version` already knows the running commit, and `alertFounder()`
   already SMSes. I suggested 14 days; not answered. This is the root cause of
   the 34-day gap — the request to push lived only in files nobody opens.
4. **The 60-second recording for the email campaign** — standing since
   2026-08-09, and now known to be blocked twice over: no real call has been
   placed, *and* call recording never worked (Twilio 21220, 13/13) and has now
   been deleted on purpose. The remaining route is the owner recording their own
   handset. The cold-email batch (23 addresses, prepared, unsent) still waits on it.
5. **Ring Western Sealants** (`+61 407 878 427`, ~7:30am or ~4:30pm) — the only
   real signup this product has ever had, never activated. How they found us is
   still the only acquisition question with any evidence behind it, and today
   removed the fake answer rather than supplying a real one.
