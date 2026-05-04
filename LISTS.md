# Marketing-SMS Lists & Consent Basis

This document tracks **why** each source list is legally permissible to message
under the Australian Spam Act 2003. Read this before adding a new source or
running a campaign on an unfamiliar list. ACMA enforcement is real and
penalties scale to the company, not the campaign.

## TL;DR — the rules

The Spam Act prohibits sending commercial electronic messages without consent.
Consent comes in two flavours:

1. **Express consent** — the recipient explicitly opted in (e.g. "subscribe me
   to plumbing-tech updates" form, ticked checkbox at signup, written agreement).
2. **Inferred consent** — narrower, but applies when:
   - The mobile number is **conspicuously published** by the business in
     connection with their commercial role; AND
   - The number was published **without a "no commercial messages" notice**; AND
   - The message is **directly related to the business or work function** of
     the person at that number.

Three conditions, all must hold. If any one fails, you don't have consent.

Plus, every commercial message must:

- Identify the sender (legal name, ACN if registered, or trading name).
- Contain a **functional unsubscribe** facility, free for the recipient,
  honoured within 5 working days. Our system honours it instantly via STOP
  reply or the email opt-out path.

## Per-source assessment

### `licenses_nsw` (NSW Fair Trading Public Register)

- **Source**: nsw.gov.au public licensee register.
- **Conspicuously published?** Yes — business contact phone numbers are listed
  on the public-facing register precisely so consumers and trade-related
  parties can contact licensed tradespeople.
- **No-commercial-messages notice?** Not present at the source.
- **Message relevance**: PickupAI is a productivity tool for licensed tradies
  to handle missed business calls. Directly related to the business function
  the number was published for.
- **Verdict**: **inferred consent — defensible**. Use freely.
- **Caveat**: if a tradie has explicitly opted out of marketing on the
  register itself, exclude them. Today the scraper does not parse such flags;
  add this when ACMA-grade auditing is needed.

### `licenses_qld` (QBCC Public Register)

- **Source**: QBCC public register of licensed contractors.
- Same analysis as NSW. **inferred consent — defensible**.

### `licenses_vic` (Victorian Building Authority Public Register)

- **Source**: VBA public register.
- Same analysis as NSW. **inferred consent — defensible**.

### `truelocal`, `hipages`, `oneflare`, `serviceseeking`, `localsearch`, `yellowpages`

- **Source**: scraped directory listings.
- **Conspicuously published?** Yes, but the publication is tied to the
  directory's terms of service — many directories explicitly state in their
  ToS that scraping for marketing is prohibited.
- **Message relevance**: still business-related, OK.
- **No-commercial-messages notice?** Several directories include implicit
  notices via their ToS forbidding marketing use of contact details.
- **Verdict**: **gray to red — DO NOT USE for cold SMS.** ACMA has ruled
  against scraped directory data in past enforcement (e.g. Optus 2018, ANZ
  2020-style cases). The risk/reward is wrong: directory-scraped numbers
  convert no better than license-register ones, but carry meaningful penalty
  exposure.
- **Action**: prospects with `source LIKE 'truelocal%' OR source LIKE 'hipages%'
  ...` should be filtered out of bulk-SMS sends. Either:
   - manually mark them `status='not_interested'` in the admin, or
   - extend `/admin/prospects/bulk-sms` to refuse these source prefixes.

### `manual` (admin-entered)

- **Source**: typed into the admin panel by a human operator.
- **Verdict**: depends on where the operator got the number. If it came from
  an existing customer relationship, written agreement, or referral with
  consent → OK. Otherwise → not OK.
- **Action**: when adding a manual prospect, the operator should record the
  consent basis in `prospects.notes`.

## Sender identification

All marketing SMS sent through `renderMarketingSms()` include the brand name
("PickupAI") and a working opt-out path. This satisfies s.17 + s.18 of the
Spam Act.

### ACMA SMS Sender ID Register

- **Registered name**: `PickupAI` (case-sensitive — used verbatim as
  `MOBILE_MSG_SENDER`).
- **Registered to**: ZHANG, ZILIN.
- **Lodged via**: Twilio Inc. (carrier of record on the ACMA application).
  This does not lock us to Twilio for sending — the ACMA register binds the
  name to the person, not the carrier — but the Mobile Message account also
  needs the same name whitelisted by their support team. Send proof of the
  ACMA approval to `support@mobilemessage.com.au` to do that.
- **Approved**: 30 April 2026.
- **Reference**: <https://www.acma.gov.au/sms-sender-id-register>.

### Opt-out link (one-way alphanumeric workaround)

Australian alphanumeric sender IDs are one-way — recipients cannot tap
"Reply" on `PickupAI`. To preserve a working unsubscribe path, every
outbound SMS includes a per-account opt-out shortlink that Mobile Message
hosts on our behalf. The link lives in the env var
`MOBILE_MSG_OPT_OUT_LINK` (e.g. `mb.st/5xrt`) and is appended by
`appendOptOutLine()` in `src/server.ts` as `OptOut <link>`.

When a recipient taps the link, MM records their number on our account's
unsubscribe list and rejects future marketing sends to that number from
the API. The full opt-out lifecycle (page hosting, click tracking,
suppression enforcement) lives on MM's side. Generate or rotate the link
in the MM dashboard under Send Messages → Insert Opt-Out Message.

If `MOBILE_MSG_OPT_OUT_LINK` is unset (e.g. local dev or pre-rollout), the
appended line falls back to `To opt out, email hello@getpickupai.com.au`,
which is honoured by the email opt-out path described above.

#### Suppression-data caveat (deferred follow-up)

Because the unsubscribe is recorded on MM's side, our
`prospects.unsubscribed_at` column is **not** automatically updated when a
recipient clicks the link. While Mobile Message is the only marketing
sender, this is fine — MM blocks the send before it goes out. But if a
campaign were ever switched back to Twilio, those people would be
messaged again because our DB still considers them contactable.

Recommended follow-up (out of scope for the initial rollout): a periodic
job that pulls MM's account unsubscribe list and mirrors it into
`prospects.unsubscribed_at`. Until that's built, treat MM as the single
source of truth for opt-outs.

The `/mobilemsg/sms/incoming` webhook stays wired up for any STOPs that
do arrive via SMS (e.g. through a Twilio fallback during a Mobile Message
outage); `processInboundSms()` continues to call
`markProspectUnsubscribed()` on those.

## Suppression-list maintenance

- The `prospects.unsubscribed_at` column records when a STOP/UNSUBSCRIBE was
  honoured. This timestamp is the legal record — it is **never reset**, even
  if the prospect later opts back in (a new contact request is treated as
  fresh consent).
- `markProspectUnsubscribed()` is called from both Twilio and Mobile Message
  inbound webhooks via `processInboundSms()` — see `src/server.ts`.
- The `smsPreSendCheck()` filter (in `src/server.ts`) rejects any prospect
  with `unsubscribed_at IS NOT NULL` regardless of `status`, so even a manual
  status flip can't accidentally re-message someone.
- Run `node scripts/export-suppression-list.mjs` on a schedule (suggested
  weekly) to dump the suppression list to a CSV for off-site backup. ACMA
  expects you to be able to produce this on demand.

## Quiet hours

Marketing SMS sends are blocked outside 09:00–19:00 Sydney time by
`quietHoursStatus()` in `src/server.ts`. ACMA's industry guidance treats
out-of-hours marketing SMS as an aggravating factor in complaints; the
Spam Act itself doesn't mandate hours but the eMarketing Code of Practice
recommends 9-7 weekday windows.

Operators may bypass quiet hours by passing `force=1` on the admin endpoint
or `--force` on `scripts/send-sms-batch.mjs`. Reserve this for testing
your own number — never for live campaign sends.

## When in doubt

Email the ACMA Spam Reporting Centre (spam@acma.gov.au) with the specific
list source and message you intend to send and ask for guidance. Keep their
response in a `LISTS_acma_correspondence/` folder for future reference.
