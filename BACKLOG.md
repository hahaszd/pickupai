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
`npm run eval:p0`, concurrency 4. Three full runs were needed to get here, and
only the last one is a measurement of the product:

| Run | Result | What it measured |
|---|---|---|
| 1 | 14 pass / 2 defect / 5 marginal | Mostly the judge. One "defect" was a backwards assertion, one was a compound assertion the judge could not answer. |
| 2 | 11 / 1 / 9 | The three-stance judge's own blind spot — informational assertions had no valid answer. |
| 3 | 13 pass / 0 defect / 8 marginal | The product. |
| 4 | 16 pass / 0 defect / 5 marginal | The product, after the emergency-intake fixes below. |
| 5 | 14 / 1 / 6 | A prompt self-contradiction shipped between runs 4 and 5, never gate-tested. |
| 6 | 13 / 1 / 7 | Mostly the harness: five reds were the turn cap, not the product. |
| 7 | 15 / 1 / 5 | The product, once the turn budget stopped charging for `save_lead`. |
| 8 | **16 pass / 0 defect / 5 marginal** | The product, after the `urgency_level` fix. Best measured state. |

**Current: 16/21 passed all three runs, nothing failed all three, 5 marginal.**
electrician 3/5 · handyman 4/4 · plumber 6/7 · roofer 3/5. **The P0 gate is
green.**

**Read the run-level rate, not just the headline.** Failed *runs* went
13/63 → 14/63 → 10/63 → 5/63 → 12/63 → 10/63 → 9/63 → **6/63**, while the
headline went 14 → 11 → 13 → 16 → 14 → 13 → 15 → 16. The headline counts
scenarios that were perfect, so it swings on how failures are distributed as much
as on how many there are. Quote both. Runs 5–8 are the clearest case yet: the
headline fell from 16 to 13 and then climbed back to 16, and almost none of that
movement was the product getting worse and better — a prompt contradiction and a
measurement defect entered and left.

**Marginal at run 8 — passed some runs, failed others. Not defects, not passes:**

| Scenario | Rate | What flapped |
|---|---|---|
| `plumber_gas_smell_hot_water_unit` | 2/3 | One run captured nothing |
| `electrician_whole_street_blackout` | 2/3 | One run gave excellent service and never asked for a number |
| `electrician_overhead_service_line_down` | 1/3 | Name and phone dropped on the emergency — see WATCH below |
| `roofer_allianz_storm_claim_ridge_capping` | 2/3 | One run never took the name |
| `roofer_hail_pockmarked_no_leak_negative_control` | 2/3 | One run answered `routine` where the rubric says `urgent` |

Telling the tail of ordinary sampling from a behaviour that is usually wrong
needs a higher `--repeat`, not more staring at n=3. The one that has earned it is
`electrician_overhead_service_line_down`.

### Urgent calls end without details — transcripts read 2026-07-28
Six of the eight marginals were the same failure: **name, phone or address
missing on a call the assistant correctly treated as serious.** Transcripts read
rather than guessed at. It was **two** mechanisms, not one, and the hypothesis
in the first draft of this item was only half right.

**(a) The evacuation exception applied to people who are not evacuating.** On
`electrician_overhead_service_line_down` the caller — standing in their own
driveway, chatting calmly — *asked to swap numbers* and was refused:

> **caller:** Thanks for the advice! Can I just grab your number before I go?
> **assistant:** Absolutely — Eval Trade Co's number is the one you've called
> today. Please prioritise getting well clear and calling 000 now.

and then wrote into the lead: *"No name or callback number collected because
immediate safety takes priority."* Confirmed.

**(b) The address gets dropped in the wrap-up.** On
`electrician_mains_shock_washing_machine` the assistant took name and phone,
gave correct safety advice, and closed the call itself without ever asking where
the property is. Not the caller hanging up — its own choice.

Fixed by narrowing the exception in `# Life-Threatening Emergencies` to callers
who must move *right now*, forbidding it to refuse details a caller is offering,
and telling it to ask for the address in the same breath as the number.
`electrician_mains_shock_washing_machine` 1/3 → 3/3;
`electrician_switchboard_crackling_hot_smell` stayed 3/3, so the evacuation case
did not regress.

**`plumber_gas_smell_hot_water_unit` did not reproduce** — 3/3 on re-run. Its
marginal in the baseline was noise at n=3. Recorded because a marginal that
vanishes is as much a result as one that persists.

### FIXED: `urgency_level` was used as an emergency flag, not as a classification
Found 2026-07-28, once the turn-cap noise below stopped hiding it. It was the
only defect left in the gate: `roofer_reroof_quote_followup_terrigal` failed
3/3, and the transcripts are otherwise exemplary — name, phone, address, issue
summary, a corrected job location, a clean `end_call()`. The single miss is that
`urgency_level` is never set at all.

**Across every failing transcript in that run, `urgency_level` appears 10 times
and is `"emergency"` all 10.** Not once `"urgent"`, not once `"routine"`. The
rubric in `session.ts` spends most of its words distinguishing those two, and
the model appears to use neither: it treats the field as a flag to raise when
something is on fire and omits it otherwise.

*Sampling caveat, because the number invites over-reading:* `--verbose` prints
only failing runs, so this is a failure-biased sample. Passing `complete`-target
scenarios must contain non-emergency values. The safe claim is the narrow one —
**in the runs that failed, the field was absent or `"emergency"`, never the two
levels in between** — and that is enough, because `urgency_level` is one of the
five `CORE_FIELDS` in `evaluateCaptureQuality()`, so omitting it downgrades an
otherwise perfect capture to `pass_degraded` and reaches the owner as a lead
with nothing to sort on.

Fixed by adding one rule to the rubric: every `save_lead` sets one of the three,
`"routine"` is a real answer rather than the value you leave off.

**Confirmed in the data, not just the score.** Same failure-biased sample, run 8:
`urgency_level` now appears as `routine` ×10, `urgent` ×1, `emergency` ×3, where
run 7 was `emergency` ×10 and nothing else. `roofer_reroof_quote_followup_terrigal`
3/3 defect → 3/3 pass. It cost one new marginal —
`roofer_hail_pockmarked_no_leak_negative_control` answered `routine` on one run
of three where the scenario wants `urgent` — which is the model now exercising a
judgement it previously declined to make, and the rubric agrees with the
scenario: *"storm damage with no water coming in yet"* is listed under `urgent`.

### FIXED: the eval billed the assistant a turn for every silent save_lead
Found 2026-07-28 by reading the transcripts behind five reds rather than the
summary line above them, and it is the largest measurement error found so far.

Every failure reading *"neither end_call nor a caller hangup — the line would
stay open"* had stopped at **exactly 14 chat iterations**, which is
`MAX_TURNS` in `runner.ts`. The assistant had not left the line open; it was
never given the turn in which it would have closed the call.

**The mechanism is worse than a cap being too low.** `turnCount` incremented
once per `chat()` call, and a `save_lead` with no accompanying speech is its own
`chat()` call (`runner.ts:286` — a tool-only turn `continue`s). The prompt's
Conversation Flow tells the assistant to save *progressively*. So the budget was
being spent on tool calls the caller never hears, and **the calls that followed
the instruction most diligently ran out of turns first.** Long scenarios paid
twice: `roofer_allianz_storm_claim_ridge_capping` reached the cap after 8 caller
turns, having spent 7 iterations on saves.

What it cost, measured: five reds across three trades in one gate run — and one
of them, `handyman_multi_job_call_with_late_addition` at 3/3, was reported as the
**only defect in the run**. Roofer read 2/5 in a report where nothing about
roofing had changed.

Fixed by counting only turns the caller can hear, with `MAX_ITERATIONS` (3×) as
a separate runaway guard, and by giving the grader a distinct verdict —
`hitTurnCap` now reads *"hit the harness turn cap (N turns) … inconclusive, not
a line left open"*. Pinned in `tests/eval-grade.test.ts`, the first unit test the
grader has had.

**The general lesson, and it is the third instance today.** Every eval defect so
far has been a *measurement* defect first: the judge with no room for a
prohibition, the judge with no room for a fact, and now a turn budget spent on
the model's own bookkeeping. All three read as confident product reds. The
harness is younger and less exercised than the prompt it grades, so on any
disagreement between them, **the harness is the more likely suspect** — read the
transcript before believing the summary.

### FIXED: the prompt said a downed power line was, and was not, someone else's job
Found 2026-07-28 by the first full `eval:p0` run after the three prompt edits of
that sitting — exactly the run the method note below says to do, and it earned
its cost immediately. `electrician_whole_street_blackout` had gone 3/3 → **0/3**
and `electrician_overhead_service_line_down` 3/3 → **1/3**, both regressed by the
commit that fixed the plumber referral.

**Two commits hours apart wrote opposite rules into two different sections.**
`425de80` listed *"a downed overhead line is a 000 call and the distributor's
asset"* among the examples in `# When the Job Belongs to Someone Else`.
`e5e12dd` then wrote, in the intent list, *"a line pulled off the house … that
is a real new_job, not this"*. Both shipped. The model resolved the conflict by
following the nearer, more concrete example, tagged `referred_out`, and closed
the call — in one transcript it said *"once it's made safe, a licensed
electrician can repair the property-side damage"* and then filed the call as
nobody's job in the same breath.

The researched position (below) says the second rule is the correct one. Fixed
by deleting the downed-line example and stating the carve-out where the wrong
example used to be: someone else making a hazard safe first does not make the
damage they leave behind someone else's job. `overhead_service_line_down` 1/3 →
**3/3**, `switchboard_crackling_hot_smell` and `mains_shock_washing_machine`
stayed 3/3.

**The general lesson is not "check for contradictions".** Neither edit was wrong
in isolation and each was verified against three scenarios. A prompt has no
compiler and no import graph, so two sections can disagree indefinitely without
anything failing to build — the only thing that finds it is running the whole
library after every edit, and the only thing that makes it *readable* once found
is the model's own transcript, where it stated the correct rule and then applied
the wrong one.

### DECIDED: a street-wide outage is `referred_out`, and the owner's phone stays quiet
Decided 2026-07-28 while resolving the regression above.
`electrician_whole_street_blackout` asserted `intent: "new_job"` and
`shouldSendOwnerSms: true`, which was the only thing it *could* assert when it
was written — `referred_out` did not exist, so demanding an SMS was the only way
to demand that the lead be kept at all. Once the intent existed the scenario and
the prompt were asserting opposite things, and the eval was reporting the
prompt's correct behaviour as a release-blocking defect.

The scenario now asserts `referred_out` and no owner SMS. **`mustCapture` is
unchanged**, so it still demands the phone number and the issue summary: this
asserts strictly more than before — the same capture, plus the right intent —
which is what distinguishes it from loosening an assertion to make a test pass.
The behaviour it pins: details captured, lead on the dashboard, no 2am SMS for a
grid fault nobody can attend. That matches the existing treatment of every other
non-job intent.

### FIXED at n=9: `electrician_overhead_service_line_down` 5/9 → 9/9, and the mechanism was passivity
Ran at `--repeat 9` on 2026-07-28, which is what the earlier WATCH note asked
for. **5/9 passed.** Not a defect that fires reliably, not sampling noise — a
coin toss, and the largest single-scenario weakness left in the P0 set.

n=9 also sharpens the failure signature that n=3 could not resolve. It does not
flap randomly across fields: **the name is missing 4 times, the phone 2, the
address 1.** Reading the failing transcripts explains why, and it is not the
hypothesis this item carried before.

**The intent classification is now correct** — `new_job` in every run, so the
contradiction fix below holds — and the safety advice is correct every time.
What fails is that **the intake never starts**. The assistant is reactive on
this call: each turn it repeats "stay well clear, ring 000, contact the
distributor" and asks a safety question back ("are you safely away now?"), and a
caller who is frightened and full of questions always supplies another one. There
is never a turn in which the assistant initiates.

Two transcripts make it unarguable. In one, the caller *volunteered* the suburb
and then *offered* their mobile — "Should I give you my mobile too?" — and the
assistant took the number and still never asked the name. In another, the caller
drove the whole call to "what's the distributor's number", got Ausgrid 13 13 88,
thanked Olivia and hung up, with nothing captured at all.

So the rule added on 2026-07-28 — *"ask for the address in the same breath as
the number"* — was aimed at the right problem and lands one step too late. It
governs an intake that has begun. Nothing tells the assistant to **begin** one
while it is still giving safety instructions, and `session.ts:750` states the
permission ("those callers can give you a name, number and address in three
quick questions") as a fact rather than as something to do.

This is the same open question recorded further down as *"Decide: should a
life-safety call still capture a callback number?"*, and this measurement is the
argument for the middle path: not holding the caller, but putting the first
intake question in the same breath as the safety instruction.

**The scenario is right to demand the address**, checked rather than assumed:
everything from the point of attachment to the switchboard is the property
owner's, only a licensed electrician may work on it, and the distributor will
not reconnect until a licensed electrician issues a certificate. A line pulled
off the house therefore leaves real owner-side work — this is a lead, not just a
referral, and it needs an address. Sources: Essential Energy private-poles FAQ,
Energy Safe Victoria private aerial lines, SA Power Networks service rules.
**Do not "fix" this by loosening the assertion to `degraded`.**

### FIXED: `plumber_water_bubbling_nature_strip_referred_out` — 0/3 → 3/3
The assistant classified a water-authority leak as `new_job`, so the owner got
an SMS about a job that does not exist. Pre-existing — it was on the previous
session's failure list, before any of today's prompt work.

Fixed in `e5e12dd` by adding a `referred_out` intent, because the taxonomy had
no value the model could have picked: `wrong_number` means the caller wanted a
different business, and this caller rang the right plumber. Measured 3/3 in a
targeted run at `--repeat 3`. It is a P1 scenario, so it is **not** in the
`eval:p0` gate and the fix has never been measured alongside the full library.

### Method note: a prompt edit is global, so measure it globally
Three prompt edits were made in this sitting, each verified against three
scenarios at `--repeat 3`. The second one — a general "some jobs are only
partly someone else's" paragraph — fixed nothing and broke two neighbours:
`electrician_whole_street_blackout` went 3/3 → 1/3 and
`plumber_water_bubbling_nature_strip_referred_out` started classifying a
referral as a job. It was caught only because neighbouring scenarios happened to
be in the same verification batch.

The general framing was the problem: it taught a *category* ("partly someone
else's") that the model then applied to pure referrals. Reverted, and the same
fact was put in the electrician's trade config where it cannot reach a plumber's
call. **Trade-specific knowledge belongs in `TRADE_CONFIGS`, not in a global
section**, and any prompt edit needs a full `eval:p0` before it is believed.

### DECIDED: a referred-out call still leaves a phone number
Promoted from P2 on 2026-07-28 because it was the only thing failing the P0
gate, decided by the user the same day: **take the number.** Implemented as a
new `# When the Job Belongs to Someone Else` section in `session.ts`, placed
directly under Life-Threatening Emergencies so the evacuation exception visibly
outranks it. `electrician_whole_street_blackout` went 0/3 → 3/3.

**Correct the record while you are here.** The previous session recorded this
as the prompt contradicting itself, citing `session.ts:103`'s *"ALWAYS collect
the caller's details regardless"*. That line lives inside the **Service Area**
section, which is only emitted when the tenant has a `service_area` configured
— and the eval tenant's is `null`, so the rule was never in the prompt being
tested. There was no contradiction to resolve; there was simply no rule. A
citation to a line number is not a citation to a rule that was in force.

In `electrician_whole_street_blackout` and `electrician_overhead_service_line_down`
the assistant reasons **correctly** — a whole street being dark is the
distributor's problem, a downed service line is a 000 call — and then ends
without taking a number. Measured 3/3 on the blackout scenario: no phone, no
usable capture at all.

`session.ts:103` says the opposite: *"ALWAYS collect the caller's details
regardless — never turn a caller away without taking their information."* The
prompt's own rule and the assistant's judgement disagree, and both positions
are defensible: today's outage caller may have a real job next week, against a
lead with no job attached being noise the owner learns to ignore.

**Recommendation: take the number.** A referred-out caller has just been given
something useful for free by a business they had never rung before, which is the
cheapest goodwill this product will ever buy, and one line — "I'll grab your
number in case you need us once the power's back" — costs the caller nothing.
The noise argument is weaker than it looks, because these calls are rare and
`shouldSendOwnerSms` already suppresses the SMS on a non-job intent.

Whichever way it goes, make the prompt and the eval agree afterwards. If the
answer is "take it", the fix is in the prompt, not the scenario.

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

**Third round of the same bug, in the fix itself.** The stance vocabulary
shipped with only the three *action* stances, and informational requirements had
nowhere to land. `handyman_garage_power_points_plus_sliding_door` asserts *"told
the caller that adding power points requires a licensed electrician"* — a fact.
The sentence that conveys it correctly also declines the work, so the judge
answered `DISCOURAGED`, and a working P0 licensing boundary was reported as a
3/3 release-blocking defect. Added `STATED`; `mustSay` now passes on `DIRECTED`
or `STATED`. Same prompt, 3/3 green. **Widening a judge's answer format tends to
reveal the next class it has no room for — re-run and read before believing the
new numbers either.**

**Second defect of the same family, found because the stance made it visible:**
four scenarios carried a `mustSay` that mixed an instruction with a prohibition
— *"report it to the distributor **rather than booking an electrician**"*. The
judge returns one stance per item, so it read the prohibition half, answered
`DISCOURAGED`, and scored correct transcripts as failures. One of those phantom
reds was counted as a release-blocking P0 defect in the baseline above. All four
are split into a `mustSay` plus a `mustNotSay`, which asserts strictly more than
before, and the rule is written into `docs/eval.md`.

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
