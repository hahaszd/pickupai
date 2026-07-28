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

Last updated: **2026-07-28**

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

### BUILT: the eval reports a pass RATE, not a single pass/fail
Why it was needed: two consecutive full runs of the same 47 scenarios against
unchanged product code gave 38/47 and 37/47, and the failing sets only partly
overlapped. Five scenarios flipped between runs. A single run's number is not a
result, and treating it as one sends someone chasing a defect that was a coin
toss. Conversations are non-deterministic by construction — the assistant runs
at 0.3 and the simulated caller at 0.8, deliberately, because pinning to 0
would evaluate a voice no caller ever hears.

Built 2026-07-28: `--repeat N` on `scripts/run-eval.ts`, verdicts aggregated in
`src/testing/eval/aggregate.ts` (pure, unit-tested in
`tests/eval-aggregate.test.ts`), `npm run eval:p0` now runs each P0 three
times. **pass** = every run, **fail** = no run and the only red worth chasing,
**marginal** = in between, reported in its own section and never rounded away.
The gate exits non-zero only on a P0 that fails every run; a marginal P0 is
printed loudly and does not block. See `docs/eval.md`.

### The first trustworthy P0 baseline — 21 scenarios × 3, 2026-07-28
`npm run eval:p0`, concurrency 4, after the judge stance fix. **14/21 passed
all three runs, 2 failed all three, 5 are marginal.** By trade: electrician 4/5,
handyman 2/4, plumber 4/7, roofer 4/5. This supersedes the earlier
"six scenarios failed in both runs" list, which was measured against the broken
judge and covered non-P0 scenarios too.

**Defects — failed 3/3, these are real and block release:**

| Scenario | Failure |
|---|---|
| `plumber_sewage_surfacing_shower` | Never tells the caller to leave the overflow relief gully cap in place instead of pulling it off |
| `electrician_whole_street_blackout` | 2/3 captured nothing at all (no phone); 1/3 also never said it looks like a distributor outage |

The blackout one is **entangled with an open product decision**, not a
straightforward bug — see *"should a referred-out call still leave a phone
number?"* below. The assistant reasons correctly and then ends without details,
which is what `session.ts:103` forbids and what the prompt's evacuation
guidance encourages. Decide that first; the eval is asserting one side of an
argument the prompt has not settled.

**Marginal — passed some runs, failed others. Not defects, not passes:**

| Scenario | Rate | What flapped |
|---|---|---|
| `roofer_hail_pockmarked_no_leak_negative_control` | 1/3 | `urgency_level` came out `routine`, expected `urgent`, on 2 of 3 |
| `handyman_multi_job_call_with_late_addition` | 1/3 | Line stayed open — neither `end_call` nor a hangup — on 2 of 3 |
| `plumber_gas_smell_hot_water_unit` | 2/3 | One run captured no name, phone or address at all |
| `plumber_blocked_drain_price_first_late_night` | 2/3 | One run captured no name |
| `handyman_garage_power_points_plus_sliding_door` | 2/3 | One run never said power points need a licensed electrician |

The bottom two are the ones to watch: a **licensing boundary** and a **gas
leak** that work two times in three are not features that work. Both were
recorded last session as verified by a single green run, which is exactly the
error this rate exists to prevent.

### DECIDED: should each eval run use a fresh, context-free agent? — no, but generate with one
Proposed by the user 2026-07-28, assessed the same day. Kept here rather than
moved to Done because two P2 items below come out of it.

The proposal, recorded faithfully:

> Run each eval with a **fresh agent that has no prior context**, and use
> **several different fresh agents**, on the grounds that a context-free agent
> will produce more varied and more genuinely testing conversations. The main
> agent defines the eval spec up front. Crucially, **the agent that drives the
> test and the agent that judges it should be different agents.**

**Assessed 2026-07-28**, against `runner.ts` and `grade.ts` rather than against
a description of them. Verdict in three parts.

**1. The separation the proposal asks for already exists, one level lower.**
Three participants, three models, three contexts, no shared state:

| | Model | Temp | What it can see |
|---|---|---|---|
| Assistant | `gpt-5.6-luna` | 0.3 | The real system prompt and the real tool schemas |
| Caller | `gpt-4o-mini` | 0.8 | Its own persona + only the assistant's *spoken* words |
| Judge | `gpt-4o` | 0 | Only the assistant's spoken lines + the assertions |

The judge never sees `callerFacts`, `whyThisMatters`, or the caller's own turns
(`grade.ts:111`). The caller never sees the system prompt or any tool call.
Agent-level separation would give the same isolation these three already have,
at roughly 20–50× the caller's cost. **Rejected: no isolation to gain.**

**2. Fresh drivers on fixed scenarios actively fight the pass-rate task.**
Determinism is engineered in deliberately where it costs no realism —
`callerIdentity()` derives name, suburb and mobile from a hash of the scenario
id (`runner.ts:150`) so a rerun gets the same person. The whole point of the
pass-rate task above is to hold the scenario fixed and vary only the sampling,
so that `k/N` means something. A different driver per run makes N runs into N
different tests, and a flaky prompt becomes indistinguishable from a flaky
driver. With 5 of 47 already flipping between runs on identical input, adding
variance by construction raises the flake floor at exactly the wrong moment.
Cost compounds too: the pass-rate work is already ×3. **Rejected.**

**3. The idea is right about something else, and that part is worth doing.**
All 47 scenarios were written by an agent that had just read `session.ts`. So
the library largely tests *what the prompt says it does* — the eval and the
thing under test were authored from the same context. That is a real blind spot
and a context-free perspective is exactly the fix for it, but at **generation**
time, once, not at run time, forever. See the P2 item below.

**Where the "different agents" instinct should be spent instead: the judge, not
the driver.** The judge is the demonstrated weak link — three known wrong
verdicts, all in the same direction (scoring a refusal as an agreement), now
patched with a growing keyword list. See the P2 item on its scoping bug.

## P2

### FIXED: the judge scored prohibitions as agreements
Found by reading `grade.ts` on 2026-07-28, then measured, and the measurement
was worse than the reading. Kept here rather than deleted because the general
lesson outlived the fix; full write-up in `docs/eval.md`.

**Measured**: `electrician_switchboard_crackling_hot_smell`, a P0 the previous
session listed as *verified working*, failed **3 of 6 runs** — and every failure
was a false positive. The judge quoted *"Don't touch the switchboard or flick
the main switch"* as its evidence that the receptionist had told the caller to
operate the switchboard. Same scenario after the fix: **5 of 5 passed**.

**Fix**: the judge no longer answers true/false. It names a stance —
`DIRECTED` / `DISCOURAGED` / `ABSENT` — so `mustSay` passes on `DIRECTED` and
`mustNotSay` fails on `DIRECTED`. A boolean forced "mentioned it while
forbidding it" into one of two answers with the wrong one nearer; the judge had
nowhere to put the truth. **When a judge keeps getting one class of case wrong,
check whether its answer format has room for the right answer before adding
another instruction telling it to try harder.**

The latent defect that started this, now moot, is recorded because it is the
kind that hides for months:

The judge was told, unconditionally:

> THEN CHECK YOUR OWN QUOTE before you answer true. If it contains "don't",
> "do not", "never", "can't", "cannot", "won't", "unable", "avoid", "stay
> clear", "rather than" … the verdict is FALSE.

That rule existed to stop false *positives* on `mustNotSay`, and for `MUSTNOT_`
it was aimed correctly. But it was stated globally, so it also applied to
`MUST_`, where it inverts into a false-*negative* generator: a requirement whose
correct fulfilment is naturally phrased as a prohibition gets forced to false.
`electrician_switchboard_crackling_hot_smell` requires *"told the caller to get
everyone away from the switchboard and call 000"*, and the most natural correct
answer — *"Don't touch anything, get everyone out and call 000"* — contains
"Don't". A P0 safety scenario, one coin toss on the assistant's phrasing away
from a phantom failure, and it would have read like a product defect.

The stance rewrite removes the keyword rule entirely, so both directions are
gone. Worth noting that reading found the harmless half and only running the
thing found the half that was actively firing.

### The judge cannot see what the caller asked
Found 2026-07-28. `grade.ts:111` filters the transcript to `role === "assistant"`
before judging, so the judge grades the assistant's lines in isolation. That is
right for "did it convey X" and wrong for anything about responsiveness — it
cannot tell that an answer addressed the question actually asked, or that the
assistant answered a question the caller never put. Any future assertion of the
form "answered what was asked" needs the full transcript, and would want the
caller's turns marked so the judge does not grade them.

### Generate scenarios with a context-free agent, once
Out of the assessment above. The 47 existing scenarios were written by an agent
that had just read `session.ts`, so they largely test what the prompt says it
does. Run this instead of, not as, the rejected per-run version:

Give a fresh agent **no access to `session.ts` or to the scenario library** —
only "you are an Australian $trade with twenty years on the tools; list the
phone calls that go wrong, and what a good receptionist should do on each".
Several such agents, one per trade. Then diff what comes back against the
library. **The gap is the finding**, and it is a finding about the prompt's
blind spots, not about any single run. The main agent translates the survivors
into the harness schema without weakening the assertions.

One-off cost, a handful of agent runs. Do it *after* the pass-rate work, so
new scenarios land in a harness whose numbers can be trusted.

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
