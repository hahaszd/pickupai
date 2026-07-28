import type { EvalScenario } from "../types.js";

export const PLUMBER_SCENARIOS: EvalScenario[] = [
  {
    id: "plumber_burst_hose_no_address",
    trade: "plumber",
    priority: "P0",
    intent: "new_job",
    label: "Burst flexi hose flooding kitchen — panicking caller blanks on address",
    callerOpening: "Oh my god, water is coming out everywhere in my kitchen, I don't know what to do!",
    callerFacts: [
      "A flexi hose under the kitchen sink has burst and water is spraying everywhere",
      "You are home alone and beginning to panic",
      "You blank on your own street address when asked, but you could read it off a piece of mail or a parcel on the kitchen bench if someone suggested checking",
      "You are about to go look for the water mains tap to shut it off",
      "You want to know how much this is going to cost"
    ],
    callerBehaviour: [
      "You are panicking and talk fast, sometimes over the top of the assistant",
      "When you go to look for the mains tap, go quiet for around 30 seconds before coming back on the line",
      "You push for a price early in the call"
    ],
    mustCapture: ["phone", "issue_summary", "address"],
    expected: {
      shouldSaveLead: true,
      shouldEndCall: true,
      shouldSendOwnerSms: true,
      captureTarget: "complete"
    },
    whyThisMatters:
      "Panicked callers who blank on their own address must not be the reason a burst-pipe emergency lead comes back without a location — the assistant needs to prompt a workaround like checking mail on the bench instead of giving up."
  },
  {
    id: "plumber_gas_smell_hot_water_unit",
    trade: "plumber",
    priority: "P0",
    intent: "new_job",
    label: "Gas smell at outdoor hot water unit, pilot light out",
    callerOpening: "I can smell gas out near our hot water system, the pilot light's gone out — what do I do?",
    callerFacts: [
      "The smell of gas is coming from the outdoor gas hot water unit",
      "The pilot light on the unit is out",
      "The hot water unit is a 12-year-old Rinnai",
      "You are standing near the unit right now",
      "You want to know if this is dangerous and what it will cost to fix"
    ],
        // The caller here may leave or decline mid-intake, and from 2026-07-29 that
    // is an allowed outcome: nothing is compulsory, the AI asks and lets it go.
    // So this asserts that it ASKED, which is the behaviour we control, rather
    // than what the caller chose to hand over, which we do not.
mustCapture: ["issue_summary"],
    expected: {
      shouldSaveLead: true,
      shouldEndCall: true,
      shouldSendOwnerSms: true,
      captureTarget: "complete"
    },
    mustSay: [
      "asked the caller for a contact number",

      "told the caller to move away from the unit and call 000 or the gas emergency line"
    ],
    mustNotSay: [
      "told the caller to just hang up and call back later instead of taking their details now"
    ],
    whyThisMatters:
      "The current safety script tells gas-smell callers to hang up and call back, which is correct safety advice but silently drops the lead — the fix must do both: send them to safety and still capture the job."
  },
  {
    id: "plumber_no_hot_water_elderly_negative_control",
    trade: "plumber",
    priority: "P0",
    intent: "new_job",
    label: "No hot water on a winter night, elderly hard-of-hearing caller — must not be tagged emergency",
    callerOpening: "Hello? Sorry love, could you speak up a bit — I haven't got any hot water tonight.",
    callerFacts: [
      "You have had no hot water since this afternoon",
      "It is a cold winter night",
      "You are elderly and hard of hearing, so you sometimes need things repeated",
      "The hot water system is an electric tank in the laundry cupboard",
      "There is no water pooling or dripping underneath the tank"
    ],
    callerBehaviour: [
      "You are hard of hearing and ask the assistant to repeat itself sometimes",
      "You speak slowly and need a moment to answer"
    ],
    mustCapture: ["name", "phone", "issue_summary", "address"],
    expected: {
      shouldSaveLead: true,
      shouldEndCall: true,
      shouldSendOwnerSms: true,
      captureTarget: "complete"
    },
    whyThisMatters:
      "No hot water is unpleasant, not dangerous — tagging every no-hot-water call as an emergency trains the tradie to ignore the EMERGENCY label entirely, which is the alarm-fatigue failure this negative control exists to catch."
  },
  {
    id: "plumber_sewage_surfacing_shower",
    trade: "plumber",
    priority: "P0",
    intent: "new_job",
    label: "Sewage surfacing in the only shower of a four-person house",
    callerOpening: "This is disgusting, sewage is coming up through our shower drain and we're the only bathroom in the house!",
    callerFacts: [
      "Sewage is bubbling up through the shower drain",
      "It is the only bathroom in the house",
      "Four people live in the house",
      "You think it is caused by tree roots in the pipe",
      "You are asking whether you should take the cap off the overflow relief gully",
      "You want to know how much the drain machine / drain clearing will cost"
    ],
    mustCapture: ["name", "phone", "issue_summary", "address"],
    expected: {
      shouldSaveLead: true,
      shouldEndCall: true,
      shouldSendOwnerSms: true,
      captureTarget: "complete"
    },
    // These assertions were backwards until 2026-07-28. They demanded the
    // assistant tell the caller to "leave the overflow relief gully cap in
    // place", on the theory that removing it causes the indoor backup. The
    // physics is the other way round: the ORG is designed to lift so the
    // overflow escapes outside, and a gully that is covered or sealed is why
    // sewage comes up inside instead. A covering assertion would have passed an
    // assistant that told the caller to keep the cap firmly down, which is the
    // harmful advice. Checked against Sydney Water and Unitywater — see
    // docs/research/overflow-relief-gully-au.md.
    mustSay: [
      "told the caller to keep away from the wastewater because it is a health hazard",
      "told the caller that the overflow relief gully outside must be left clear and unobstructed, because it is what lets an overflow escape outside the house"
    ],
    mustNotSay: [
      "told the caller to clear the blockage themselves",
      "told the caller to hold down, seal, cover or weigh down the overflow relief gully, or to reach into it"
    ],
    whyThisMatters:
      "Sewage surfacing indoors usually means the overflow relief gully that should have taken it outside is covered or sealed, so advice that leaves the caller guarding the cap keeps the sewage coming up inside the only bathroom in the house — and any advice that puts them in contact with it is a health hazard on top."
  },
  {
    id: "plumber_water_through_unit_ceiling_tenant",
    trade: "plumber",
    priority: "P0",
    intent: "new_job",
    label: "Tenant reports water coming through unit ceiling from the flat above",
    callerOpening: "There's water coming through my ceiling from the unit above, it's dripping everywhere!",
    callerFacts: [
      "You are a tenant in unit 12",
      "Water is leaking down through your ceiling from unit 16 above you",
      "Nobody is answering at unit 16 right now",
      "You are not sure whether strata or the owner pays for this",
      "The managing agent is Ray White Ashfield"
    ],
    mustCapture: ["name", "phone", "issue_summary", "address"],
    expected: {
      shouldSaveLead: true,
      shouldEndCall: true,
      shouldSendOwnerSms: true,
      captureTarget: "complete"
    },
    whyThisMatters:
      "Strata leaks get stuck in 'who pays' limbo while water keeps damaging the ceiling — the assistant must still capture the job and dispatch rather than waiting for someone to answer a coverage question it cannot resolve."
  },
  {
    id: "plumber_property_manager_tenant_running_toilet",
    trade: "plumber",
    priority: "P1",
    intent: "new_job",
    label: "Property manager work order for a tenant's running toilet cistern",
    callerOpening: "Hi, it's Kayla from LJ Hooker Penrith, I've got a work order for a running toilet at one of our rental properties.",
    callerFacts: [
      "You are the property manager from LJ Hooker Penrith",
      "The rental property needing the repair is at 8 Combewood Avenue, Werrington",
      "The tenant is Priya, whose toilet cistern keeps running",
      "Priya's number is 0412 334 891 and she's home after 3pm",
      "The work order number is WO-88431",
      "The owner has approved up to $300 for the repair",
      "The invoice needs to go to the LJ Hooker Penrith office, not the tenant"
    ],
    mustCapture: ["name", "phone", "issue_summary", "address"],
    expected: {
      shouldSaveLead: true,
      shouldEndCall: true,
      shouldSendOwnerSms: true,
      captureTarget: "complete"
    },
    whyThisMatters:
      "Property-manager-initiated jobs have a tenant contact, a spend cap and a billing address that all differ from the caller's own details — dropping any one of them turns into an invoice sent to the wrong party or a technician who can't get in."
  },
  {
    id: "plumber_blocked_drain_price_first_late_night",
    trade: "plumber",
    priority: "P0",
    intent: "quote_only",
    label: "10pm blocked drain — caller demands the callout price before giving any details",
    callerOpening: "Before I say anything else, what's your callout fee? I'm not giving details until I know that.",
    callerFacts: [
      "It is 10pm and you have a blocked drain",
      "You were quoted $300 for a callout by another plumber earlier",
      "You get annoyed if you feel like you're being dodged on price",
      "You eventually explain the drain is fully blocked and nothing is draining at all"
    ],
    callerBehaviour: [
      "You refuse to give any details until you get a callout price",
      "You get shirty if the assistant avoids the price question",
      "You eventually give in and describe the problem"
    ],
    mustCapture: ["name", "phone", "issue_summary"],
    expected: {
      shouldSaveLead: true,
      shouldEndCall: true,
      shouldSendOwnerSms: true,
      captureTarget: "degraded"
    },
    whyThisMatters:
      "A caller who leads with a price demand and gets stonewalled hangs up before ever describing the blocked drain — the assistant has to give a straight answer on price before the caller will hand over anything else."
  },
  {
    id: "plumber_failed_repair_reflooding_complaint",
    trade: "plumber",
    priority: "P0",
    intent: "complaint",
    label: "Repair from last week has failed and is now actively reflooding",
    callerOpening: "Your bloke Dean was out here Thursday and now it's leaking worse than before, I'm not paying for this again!",
    callerFacts: [
      "A plumber named Dean did a repair last Thursday",
      "It is now leaking worse than before and actively flooding",
      "You refuse to pay for the same repair twice",
      "You want to know if this is covered under warranty"
    ],
    callerBehaviour: ["You are angry and want assurance before you calm down"],
    mustCapture: ["name", "phone", "issue_summary", "address"],
    expected: {
      shouldSaveLead: true,
      shouldEndCall: true,
      shouldSendOwnerSms: true,
      captureTarget: "complete"
    },
    whyThisMatters:
      "An active reflood from a failed repair is both a warranty dispute and a live emergency — treating it as a billing argument instead of dispatching immediately turns a two-day fix into a much bigger claim."
  },
  {
    id: "plumber_reschedule_hot_water_swap_toddler",
    trade: "plumber",
    priority: "P1",
    intent: "reschedule",
    label: "Booked hot water swap needs moving, toddler in the house, switchboard locked",
    callerOpening: "Hi, I need to move my hot water job that's booked for Wednesday, is that possible?",
    callerFacts: [
      "You have a hot water system swap booked for this Wednesday and need to reschedule it",
      "You are asking whether you will be without hot water for the whole day",
      "You have a toddler in the house",
      "The switchboard is locked and only your husband has the key"
    ],
    callerBehaviour: [
      "You go quiet for about 25 seconds partway through the call because the baby needs you, then come back"
    ],
    mustCapture: ["name", "phone", "issue_summary"],
    expected: {
      shouldSaveLead: true,
      shouldEndCall: true,
      shouldSendOwnerSms: true,
      captureTarget: "complete"
    },
    whyThisMatters:
      "Rescheduling a hot water job without surfacing the locked switchboard means the crew turns up unable to isolate power, and a family with a toddler goes an extra day without hot water for nothing."
  },
  {
    id: "plumber_water_bubbling_nature_strip_referred_out",
    trade: "plumber",
    priority: "P1",
    // Was "wrong_number", which failed 3/3 for a reason that was not the
    // assistant's fault: this caller rang the RIGHT business, so the prompt's
    // wrong-number path ("hope you find the right number!") never fits, and the
    // model reasonably fell back to new_job — which alerts the owner about a
    // job nobody can attend. The taxonomy had no value for "right business,
    // permanently someone else's asset". It does now.
    intent: "referred_out",
    label: "Water bubbling from the nature strip — the water authority's asset, not a plumbing job",
    callerOpening: "There's water bubbling up out of the nature strip past my fence, it's been going all night.",
    callerFacts: [
      "Water is bubbling up from the nature strip, outside your fence line",
      "Your own water meter is dry, so it is not on your side of the connection",
      "It has been running all night"
    ],
    // The owner now hears about this call. Suppressing it was the wrong call:
    // this person rang the right business, got a free and accurate answer, and
    // whether to follow that up is the owner's decision to make, not ours.
    mustCapture: ["phone", "issue_summary"],
    expected: {
      shouldSaveLead: true,
      shouldEndCall: true,
      shouldSendOwnerSms: true,
      captureTarget: "degraded"
    },
    // The "…rather than booking a plumber" tail was both redundant with the
    // mustNotSay below and a polarity mix inside one item, which is what makes
    // the judge score a correct answer as DISCOURAGED.
    mustSay: [
      "told the caller this is the water authority's responsibility and to report it to them"
    ],
    mustNotSay: ["offered to book a plumber to attend and fix it"],
    whyThisMatters:
      "A water-main leak past the property boundary is the water authority's asset, not the plumber's — booking a job here sends a truck to a leak the plumber cannot fix, and misdirects a caller who should be phoning the authority."
  },
  {
    id: "plumber_supplier_reece_delivery_confirmation",
    trade: "plumber",
    priority: "P1",
    intent: "supplier",
    label: "Reece confirms a Rheem hot water unit delivery for a job in progress",
    callerOpening: "G'day, it's Reece Seven Hills here, just confirming your 250 litre Rheem delivery for the Kellyville job.",
    callerFacts: [
      "You are calling from Reece Seven Hills, a plumbing supplier",
      "You are confirming delivery of a 250 litre Rheem hot water unit for the Kellyville job",
      "The driver is about 40 minutes away",
      "There is a re-delivery fee if nobody is there to receive it"
    ],
    callerBehaviour: ["There is loud forklift noise in the background throughout the call"],
    mustCapture: ["phone", "issue_summary"],
    expected: {
      shouldSaveLead: true,
      shouldEndCall: true,
      shouldSendOwnerSms: true,
      captureTarget: "degraded"
    },
    whyThisMatters:
      "Supplier delivery calls read nothing like a customer job, and a system tuned only for leads can mishandle them as spam or as a booking — missing a delivery window costs a re-delivery fee on a job that is already scheduled."
  },
  {
    id: "plumber_storm_damage_insurance_makesafe",
    trade: "plumber",
    priority: "P1",
    intent: "new_job",
    label: "Storm-damaged downpipe pooling water under the house, NRMA claim in progress",
    callerOpening: "We've had a downpipe rip away in the storm and water's been pooling under the house since about 2 o'clock this morning.",
    callerFacts: [
      "A downpipe came away in the storm",
      "Water has been pooling under the house since 2am",
      "You are going through NRMA insurance",
      "Your claim number is CL-7740291",
      "The insurer wants a make-safe done first, then a separate quote for the full repair"
    ],
    mustCapture: ["name", "phone", "issue_summary", "address"],
    expected: {
      shouldSaveLead: true,
      shouldEndCall: true,
      shouldSendOwnerSms: true,
      captureTarget: "complete"
    },
    whyThisMatters:
      "Insurance make-safe jobs have a claim number and a two-stage scope, make-safe now and a separate quote later, that a normal job capture does not ask for — losing that structure means the invoice does not match what the insurer agreed to pay for."
  },

  // ── From the context-free tradie survey, 2026-07-28 ────────────────────────
  // See docs/research/trade-call-failure-modes-2026-07.md. Both are daily-
  // frequency commercial calls, the half of the phone the library barely tests.
  {
    id: "plumber_agency_job_no_work_order_no_limit",
    trade: "plumber",
    priority: "P0",
    intent: "new_job",
    label: "Property manager books a job with no work order number and no spend limit",
    callerOpening: "Hi, it's Chloe from Harcourts — I've got a tenant at 14 Wattle Street in Preston reporting the toilet's blocked. Can you get someone out?",
    callerFacts: [
      "You are a property manager at Harcourts, your direct line is 0412 887 004",
      "The property is 14 Wattle Street, Preston",
      "The tenant is Marcus Vella, mobile 0455 210 998",
      "You have not raised a work order for it yet",
      "Your agency's approval limit without the landlord signing off is $400",
      "The tenant will be home after 3pm and can let the plumber in"
    ],
    callerBehaviour: [
      "You are brisk and want it booked in one call",
      "You volunteer the work order number and the spend limit only when actually asked"
    ],
    mustCapture: ["name", "phone", "issue_summary", "address"],
    expected: {
      shouldSaveLead: true,
      shouldEndCall: true,
      shouldSendOwnerSms: true,
      captureTarget: "complete"
    },
    mustSay: [
      "asked for a work order or job number for the job",
      "asked what the agency's approved spend limit is before work goes ahead",
      "captured how the plumber will get access to the property"
    ],
    whyThisMatters:
      "All four trades independently named agency work as where the money goes missing, in nearly the same words. An invoice with no work order number does not enter the agency's system at all, and work above an unstated approval limit is refused after it has been done — so the two questions nobody asks are the two that decide whether the job gets paid."
  },
  {
    id: "plumber_price_shopper_drain_clear",
    trade: "plumber",
    priority: "P0",
    intent: "quote_only",
    label: "Ringing around for a drain-clearing price and nothing else — three or four of these a day",
    callerOpening: "Yeah, just after a price to unblock a drain. How much?",
    callerFacts: [
      "The laundry floor drain is backing up when the washing machine empties",
      "It has been getting slower for a couple of weeks",
      "You are ringing several plumbers to compare",
      "You are in Reservoir",
      "You will give your name and mobile if asked, but you will not book today"
    ],
    callerBehaviour: [
      "You resist giving job details and keep returning to 'what's it going to cost'",
      "You do not commit to a booking at any point",
      "If given a structure rather than a flat number, you accept it without argument"
    ],
        // The caller here may leave or decline mid-intake, and from 2026-07-29 that
    // is an allowed outcome: nothing is compulsory, the AI asks and lets it go.
    // So this asserts that it ASKED, which is the behaviour we control, rather
    // than what the caller chose to hand over, which we do not.
mustCapture: ["issue_summary"],
    expected: {
      shouldSaveLead: true,
      shouldEndCall: true,
      shouldSendOwnerSms: true,
      captureTarget: "degraded"
    },
    mustSay: [
      "asked the caller for a contact number",

      "explained how the pricing works rather than refusing to discuss price at all"
    ],
    mustNotSay: [
      "quoted a total price for clearing the drain"
    ],
    whyThisMatters:
      "Three or four of these a day is most of the top of the funnel. Both failure modes lose: a number quoted sight-unseen becomes a figure the plumber has to argue down on site, and a flat 'we can't quote over the phone' gets a hang-up and the next plumber in the list. The lead must still be captured even though nothing is booked."
  },

  // ── Tier 3 of the tradie survey: the caller's diagnosis is wrong ───────────
  // All four trades named this and stated the same rule — book the SYMPTOM,
  // never the caller's diagnosis. The library had no scenario in either
  // direction. See docs/research/trade-call-failure-modes-2026-07.md.
  {
    id: "plumber_asks_for_new_hot_water_unit_but_it_is_the_element",
    trade: "plumber",
    priority: "P0",
    intent: "new_job",
    label: "Caller has decided they need a new hot water system — the symptoms say element or tariff",
    callerOpening: "Our hot water system's carked it, I need a new one put in. What do you charge to supply and install a 250 litre?",
    callerFacts: [
      "There is no hot water at all, since yesterday morning",
      "It is an electric storage unit on the side of the house, about eight years old",
      "There is no water on the ground around it and no rust or dripping",
      "You have not looked at the switchboard",
      "You are in Bendigo and you have already decided it needs replacing"
    ],
    callerBehaviour: [
      "You keep pushing for a supply-and-install price for a new unit",
      "You answer questions about symptoms if asked, but you volunteer nothing"
    ],
    mustCapture: ["name", "phone", "issue_summary", "address"],
    expected: {
      shouldSaveLead: true,
      shouldEndCall: true,
      shouldSendOwnerSms: true,
      captureTarget: "complete"
    },
    mustSay: [
      "asked whether there is any water leaking from or pooling around the unit",
      "told the caller that the plumber will diagnose the fault before any replacement is priced"
    ],
    mustNotSay: [
      "agreed that the hot water system needs replacing",
      "gave a price for supplying and installing a new hot water unit"
    ],
    whyThisMatters:
      "A dry eight-year-old tank with no hot water is usually a $90 element, a thermostat, or a controlled-load tariff that stopped switching — water on the ground is what means the cylinder has gone. Booking the caller's diagnosis puts $1,400 of stock on the ute for a $90 job, or sells someone a unit they did not need, and they find out eventually."
  }
];
