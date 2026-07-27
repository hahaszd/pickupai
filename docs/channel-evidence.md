# Channel evidence

What has actually been tried to acquire customers, the raw numbers, and what
they support. Written so nobody re-derives it from the database again.

**Rule for this file:** record the numbers and how they were obtained, not just
the verdict. A verdict without its method cannot be re-checked when things
change. Record disproved claims too — "we tried X, here is why it failed" is
the finding most often lost.

Last updated: **2026-07-27**.

---

## Summary

| | |
|---|---|
| Real customers ever | **1** (Western Sealants, organic, 2026-07-26) |
| Paying customers ever | **0** |
| Marketing SMS sent | 560, over 2026-04-21 → 2026-05-12 |
| Genuine human clicks from those 560 | **0** |
| Signups from those 560 | **0** |

The one real user in this product's history arrived through a channel that was
never worked. The channel that *was* worked produced nothing.

---

## SMS outreach — tried, measured, abandoned

**What was done.** 10,614 prospects scraped from directories and state licence
registers; 540 of them contacted with 560 SMS between 2026-04-21 and
2026-05-12, across A/B variants (`C_cost_framing`, `D_trial`, and others).

**Headline result: zero genuine human engagement.**

| Signal | Count |
|---|---|
| `outreach_log.link_clicked_at` stamped | 60 |
| Of those, genuine humans | **0** |
| Replies | 2 |
| Opt-outs | 6 |
| Signups | 0 |

### Why the 60 "clicks" are not clicks

This matters because the column looks like engagement and is not. Four
independent lines of evidence, any one of which would be suggestive and which
together are conclusive:

1. **Median delay from send to click: 4 seconds.** 42 of the 60 landed inside
   10 seconds. People do not read an SMS and tap a link in four seconds.
2. **Same-second clusters.** 8 clicks share the timestamp `2026-05-08T02:03:55`,
   4 share `:44`, 4 share `:42`. Ten such instants in total.
3. **User agents.** One is literally `TelegramBot (like TwitterBot)`. Most of
   the rest are `Mozilla/5.0 (X11; …)` — X11 is a Linux desktop, which is not
   what an Australian tradie browses on — plus `Dalvik/2.1.0`, an Android HTTP
   library rather than a browser.
4. **No JavaScript ever executed.** `funnel_events` is written by a tracker in
   the page. Every one of its 19 rows belongs to `prospect_id`
   `00000000-0000-0000-0000-000000000001` — the seeded test prospect — with
   variants named `pg_smoke`, `phone_smoke_v2`, `phone_smoke_v3`,
   `deploy_check`, `funnel_smoke`. Those are our own smoke tests. **No real
   prospect ever loaded the page far enough to fire an event.**

These are carrier-level SMS link scanners and messaging-app link previews. They
fetch the redirect and stop.

### What that means, precisely

The messages *were* delivered — 6 people opted out and 2 replied, so humans
read them. They read them and did not tap. That is a **message and offer
problem with cold tradies**, not a landing-page conversion problem: there was
never any traffic to convert.

**Do not repeat this campaign unchanged.** If SMS is revisited, the thing to
change is the message, and success has to be measured on `funnel_events`
(JavaScript fired in a real browser), never on `link_clicked_at`.

### Reproducing this analysis

Click timing and clustering come from `outreach_log.sent_at` vs
`link_clicked_at`. Bot-vs-human comes from joining `outreach_log` to
`funnel_events` on `prospect_id`. `analytics_events` rows named
`sms_link_clicked` carry the IP and user agent in `payload_json`.

Note the funnel tracker only shipped 2026-05-07/09 (`39cbf88`, `aeb9230`,
`c52cf83`), partway through the campaign — but 43 clicked prospects fall after
that date, and none of them fired an event.

---

## Organic — never worked, produced the only real user

**Western Sealants**, Melbourne, waterproofing/sealants. Signed up
2026-07-26 10:07, roughly two months after all outreach stopped. Not in the
prospects table, never texted. Genuinely organic.

At the time he arrived the site had **one indexable page** and did not appear
in search results for its own category. How he found it is still unknown and is
worth asking him directly — it is currently the only working acquisition path
in evidence.

What he did, from `analytics_events`:

```
10:07:16  signup_completed        trade_type: "other"
10:07:19  logged in
10:07     welcome SMS sent (Twilio, delivered)
10:07     demo audio generated
10:10     demo_requested
10:10     demo_slot_assigned      +61257465832
────────  nothing further; never returned
```

He engaged within three minutes and then stopped at the last step before
hearing the product.

**What he would have met.** His trade is not in the signup dropdown, so he was
stored as `other`, and `buildTradeSection()` had no config for it. The assistant
would have introduced his business to callers as *"an Australian **other**
business"* with **zero trade questions**. The sample lead SMS he was shown used
a hardcoded Sydney address (Parramatta NSW) for a business whose service area he
had entered as Melbourne.

Fixed 2026-07-27: the signup form now asks unlisted trades to type their trade,
which is stored and used as the label, and unlisted trades get a generic but
usable intake question set. The hardcoded NSW demo addresses are **not yet
fixed**.

### Still open: trades absorbed into "handyman"

`TRADE_ALIASES` in `src/realtime/session.ts` maps **general, maintenance,
locksmith, locks, landscaping, landscaper, gardener, concreter, concreting,
fencing and fencer** to `handyman`. A fencing business is therefore introduced
to its own callers as *"an Australian handyman and general maintenance
business"*, and gets handyman intake questions rather than anything about
linear metres, materials or boundary cost-sharing.

That aliasing predates the generic fallback and was the lesser evil when the
alternative was no questions at all. It may no longer be: being called a
fencing business with generic questions is arguably better than being called a
handyman. Untested either way — decide it with a real fencer, not from the
armchair.

Note none of these appear in the signup dropdown either, so reaching them at
all requires typing the trade into the "Other" box.

---

## What is not evidence

- **One organic signup is not proof the market has matured.** n=1, and the only
  deliberate acquisition attempt returned n=0. It cannot distinguish a trend
  from a single event.
- **`link_clicked_at` is not engagement.** See above.
- **A green eval is not proof the phone product works** — see `docs/eval.md`.

## Competitors

Six sites fetched 2026-07-27 for "AI receptionist for Australian tradies":
`aidial.com.au`, `hithereai.com`, `waboom.ai`, `trade-va.com`,
`aussiebusinessai.com.au`, and `getfullybooked.au` — the last of which has
**pivoted out of the niche entirely** and now sells patient reactivation to
cosmetic dental practices.

- **Four of the five relevant ones run per-trade pages.** We were the only one
  without any until 2026-07-27.
- **Only one (Waboom) publishes pricing**, and it is per-minute.
- **Only one (Waboom) shows any proof** — a live number you can ring, plus
  named case studies. The others have no testimonials, no case studies, no
  audio. We have 16 demo recordings, which were reachable only from a `noindex`
  page until the trade pages shipped.

---

## Operational numbers worth not re-measuring

- **Database blob: 3.7 MB** as at 2026-07-27, against the 10 MB migration
  threshold in [ADR-0001](adr/0001-whole-blob-persistence-and-deferred-migration.md).
- **SMS provider is Twilio**, not Mobile Message — the Mobile Message credit was
  cancelled when the project was nearly shelved. If its env vars are still set,
  every send makes a failed API call before falling back. `/admin/health/sms`
  now reports the configured provider *and* the one that actually sent.
- **Prospect list:** 10,614 total, 8,496 still `new`, 1,568 `not_mobile`,
  540 `contacted`, 10 `do_not_contact`, 6 unsubscribed.
