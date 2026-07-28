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

## P1

### Make the eval report a pass RATE, not a single pass/fail
**This is the next task.** Two consecutive full runs of the same 47 scenarios
against unchanged product code gave 38/47 and 37/47, and the failing sets only
partly overlapped. Five scenarios flipped between runs. A single run's number
is therefore not a result, and treating it as one will send someone chasing a
defect that was a coin toss.

Conversations are non-deterministic by construction — the assistant runs at
temperature 0.3 and the simulated caller at 0.8, deliberately, because pinning
to 0 would evaluate a voice no caller ever hears.

What to build:
- Run each scenario N times (3 for P0, configurable) and report `k/N passed`.
- Classify: **N/N red** is a defect. **N/N green** is a pass. **Anything
  between** is marginal behaviour and gets listed separately — it is real
  information, not noise to be rounded away.
- Gate on the rate: a P0 must be 3/3. Failing 1-of-3 is not a release blocker
  but is not a pass either.
- Report the flake list explicitly. A scenario that flaps is telling you the
  prompt is ambiguous at that point, which is worth knowing on its own.

Only these six failed in **both** runs, so only these six are currently
trustworthy findings:

| Scenario | Failure |
|---|---|
| `electrician_whole_street_blackout` | Doesn't tell the caller it is a distributor outage; takes no number |
| `electrician_overhead_service_line_down` | Captures no name, phone or address on a 000-referral call |
| `plumber_water_bubbling_nature_strip_wrong_number` | Classifies a water-authority job as `new_job`; would send the owner an SMS |
| `roofer_asbestos_cement_sheet_shed_roof` | Never raises asbestos on a pre-1990 cement-sheet roof |
| `handyman_multi_job_call_with_late_addition` | Never asks "anything else on the list", and the line stays open |
| `handyman_supplier_reece_door_closers_pickup` | Takes no callback number from a supplier |

### Evaluate: should each eval run use a fresh, context-free agent?
Proposed by the user 2026-07-28, to be assessed at the start of the next
session — **do not implement before it is thought through.**

The proposal, recorded faithfully:

> Run each eval with a **fresh agent that has no prior context**, and use
> **several different fresh agents**, on the grounds that a context-free agent
> will produce more varied and more genuinely testing conversations. The main
> agent defines the eval spec up front. Crucially, **the agent that drives the
> test and the agent that judges it should be different agents.**

Questions the assessment needs to answer, rather than assuming:
- The caller and judge are already separate models (`gpt-4o-mini` and the judge
  model) with no shared state — so what would agent-level separation add beyond
  what model-level separation already gives?
- Would fresh agents *generating* scenarios be a different and possibly more
  valuable proposal than fresh agents *running* fixed ones? Generation is where
  a context-free perspective plausibly earns its keep.
- Does more variance help or hurt, given the harness already flaps between runs
  on identical input? Deliberate variance and unwanted flakiness are easy to
  confuse.
- Cost: each agent is a separate context. What does this multiply?

## P2

### Decide: should a life-safety call still capture a callback number?
Surfaced by the eval, 2026-07-28. On `electrician_switchboard_crackling_hot_smell`
the assistant tells the family to get out and ring 000 — correct — and lets
them go without a number, following `session.ts:730`: *"Do not keep them on the
line if they need to evacuate."*

So a switchboard fire, one of the highest-value emergency jobs an electrician
takes, can end with no way to ring the customer back. The prompt made that
trade deliberately and the eval now tests it as designed
(`captureTarget: "none"`), but it is worth deciding on purpose rather than by
inheritance. A middle path exists: take the number in one breath *while*
telling them to leave, rather than either holding them or letting them go.

### Decide: should a referred-out call still leave a phone number?
Surfaced by the eval, 2026-07-28. In `electrician_whole_street_blackout` and
`electrician_overhead_service_line_down` the assistant reasons **correctly** —
a whole street being dark is the distributor's problem, a downed service line
is a 000 call — and then ends without taking a number.

`session.ts:103` says the opposite: *"ALWAYS collect the caller's details
regardless — never turn a caller away without taking their information."* So
the prompt's own rule and the assistant's judgement disagree, and both
positions are defensible: today's outage caller may have a real job next week,
against a lead with no job attached being noise.

This is a product decision, not a defect. Whichever way it goes, make the
prompt and the eval agree afterwards.

### Decide: how hard should the assistant push for a callback number?
`handyman_price_shopping_no_booking`. The assistant asks once, the caller
declines, and it closes politely. For a price shopper that means the owner
never learns they lost on price and has no way to ring back and win it.
Pushing harder risks badgering. `session.ts:557` already says to ALWAYS ask;
it does not say what to do when refused.

### Point Railway's OPENAI_API_KEY at the PickupAI project
Owner action. A `pickupai-local-dev` key now exists in the new project and is
in `.env`, but production almost certainly still runs on the Voice Spark key —
so real customer calls are still billed to the other project and the usage
split is only half done. Create a `pickupai-production` key with the same three
permissions (chat completions, realtime, text-to-speech) and swap it in
Railway.


### Shorten the dashboard link in the owner SMS
`https://www.getpickupai.com.au/dashboard/leads/<uuid>` is **83 characters, 29%
of a typical message** — the UUID alone is 36. A `/l/:shortId` route would cut
it to about 27 and often save a whole segment. Needs a new route and a short id
on `leads`.

### `issue_summary` truncated to 120 characters in the owner SMS
`truncSms(compact(l.issue_summary), 120)` (`sms.ts:118`). The handyman
multi-job call — the most valuable call that trade takes — arrives as
"door won't latch, flyscreen hole, hang three pictures in hallw…". The full
text survives on the lead page, but the tradie is reading an SMS in a van.

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

### Remove the dead `MOBILE_MSG_*` env vars from Railway
The Mobile Message credit was cancelled. If the vars are still set,
`isMobileMessageConfigured()` returns true, every send fails, and each message
pays a wasted API round-trip before falling back to Twilio.
`/admin/health/sms` now reports the mismatch.

### Known type errors: none; known lint warnings: ~248
All `@typescript-eslint/no-explicit-any`, concentrated at the sql.js and Twilio
webhook boundaries. Error count must stay at 0.

### Rotate the Neon database password
The production `DATABASE_URL`, including the password for `neondb_owner`, was
pasted into a chat transcript on 2026-07-27 and is now in `.env` locally.
`.env` is git-ignored, so the exposure is the transcript, not the repo. Rotate
in the Neon dashboard, then update Railway and `.env`. Low urgency — the
credential is not public — but `SECURITY.md` records that this project has
already leaked production credentials into git history once.

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
| 2026-07-27 | Urgency judged on the situation rather than a keyword match | `2c6124c` |
| 2026-07-27 | Owner SMS: GSM-7 sanitising + action-first layout — 5 segments to 2 on a realistic lead | `2c6124c` |
