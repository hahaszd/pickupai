# What four tradies said goes wrong on the phone — the source material

**Date:** 2026-07-28. **Method:** four agents, one per trade, each denied
`session.ts`, `TRADE_CONFIGS` and the scenario library, and forbidden from
reading any file. Each was told only: *you are an Australian $trade with twenty
years on the tools; list the phone calls that go wrong, what a mediocre
receptionist does with them, what a good one does instead, what it costs, and
how often.* They returned roughly 100 entries.

**Why this file exists.** The gap analysis in
[`trade-call-failure-modes-2026-07.md`](trade-call-failure-modes-2026-07.md) was
written from these outputs and the outputs themselves were **not saved** — they
lived only in a chat transcript. A reviewer later caught a scenario proposal
citing that analysis for figures it does not contain ("worth 10x a domestic
call", "highest-conversion call in the survey"). The figures were real and came
from here; the citation was to the wrong document, because the right one did not
exist. **A summary that discards its source cannot be checked, and the numbers
in it get read back as measured facts three months later.**

Everything below is the tradies' own framing, including their frequency and cost
estimates. **Those are their judgement, not measurements** — treat them as the
opinion of a practitioner, which is what they are and what makes them useful.

---

## The claims that were mis-cited, recorded here properly

- **Door-knocker second opinion (roofer).** *"Handled well this is one of the
  highest-conversion calls there is, because I've just been the honest one."*
  Frequency: weekly for a month or two after a hailstorm, otherwise monthly.
  Cost if mishandled: the customer pays a $5–15k deposit to someone who
  disappears, and the local trade wears the reputation.
- **Commercial downtime (plumber).** *"Commercial customers are worth ten
  domestic ones."* Cost: *"A café doing $4,000 a day that loses a day blames
  you."* Frequency: monthly.
- **No water at all (plumber).** *"A spinning meter on a concealed leak that
  isn't flagged as urgent is a $1,500 water bill the customer will hold against
  you."* Frequency: monthly.

---

## The recurring rules the tradies stated for themselves

Each list ended with the tradie's own summary. They arrived at these
independently, which is what makes the overlap worth noting.

**Plumber and roofer both:** never quote, never promise a date, never promise
who pays — over the phone, sight unseen.

**Roofer:** *"Always give the safety instruction, even if we don't get the job —
power off for water near lights, out from under a sagging ceiling, off the
ladder, don't disturb the fibro, don't touch the solar. It costs nothing and
it's the part that actually matters."*

**Roofer:** *"Always establish who is paying before anything gets booked —
owner, tenant, agent, strata, or insurer. Half the money that goes missing in
this trade goes missing right there."*

**Electrician:** *"Safety instruction before booking. Never quote, never promise
a date, never promise who pays. Get the mobile and the address in the first
thirty seconds — every other detail can be chased. A dropped call with no number
is a job that never existed."*

**Handyman:** *"Never say yes to anything with a licence, a certificate, or a
metre-count attached… Nobody ever lost a customer to that sentence."* And:
*"Every call captures suburb, mobile, and whether it's a rental — before the job
description. Those three fields decide whether the job is viable, who pays, and
whether we're even allowed to go."*

---

## Frequency, as the tradies scored it

The ranking in the gap analysis is *(frequency × cost)* **as stated by them**.
The daily items, which is the part that surprised the analysis:

| Trade | Called **daily** |
|---|---|
| Plumber | price shoppers ("3–4 calls a day"); callers wanting free DIY advice; the caller being wrong about what is broken |
| Electrician | price shoppers; the caller being wrong about what is broken ("several times a week") |
| Roofer | *"I'll just go up and take a photo for you"*; free quotes for small jobs far away; the caller being wrong about what is leaking (*"the single most common thing callers are wrong about"*) |
| Handyman | the fourth job added at the end of the call (*"the highest-dollar-volume failure on the list"*); ballpark price requests; single tiny jobs; callers who won't give an address |

**Every emergency they listed was marked *monthly* or *a few times a year*.**
That inversion — the dangerous calls are rare, the expensive ones are daily — is
the finding the gap analysis was built on, and it is why the P0 set was
originally the mirror image of the business.

---

## What is NOT in this file

The full ~100 entries, each with situation / what_goes_wrong / right_handling /
cost_if_mishandled / frequency. They ran to roughly 22,000 tokens per trade and
were not captured before the transcript moved on. What survives is this file and
the gap analysis.

**If the exercise is repeated — and the gap analysis recommends it for scenario
generation — write the raw agent output to disk in the same turn it arrives.**
That is the whole lesson here, and it cost a fabricated citation to learn.
