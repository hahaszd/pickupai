# Where the distributor's responsibility ends and the electrician's job begins

Researched 2026-07-28. The question was narrow: when a storm pulls the overhead
service line off a house, is that purely the distributor's problem — in which
case the eval is wrong to demand a full capture including an address — or does
it leave work only a licensed electrician can do?

## The finding

**It leaves work for the electrician.** A downed service line is a lead, not
just a referral.

- The **point of supply / point of attachment** is the changeover point. Beyond
  it, the property owner is responsible for maintenance and repair of the
  installation, including private lines on the property — the consumer mains
  running to the switchboard or meter.
  ([Essential Energy, private poles FAQ](https://www.essentialenergy.com.au/-/media/Project/EssentialEnergy/Website/Files/At-Home/PrivatePolesFAQs.pdf),
  [SA Power Networks service and installation rules](https://www.sapowernetworks.com.au/industry/service-installation-rules/))
- Any work on that owner-side equipment — poles, lines, fittings — **must be
  carried out by a licensed electrical contractor**.
- The distributor **will not reconnect** until a licensed electrician or
  registered electrical contractor issues a Certificate of Electrical Safety.
  ([Energy Safe Victoria, private aerial lines](https://www.energysafe.vic.gov.au/industry-guidance/electrical/installations-and-infrastructure/private-aerial-lines))

## What follows for the product

Two superficially similar calls are commercially opposite:

| Call | Ours? |
|---|---|
| Whole street dark, no breakers tripped | **No.** Distributor's fault, nothing to attend. Refer, take a name and number, do not send anyone. |
| Service line pulled off the house | **Partly.** 000 and the distributor make it safe; the point of attachment to the switchboard is then owner-side work for a licensed electrician. Full details, address included. |

So `electrician_overhead_service_line_down` is right to require `captureTarget:
"complete"`. Do not resolve its failures by weakening the assertion.

## How this was applied, and a failed attempt worth not repeating

The first attempt put the distinction in the global
`# When the Job Belongs to Someone Else` section as a general category — "some
jobs are only partly someone else's". It fixed nothing and broke two neighbours:
`electrician_whole_street_blackout` went 3/3 → 1/3, and a plumbing referral
about a water-authority leak started being classified as `new_job`, which would
have SMSed the owner about a job that does not exist.

Teaching a *category* let the model apply it to calls the category was never
about. The same fact now lives in the electrician's `TRADE_CONFIGS` entry, on
the fallen-wiring branch, where it cannot reach a plumber's call at all.
