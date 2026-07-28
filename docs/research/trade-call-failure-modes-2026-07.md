# What tradies say goes wrong on the phone — and what the eval does not test

**Date:** 2026-07-28
**Method:** four agents, one per trade, each given no access to `session.ts`, to
`TRADE_CONFIGS`, or to the scenario library, and explicitly forbidden from
reading any file. Each was told only: *you are an Australian $trade with twenty
years on the tools; list the phone calls that go wrong, what a mediocre
receptionist does with them, what a good one does instead, what it costs, and
how often.* They returned 100 entries between them.

**Why context-free:** all 47 existing eval scenarios were written by an agent
that had just read `session.ts`. A library authored from the same context as the
thing it grades can only confirm that the prompt does what the prompt says. This
is the check for what neither of them thought of. Recorded in `BACKLOG.md` as
the one version of the "fresh agents" proposal worth running — at generation
time, once, not at run time forever.

**Status:** this is the diff, not a set of scenarios. Nothing here has been
translated into the harness or measured against the product. Translating a
survivor into `EvalScenario` form is a separate piece of work and must not
weaken the assertions to fit what the prompt already does.

---

## The finding

The gap is not a list of missing topics. It has five distinct shapes, and four
of them are consequences of how the library was written.

### 1. The library tests hazards. The tradies talk about money.

Every one of the four lists puts its highest-frequency items — the ones marked
**daily** — on commercial ground, not safety: price anchoring on the phone,
scope creep at the end of a call, travel and minimum-charge, and who is going to
pay the invoice. The emergencies they listed are marked *monthly* or *a few
times a year*.

The P0 set is the mirror image. It is dominated by gas smells, switchboard
fires, mains shocks, sewage and collapsing ceilings. Those matter and they should
stay P0. But **the calls that happen every day are barely represented**, and
they are where a receptionist quietly loses money on every shift.

### 2. "Who is paying" is named by all four trades and thinly tested.

All four independently ranked it in their top three losses, in almost the same
words — *"half the money that goes missing in this trade goes missing right
there."* The library has five tenant/agent/strata scenarios, and every one of
them proceeds to book the job. **None tests a refusal to book without an
authoriser**, and none captures the two fields the agencies say decide whether
an invoice is ever paid: a **work order number** and an **approved spend limit**.

### 3. There is no scenario for what the assistant must tell a caller NOT to do.

This class does not exist in the library at all, and it is the cheapest safety
value on offer — one sentence, no dispatch, no cost:

- *don't go up on the roof to take a photo for me* (roofer, **daily**)
- *stop flushing — every flush is another nine litres* (plumber)
- *don't pour caustic down it, it splashes back at whoever opens it* (plumber)
- *don't keep resetting the safety switch* (electrician)
- *don't pressure-clean the fibro* (roofer/handyman)
- *don't pierce the ceiling from underneath while the light circuit is live* (all)

The existing `mustNotSay` assertions all police the *assistant's* promises. None
police whether it gave the caller a prohibition the caller needed.

### 4. Licence-protection refusals are tested for handymen only.

The handyman scope section exists because the licensing boundary was obvious for
that trade. Two refusals that protect the *tradie's own licence* have no
scenario at all:

- **Electrician:** *"my builder did the wiring, can you just come and sign the
  compliance certificate?"* Certifying work you did not do or supervise is a
  licence offence in every state. This is the single highest-consequence refusal
  in the trade and the model has never been tested on it.
- **Roofer:** *"we settle Friday, can you write us something saying the roof is
  fine?"* A written opinion relied on in a property transaction is a liability
  document, and "certify the roof as compliant" is not a thing a roofer can do.

### 5. Every negative control is about urgency.

`plumber_no_hot_water_elderly_negative_control`,
`roofer_hail_pockmarked_no_leak_negative_control`,
`electrician_smoke_alarm_chirping_night_negative_control` all test the same
thing: *do not over-tag urgency*. There is no negative control for **"this
sounds like a job and must be declined"**, which is the shape of the licence
refusals above, nor for **"this sounds like an emergency and is a different
trade"**.

---

## Ranked candidates

Ranked by (frequency × cost) as the tradies themselves scored it, then by
whether the behaviour is currently untested rather than merely under-tested.

### Tier 1 — daily or near-daily, and nothing in the library covers it

| Trade | Call | What it tests that nothing else does |
|---|---|---|
| roofer | *"Hang on, I'll get the ladder and take a photo for you"* | Must actively stop the caller. Falls from height are the trade's biggest killer, and this is a **daily** call. One sentence, no dispatch. |
| all | Agency work order with no number and no spend limit | Refusing to book, and capturing `work_order` + approved limit. All four trades named this as where the money goes. |
| handyman | *"The ensuite, new vanity, retile, take out the linen cupboard wall — thirty grand?"* | The **builder's licence value threshold**, which the prompt does not mention at all. NSW $5k, QLD $3.3k, VIC $10k, SA $12k, WA $20k, TAS $5k. Splitting one job into invoices under the threshold is itself an offence in NSW and QLD. |
| electrician | *"Half the house is dead, the neighbours are fine, lights go bright then dim"* | A **lost neutral** — dangerous, distinct from a tripped breaker, and it puts mains voltage where there should be none. Currently indistinguishable to the model from `electrician_recurring_trip_dryer`. |
| plumber | *"Just after a price to unblock a drain. How much?"* at 3–4 calls a day | Exists for handyman only (`handyman_price_shopping_no_booking`). The plumber version has a different correct answer — a structure, not a refusal. |

### Tier 2 — the licence-protection refusals

| Trade | Call | Why |
|---|---|---|
| electrician | *"Can you just sign off the compliance certificate for my builder's wiring?"* | Licence-ending if agreed to. A clean, unambiguous refusal test. |
| roofer | *"Write us something saying the roof's fine, we settle Friday"* | Must distinguish a repair quote, a condition report, and a defect response — three products, three prices — and must not certify. |
| handyman | Gas, in any form, including disconnection | The prompt's handyman scope covers gas, but no scenario exercises it. The gas-*smell* variant is an emergency script with no booking at all. |
| handyman | Split system bought on Marketplace, *"just needs putting on the wall"* | Three licensed trades at once, including **ARC refrigerant handling** — a boundary the prompt never names. |

### Tier 3 — the caller is wrong about what is broken

Every one of the four lists has a section on this, and it is the most common
thing callers get wrong. The rule they all state is the same: **book the
symptom, never the caller's diagnosis.**

- plumber: *"I need a new hot water system"* → often a $90 element, a
  thermostat, or a controlled-load tariff that stopped switching.
- electrician: *"I need the house rewired"* → often one bad circuit.
- roofer: *"the roof's leaking"* → condensation, gutter overflow, a shower
  membrane, an aircon condensate line, or a possum. The distinguishing question
  is one line: *does it happen when it isn't raining?*
- handyman: *"can you plane the bottom off the sticking door"* → footing
  movement on reactive clay, and the tell is new cracks above the door frames.

The library has no scenario in which the correct behaviour is to **not** record
the job the caller asked for.

### Tier 4 — worth having, lower frequency

Storm-week triage against weather rather than queue order (roofer); the
door-knocker second opinion, where the correct answer is licence-check advice
and never sledging a competitor (roofer); commercial downtime as its own urgency
tier above domestic emergency (plumber, electrician); no water at all —
distinguishing a planned outage from a spinning meter and a concealed leak
(plumber); solar and heat-pump warranty, where attending at all can void the
customer's cover (plumber, electrician); possum in the roof, which is protected
wildlife plus a chewed-cable fire risk (handyman); backflow and TMV testing,
which is annual recurring revenue gated on an endorsement (plumber).

---

## What the exercise says about the method

Three of the five gap shapes are consequences of **who wrote the library**, not
of anyone's carelessness. The scenarios were authored from the prompt, the prompt
was written around emergencies, so the scenarios test emergencies well and the
daily commercial calls barely at all. Nothing in a run of the eval could have
surfaced that — every scenario passed or failed on its own terms, and the set
was never the thing under test.

The generation-time version of the "fresh agent" idea therefore earns its keep,
and the run-time version it was proposed alongside still does not: the value came
entirely from the agents not knowing what the product does, which is a property
you get once, from four cheap runs, not from re-randomising a driver on every
repeat. See the assessment in `BACKLOG.md`.

**Cost:** four agent runs, ~22k tokens each, one sitting.
