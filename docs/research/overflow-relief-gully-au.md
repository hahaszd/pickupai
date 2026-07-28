# Overflow relief gullies — what an Australian caller should actually be told

Researched 2026-07-28, against water authorities rather than plumbing blogs,
because this text is spoken aloud by the product to someone standing next to
raw sewage.

## The finding

**The eval asserted the opposite of the correct advice, and the prompt had no
rule at all.**

`plumber_sewage_surfacing_shower` required the assistant to have *"told the
caller to leave the overflow relief gully cap in place rather than removing it
themselves"*, on the stated theory that a caller removing the cap "can turn a
manageable overflow into sewage backing up through fixtures inside".

That causal story is backwards.

## What the authorities say

An overflow relief gully (ORG) is a grate outside the house, within the
property boundary, set **lower than the lowest drain inside**. Its entire
purpose is to be the point where a sewer blockage overflows, so that it
overflows *outside* rather than through indoor fixtures.

- **Unitywater** — "In the event of a sewer blockage, the cover of the ORG
  should either pop off or pop upwards to release excess pressure and direct
  sewage away from your home." And, on what to do during an overflow: "If there
  is heavy rain and sewage is starting to overflow inside your house, then
  please check your Overflow Relief Gully to make sure that the grate is loose
  and not blocked."
  <https://www.unitywater.com/check-your-org>
- **Unitywater**, maintenance: the ORG must sit at least 150 mm below the lowest
  household drain, and at least 75 mm above ground level, "so that overflows
  occur at the ORG, rather than inside your home".
- **Sydney Water** — "For your own safety, stay clear of wastewater overflows",
  and householders are told not to attempt to clear blockages themselves but to
  call a licensed plumber or the faults line (13 20 90).
  <https://www.sydneywater.com.au/plumbing-building-developing/plumbing/wastewater-blockages.html>

## What follows for the product

The hazard is **an ORG that has been covered, sealed, paved over or weighed
down** — that is what sends the overflow indoors. It is not a caller who lifts
the grate.

So the advice on a sewage-inside call is:

1. Keep everyone and pets away from the wastewater — health hazard.
2. Stop running taps, flushing, and using the washing machine; everything that
   goes down the drain adds to what comes up.
3. Do not try to clear the blockage.
4. The gully outside needs to be **clear and unobstructed** — check nothing is
   covering or weighing it down, without touching the wastewater.

The old assertion's real danger was that it would have **passed** an assistant
that told the caller to keep the cap firmly in place, which is the harmful
answer, while failing an assistant that gave the correct one.

## Applied in

- `src/realtime/session.ts` — the plumber `emergencySafetyTip`, now branched
  (water escaping / sewage inside / ORG / nothing urgent) instead of a single
  "turn off the mains" line that did not fit a sewage call.
- `src/testing/eval/scenarios/plumber.ts` — `plumber_sewage_surfacing_shower`
  assertions rewritten, plus a `mustNotSay` for the harmful advice.

## Not researched

Whether any state's plumbing regulator forbids a *householder* from lifting an
ORG grate. Nothing found says so, and the authorities describe the grate as
designed to lift on its own, so the prompt tells the caller to check it is
clear rather than to lift it — which is correct under either reading.
