# Backlog

Everything outstanding, ranked. **Add an item the moment it is discovered** —
a bug found while doing something else, a feature agreed in conversation, a
deliberate deferral, an open question from an investigation. Not at the end of
a session.

Each item names the evidence that motivated it, so it can be judged later
without re-deriving. Finished work moves to [Done](#done) with its commit
rather than being deleted.

**Priorities**

| | |
|---|---|
| **P0** | Losing money, data or safety *right now* |
| **P1** | Blocks a decision or a customer |
| **P2** | Real, schedulable |
| **P3** | Worth doing, no urgency |

A deferral with a documented trigger is P2, however alarming it reads.

Last updated: **2026-07-27**

---

## P0

*Nothing open.*

## P1

### Ring Western Sealants
Owner action. Melbourne, `+61407878427`, signed up 2026-07-26 and stopped at
the last step before hearing the product. The only real user in this product's
history. Ask what his calls are like (feeds a sealants trade config) and **how
he found us** — currently the only working acquisition path in evidence and we
have no idea what it is. Tradie-reachable windows are ~7:30am or ~4:30pm local.
Do not open with an apology; he has not complained. See
`docs/channel-evidence.md`.

### Cloudflare: unblock the AI crawlers
Owner action, Cloudflare dashboard. Its managed robots.txt is **prepended** to
ours, and disallows `GPTBot`, `ClaudeBot`, `Google-Extended`, `CCBot`,
`Bytespider`, `Amazonbot`, `meta-externalagent`. The live-retrieval bots
(`OAI-SearchBot`, `ChatGPT-User`, `PerplexityBot`) are *not* blocked, so ChatGPT
can already cite us — but `Google-Extended` gates Google's AI Overviews, which
sit above organic results. Turning the managed file off also collapses the two
`User-agent: *` groups into one, which is what makes our `Disallow: /r/` apply
to crawlers that only honour the first matching group.

### Search Console: submit the sitemap, request indexing
Owner action. Verified via Cloudflare DNS on 2026-07-27. All seven sitemap URLs
were confirmed live. New pages can wait weeks without an explicit index request.

### Confirm graceful shutdown actually runs
Owner action, Railway logs. Look for `shutdown: draining` and
`shutdown: final flush complete` on a deploy. If neither appears,
`RAILWAY_DEPLOYMENT_DRAINING_SECONDS` is not taking effect and the whole
shutdown path in `src/server.ts` is dead code — deploys still lose writes.
See [ADR-0001](docs/adr/0001-whole-blob-persistence-and-deferred-migration.md).

### Run the eval P0 suite for the first time
21 P0 scenarios, never executed. Needs `OPENAI_API_KEY`; costs real money.
`npm run eval:p0`. Expect failures — emergency over-tagging, warm transfer and
the SMS truncation issues below are all unfixed. A fully green first run should
be treated as suspicious, not as success. See `docs/eval.md`.

## P2

### `issue_summary` truncated to 120 characters in the owner SMS
`truncSms(compact(l.issue_summary), 120)` (`sms.ts:118`). The handyman
multi-job call — the most valuable call that trade takes — arrives as
"door won't latch, flyscreen hole, hang three pictures in hallw…". The full
text survives on the lead page, but the tradie is reading an SMS in a van.

### Emergency over-tagging trains the owner to ignore the label
`no power` and `power outage` are electrician emergency keywords
(`session.ts:135`); `no hot water` is a plumber one (`:125`). These are the
*modal* calls for those trades, and each fires the priority header plus a
second chase-up SMS two minutes later (`server.ts:830-847`). Within a fortnight
the EMERGENCY prefix means nothing. Three eval negative controls exist and will
fail until this is addressed.

### Warm transfer is not gated on urgency, and uses global business hours
`server.ts:1784` transfers before the media stream opens, so no urgency has
been assessed — it is all calls or none. `shouldWarmTransferNow()`
(`twilio/flow.ts:5-13`) reads `env.BUSINESS_HOURS_*`, not the tenant's, so a
Perth tenant gets someone else's clock. Sold as "genuine emergencies are
warm-transferred" in `docs/core-pricing-gtm.md:13`.

### Emergency follow-up SMS has no cap and a stale closure
`server.ts:830-847` fires unconditionally two minutes after every emergency
lead. `lead` is captured in the closure and never re-read, so marking the job
handled does not suppress it, and there is no per-tenant cap. Twenty hail calls
means forty messages. It is also an unref'd in-process timer, so a deploy
inside the window silently cancels it.

### Photo capture is promised in three places and implemented in none
`session.ts:655` lists "Photo suggestion (if relevant)" in the conversation
flow with no section defining what to say; `sms.ts:132` documents a photo
suggestion the function never emits and accepts a `tradeType` parameter it
never reads; `docs/core-pricing-gtm.md:11` sells it. Highest-value miss for
roofing and handyman, where a photo turns a site visit into a phone quote.
Note the caller SMS goes out under an alphanumeric sender when Mobile Message
is active, which cannot receive replies — decide the channel before the copy.

### Decide whether fencing, locksmith and concreting should stay aliased to handyman
`TRADE_ALIASES` maps general, maintenance, locksmith, locks, landscaping,
landscaper, gardener, concreter, concreting, fencing and fencer to `handyman`,
so a fencing business is introduced as "an Australian handyman and general
maintenance business". That was the lesser evil when the alternative was zero
intake questions; the generic fallback added 2026-07-27 may now be better.
Decide it with a real tradie in that category, not from the armchair.

### Add trade configs for the next ring of trades
Sealants/waterproofing first, prompted by the actual signup. Cheap — one
`TRADE_CONFIGS` entry plus a dropdown option. **Not** a move toward a general
small-business product: trade specificity is the only differentiator against
six better-resourced competitors. See `docs/channel-evidence.md`.

### `/version` reports a hardcoded build string
`build` and `commit` in `src/server.ts` are literals (`"pending"`), so there is
no way to confirm which commit is live. Railway injects
`RAILWAY_GIT_COMMIT_SHA`.

### Remove the dead `MOBILE_MSG_*` env vars from Railway
The Mobile Message credit was cancelled. If the vars are still set,
`isMobileMessageConfigured()` returns true, every send fails, and each message
pays a wasted API round-trip before falling back to Twilio.
`/admin/health/sms` now reports the mismatch.

### Known type errors: none; known lint warnings: ~248
All `@typescript-eslint/no-explicit-any`, concentrated at the sql.js and Twilio
webhook boundaries. Error count must stay at 0.

## P3

### Split operational alerting from marketing SMS
If the product ever moves back to Mobile Message, system alerts and marketing
share one sender ID — a marketing complaint that restricts the sender would
silence the alerts too. Pin alerting to Twilio.

### `scripts/tenant-profile.ts` verdict ignores demo intent
It calls a signup with no calls "Competitor or abandoned signup", but
`demo_requested` and `demo_slot_assigned` are clear intent signals. It
mislabelled Western Sealants, who had done both.

### Upgrade CI actions off Node 20
`actions/checkout@v4` and `actions/setup-node@v4` are being force-run on Node
24 with a deprecation warning.

### `esbuild` low-severity advisory
Windows-only dev-server issue, pinned by vitest's dependency range. Not on any
production path.

---

## Done

| Done | What | Commit |
|---|---|---|
| 2026-07-27 | Toolchain repair: ESLint flat config, 3 dead test suites revived, typecheck for tests/scripts, 19 dependency CVEs → 1 low, CI | `a5b7d31` |
| 2026-07-27 | Persistence: flush serialisation, graceful shutdown, in-flight lead salvage, critical-write flush, blob instrumentation | `eb50bc1` |
| 2026-07-27 | `CODING_STANDARDS.md`, `CLAUDE.md`, agent skill configuration | `336c95d` |
| 2026-07-27 | `job_size` split from `job_value`; `confidence` declared in the tool schema | `fd3914c` |
| 2026-07-27 | Electrical safety advice branched; electric-shock rule; handyman licensing scope | `cb88bed` |
| 2026-07-27 | Runnable eval harness, 47 per-trade scenarios | `4930ce6` |
| 2026-07-27 | robots.txt, sitemap.xml, structured data, GSC env var | `5793ef7` |
| 2026-07-27 | Per-trade landing pages and `/pricing` | `be356d1` |
| 2026-07-27 | Flush alert gated on p95 rather than a single sample | `4240471` |
| 2026-07-27 | `/admin/health/sms` reports the actual sending provider | `c1c6e55` |
| 2026-07-27 | `scripts/tenant-profile.ts` | `9fa55fc` |
| 2026-07-27 | Unlisted trades no longer "an Australian other business"; `docs/channel-evidence.md` | `a52b592` |
| 2026-07-27 | Demo suburb follows the tenant's service area; `BACKLOG.md` created | `ca19ffa` |
| 2026-07-27 | `notes` now reaches the owner SMS — voicemail bodies, claim numbers, audio warnings | `b7b3430` |
