# Marketing Lists & Consent Basis (SMS + Email)

This document tracks **why** each source list is legally permissible to message
under the Australian Spam Act 2003. Read this before adding a new source or
running a campaign on an unfamiliar list. ACMA enforcement is real and
penalties scale to the company, not the campaign. The Act treats email and SMS
identically — "electronic address" is undefined and Schedule 2 never
distinguishes by type — so everything in this file applies to both channels
unless a section says otherwise. Statutory analysis with verbatim quotes:
[`docs/research/spam-act-email-outreach-2026-08.md`](docs/research/spam-act-email-outreach-2026-08.md).

## TL;DR — the rules

The Spam Act prohibits sending commercial electronic messages without consent.
Consent comes in two flavours:

1. **Express consent** — the recipient explicitly opted in (e.g. "subscribe me
   to plumbing-tech updates" form, ticked checkbox at signup, written agreement).
2. **Inferred consent** (Schedule 2 cl 4(2)) — narrower. **Four** conditions
   plus a proviso, all must hold *per address*:
   - The address is **conspicuously published** by the business in connection
     with their commercial role; AND
   - it is **reasonable to assume the publication occurred with the agreement
     of** the person or organisation (cl 4(2)(c) — this is the condition that
     kills directory-scraped data: a listing published by a directory is not
     published with the business's agreement); AND
   - the publication carries **no "no unsolicited commercial messages" notice
     or statement to similar effect** (cl 4(2)(d) — deliberately loose wording;
     a keyword match is not a check, a read is); AND
   - the message is **relevant to the business or work function** of the person
     at that address — a property of the message you send, not of the address.

   Under **s 16(5) the burden of establishing consent is the sender's**,
   address by address. "We ran a script" discharges nothing; "here is the page,
   the date, and what it said" does.

Plus, every commercial message must:

- Identify the sender (legal name, ACN if registered, or trading name) — s 17,
  which has **no consent defence**: the third-largest Spam Act penalty on
  record ($3.96m, Latitude Finance, April 2026) was an s 17-only case.
- Contain a **functional unsubscribe** facility, free for the recipient,
  honoured within **5 business days** (Schedule 2 cl 6 — the Act never says
  "working days"). Our system honours it instantly via STOP reply, the email
  opt-out path, or the one-click `/u/:token` link.

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

### `email-2026-08` (verified own-website email addresses, NSW)

- **Source**: each address was published on the **business's own website** and
  the pages were fetched, saved, and read by a model whose findings were then
  verified against the saved text by literal string match. Register:
  `data/email-evidence/consent-register-2026-08-10.json` (gitignored — it is
  other businesses' contact data); saved pages under
  `data/email-evidence/<prospect_id>/`. 23 addresses as of 2026-08-10.
- **Conspicuously published?** Yes — labelled contact addresses on the
  business's own site (header/footer/contact page), most confirmed against the
  site's own `mailto:` links.
- **Published with the holder's agreement (cl 4(2)(c))?** Yes by construction —
  own-website only. Directory rows (`oneflare`, `hipages`, `serviceseeking`,
  `localsearch`) are **excluded at the query level** in
  `scripts/collect-email-evidence.ts`, for this clause, before any quality
  argument.
- **No-refusal statement (cl 4(2)(d))?** None found on any fetched page of any
  of the 23, including real privacy policies, terms pages and OH&S policies.
  **Two rows needed manual completion** because the fetcher saved unreadable
  text: `EM Electrical Group` publishes four policies as PDFs (re-fetched,
  extracted with pypdf, read in full — clean; extracts archived alongside the
  originals) and `GS Roofing`'s policy body is JS-rendered (full raw HTML swept
  — the only marketing-adjacent text is a website-vendor iframe and their own
  outbound-marketing consent clause, which is the wrong direction to be a
  refusal). **A "no refusal found" on a page that did not render is not
  evidence** — any new batch must re-check pages whose extracted text is
  suspiciously short.
- **Message relevance**: the message must concern the recipient's business
  function (answering their trade's phone calls qualifies). This is checked at
  copy time, not collection time — record the rationale per campaign below.
- **Verdict**: **inferred consent — defensible, with a shelf life.**
  cl 4(2)(d) was assessed **as at the fetch date (2026-08-10)**. A business can
  add a refusal notice tomorrow. **Re-fetch before sending if the register is
  more than a few weeks old.** Do not top up the batch from the `prospects`
  table without the full pipeline — 57% of rows read in August were wrong about
  at least one field.

## Email sending path — how s 16/17/18 are enforced in code

- **`src/outreach/email-compliance.ts`** is the whole path, deliberately
  outside `main()` so it is testable (22 tests + a 6-mutation kill check).
- `emailPreSendCheck()` blocks `unsubscribed_at`, `do_not_contact`,
  `not_interested`, malformed and `noreply@`-style addresses. **It has no
  force flag and no test override** — unlike `smsPreSendCheck`, deliberately.
- `buildMarketingEmail()` **throws** rather than emit a message missing the
  s 17 identity block or an https unsubscribe URL. `auditMarketingEmail()`
  re-checks any rendered message independently — run it before every send.
- **`/u/:token`** honours opt-outs on GET (human click) and POST (RFC 8058
  one-click — Gmail/Outlook fire this from their native button; without it
  that button silently does nothing, which is the Latitude fact pattern).
  Tokens are HMACs over `OUTREACH_UNSUBSCRIBE_SECRET` and **do not expire**;
  the secret is therefore effectively permanent (see DEPLOY.md).
- **Suppression is one cross-channel record**: both the SMS STOP handler and
  `/u/:token` call `markProspectUnsubscribed()`. An opt-out on either channel
  closes both. Pinned by test.

### Send-day runbook (email)

1. **Before the first send ever**: verify SPF/DKIM/DMARC on the sending
   domain, and set `OUTREACH_SENDER_LEGAL_NAME`, `OUTREACH_SENDER_CONTACT_EMAIL`
   (a monitored mailbox — it is the reply-based opt-out), and
   `OUTREACH_UNSUBSCRIBE_SECRET`. The send path refuses without them.
2. **Send the whole batch on one day.** ACMA's penalty arithmetic is per day,
   summed across days (verified from the published Ticketek notice) — spreading
   a batch across ten days multiplies exposure by roughly ten.
3. **Record the campaign's relevance rationale** in this file, per campaign.
4. **Log every send** to `outreach_log` with `channel='email'` and the rendered
   body in `message` — that row plus the saved page is the s 16(5) story.
5. **Check the contact mailbox daily during and after a campaign.** A reply
   containing "unsubscribe" (or any plain refusal) must be honoured within 5
   business days — honour it same-day with `markProspectUnsubscribed()`. A
   "don't contact me" said on ANY channel, including a phone call, gets the
   same stamp.
6. Hard bounces: set the prospect aside (bad address) — not a legal issue, but
   repeated sends to dead mailboxes are a deliverability and accuracy problem.
7. **Back up the evidence.** `data/email-evidence/` is gitignored and lives on
   one laptop; it is the discharge of the s 16(5) burden. Include it in the
   weekly suppression-list export routine (zip alongside the CSV).

## Follow-up phone calls (multi-touch) — a different regime

Voice calls are **outside the Spam Act entirely** (s 5(5)), and business
numbers are **ineligible for the Do Not Call Register** (ACMA's stated
position). That makes B2B cold calls the legally cleanest channel — but not an
unregulated one: the **Telecommunications (Telemarketing and Research Calls)
Industry Standard 2017** is **in force** (verified on the Federal Register,
2026-08-10) and applies to telemarketing calls regardless of DNCR status.

Its rules, to operator memory — **verify the instrument's text before the
first call session** (the Register's text endpoints defeated automated
fetching): calls only in permitted hours (roughly weekday daytime-to-evening,
restricted Saturdays, none on Sundays or public holidays); identify yourself,
the business, and the purpose at the start; terminate the call immediately on
request; and honour a "don't call again" — in our system that means
`markProspectUnsubscribed()`, same as every other channel.

## Open item — Privacy Act 1988

Collecting and holding business-contact data engages the Privacy Act
independently of the Spam Act (APPs 3, 5, 7). The small-business exemption
(annual turnover under $3m) presently covers this operation on turnover, but
the exemption has carve-outs and **has not been researched** — see §7 of the
research file. Revisit before any list sharing, any purchase of data, or
revenue scale.

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
