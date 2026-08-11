# Handover — 2026-08-11

A baton, not a document to maintain. **Delete it once absorbed.** Replaces the
2026-08-09 handover: its email track was completed this session end to end;
everything else it held is in `BACKLOG.md`.

## Where things stand

- **Everything is committed locally. Nothing has been pushed or deployed.**
  `npm run check` green: 500 tests (494 + 6 skipped judge probes), 0 lint
  errors. Both actions are owner-gated.
- **The deploy gap is load-bearing.** The email path — `/u/:token` unsubscribe
  (GET + RFC 8058 POST), the compliance module — exists only locally.
  Production must be deployed **before** the first send, or every unsubscribe
  link in every sent email 404s: a non-functional s 18 facility, the exact
  Latitude Finance fact pattern.
- The first cold-email batch is fully prepared and **not sent**:
  - 23 verified addresses: `data/email-evidence/consent-register-2026-08-10.json`
  - merge fields (signature: Simon): `data/email-evidence/batch-2026-08.json`
  - approved copy ×4 + sequence rules: `scripts/email-variants/`
  - send script (dry-run default, five per-recipient checks):
    `scripts/send-email-batch.ts` — 23/23 rendered clean; exact previews in
    `data/email-evidence/preview-1-opener/`
- **Everything under `data/email-evidence/` is gitignored and exists on one
  laptop only.** It is the discharge of the s 16(5) consent burden. Back it up
  before sending — LISTS.md runbook item 7.

## The next task: send the batch — after the blocker and the owner list

**The blocker is BACKLOG P1 (2026-08-11): every email promises "a 60-second
recording of it taking a real call", and no such recording exists.** It pairs
with the oldest open item — no real phone call has ever been placed against
the current prompt. One owner call produces both: the listen test (does the
TTS say "triple zero"? does the no-advice sentence land warmly?) and the
artifact every replier receives.

Send-day order is written down — `LISTS.md` § "Send-day runbook (email)" and
`scripts/email-variants/README.md`: env vars → deploy → back up evidence →
re-run the dry-run (footers become real) and read all 23 previews → `--send`,
whole batch in **one** day → check the contact mailbox daily → follow-ups per
the README (`--variant 2-bump / 3-pain / 4-closer`, `--exclude` repliers,
reply-unsubscribes honoured same day).

After the send, highest-value non-send work: the `channel-evidence.md` port
(BACKLOG P2 — the file is two weeks stale and its "1 real customer" headline
is now known false), then the eval items long in BACKLOG (judge accuracy,
five uncovered prompt branches).

## What to be careful of

- **The session's recurring error shape: false zeros from a reader that read
  nothing.** Three instances — a keyword regex over JS-rendered pages whose
  body never rendered, PDFs saved as undecodable byte dumps, and
  ligature-broken PDF text where "marke�ng" defeated `/marketing/`. Each
  looked exactly like "checked: clean". A zero counts only when the reader
  demonstrably read the text. The rule is now written into LISTS.md and the
  `email-consent-check` skill; apply it to every new batch.
- **A cheap model's validation transfers only to the exact question
  validated.** Haiku went 4/4 on refusal detection while inventing two email
  addresses in the same run. The protection is structural — readers may only
  classify script-extracted candidates, and stage 3 literal-matches every
  address and quote against the saved pages. Do not relax it for speed.
- **Operator transcription is a failure surface.** The batch file deliberately
  contains no addresses; the send script joins register↔batch on prospect_id
  and refuses on mismatch. Keep that property when the batch grows.

## Waiting on the owner

1. **Env vars** (asked 2026-08-11, answer was "稍后设置"):
   `OUTREACH_SENDER_LEGAL_NAME` — what is the legal entity, personal ABN or
   company? — plus `OUTREACH_SENDER_CONTACT_EMAIL` (monitored; it is the
   reply-based opt-out; noreply is rejected) and `OUTREACH_UNSUBSCRIBE_SECRET`
   (≥16 chars, **permanent once the first send goes out**). Values into
   `.env` / Railway, never into the repo.
2. **SPF / DKIM / DMARC on the sending domain** — never checked; without it
   the batch lands in spam and the result is unreadable.
3. **Authorize push + deploy** (deploy must precede send — see above).
4. **The real phone call** — standing since 2026-08-09, and it now also
   produces the recording the emails promise (BACKLOG P1).
5. Before the first follow-up call: verify the Telemarketing Standard's
   permitted hours (flagged in LISTS.md — the instrument is confirmed in
   force but its text defeated automated fetching), or simply call weekday
   10:00–16:00, inside any plausible window.
