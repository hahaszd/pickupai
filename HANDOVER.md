# Handover — 2026-08-19

A baton, not a document to maintain. **Delete it once absorbed.** Replaces the
2026-08-11 handover, whose email-track status is unchanged and whose two open
warnings are now in `BACKLOG.md`.

## Where things stand

- **Everything committed. 80 commits unpushed. Nothing deployed.** `npm run
  check` green: 30 files, 496 passed + 6 skipped, 0 lint errors.
- **The marketing-claims work is finished and committed** (`6892eae`,
  `b9b601b`, `ee515fb`). The site no longer sells emergency flagging, urgency
  grading, safety advice or a chase-up text; the guard now matches on shape and
  is calibrated in both directions; the four contradicting demo MP3s were
  re-rendered for $0.046. **Nobody has listened to the audio** — the generation
  log printed the corrected lines, which is not the same thing.
- **The cold-email batch is unchanged: fully prepared, not sent.** Same 23
  addresses, same four variants, same send script. See the 2026-08-11 detail in
  `LISTS.md` § "Send-day runbook (email)" and `scripts/email-variants/README.md`.
- **The consent evidence is off the single laptop**: `data/email-evidence/`
  is now its own git history, pushed to `hahaszd/pickupai-email-evidence`,
  **verified private**. It could not go in this repo — `hahaszd/pickupai` is
  public.
- **Email auth checked and it passes.** Resend signs and bounces on
  `send.getpickupai.com.au`; SPF and DKIM align. Only gap is DMARC `p=none`
  with **no `rua=`**, so a batch that lands in spam would teach us nothing.
- **The Neon "80% of your allowance" alert was not ours.** It named
  `neon-fuchsia-ocean` — Council Beacon's project, in the Vercel-linked org.
  PickupAI is `pickupai` / `ep-long-mountain-a75ui4v2`, at 0.08 of 5 GB.
  Allowances are per project; nothing to do. Recorded in `DEPLOY.md`.

## The next task: still the send

Blockers, shorter than they were:

1. **The 60-second recording** (BACKLOG P1) — every email promises one and none
   exists. The same owner phone call produces it *and* the listen test the
   prompt has never had. Owner only.
2. **Three env vars**, one of which needs a decision: is
   `OUTREACH_SENDER_LEGAL_NAME` a personal ABN or a company?
3. **Push + deploy**, which must precede the send or every unsubscribe link
   404s.
4. **DMARC `rua=`** — one Cloudflare TXT record. Cheap, and worth having before
   the send rather than after.

Highest-value non-send work, and it is mine: the **s 17 / s 18 SMS fix**
(BACKLOG, P2, ~1 hour). Audited this session — `sendTenantSms` never appends an
opt-out line although both prospect paths do, and `processInboundSms` drops a
tenant's STOP entirely because it resolves senders via `getProspectByPhone`.
One owner decision sits inside it: does a tenant's STOP also silence their lead
notifications?

## What to be careful of

**Three times this session a check existed, passed, and had never looked at the
thing it was guarding.**

- `marketing-claims.test.ts` was green for a fortnight while the site sold four
  deleted capabilities. It matched phrases; the copy had been reworded.
- `generate-demos.ts` skipped any MP3 that already existed — so its own header
  instruction, *"Regenerate them"*, could be followed exactly and do nothing.
- I explained a Neon bill three different ways, measuring and killing each,
  before checking whether the bill was even ours.

Same family as the last handover's "false zeros from a reader that read
nothing", and worth carrying as one rule: **a passing check is a claim about
the checker until you have watched it fail on purpose.** When rewriting a
guard, calibrate both directions — the cheapest way to make one green is to
delete the honest copy it flagged, and this one did flag five honest denials.

## Waiting on the owner

1. **Env vars** (asked 2026-08-11, answer was "稍后设置") —
   `OUTREACH_SENDER_LEGAL_NAME` (the decision above),
   `OUTREACH_SENDER_CONTACT_EMAIL` (monitored; it is the reply-based opt-out,
   noreply is rejected), `OUTREACH_UNSUBSCRIBE_SECRET` (≥16 chars, **permanent
   once the first send goes out**). Into `.env` / Railway, never the repo.
2. **Authorise push + deploy.** 80 commits; deploy precedes send.
3. **The real phone call** — standing since 2026-08-09; produces the recording.
4. **Listen to the four regenerated demos** — plumber-emergency,
   electrician-emergency, handyman-emergency, handyman-afterhours. If a line
   sounds wrong, edit and `npx tsx scripts/generate-demos.ts --force <id>`.
5. **Shall I add DMARC `rua=` in Cloudflare?** DNS is a config change, so I did
   not do it unasked.
6. **Ring Western Sealants** (`+61407878427`, ~7:30am or ~4:30pm) — the only
   real signup this product has had. The question that matters is how they
   found us; it is still the only acquisition path in evidence.
7. **Tenant STOP semantics** for the s 17 fix (see above).
8. Before the first follow-up call: the Telemarketing Standard's permitted
   hours, or simply call weekday 10:00–16:00.
