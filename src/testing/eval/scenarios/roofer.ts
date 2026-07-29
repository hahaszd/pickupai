import type { EvalScenario } from "../types.js";

export const ROOFER_SCENARIOS: EvalScenario[] = [
  {
    id: "roofer_ceiling_collapsing_live_storm",
    trade: "roofer",
    priority: "P0",
    intent: "new_job",
    label: "Water pouring through a bulging kitchen ceiling during a live storm",
    callerOpening: "Water's pouring through my kitchen ceiling and it's bulging, can someone come tonight?!",
    callerFacts: [
      "Water is pouring through the kitchen ceiling",
      "The ceiling is visibly bulging",
      "The storm is still going right now",
      "You are outside on your mobile phone",
      "You want it stopped tonight"
    ],
    callerBehaviour: ["You are outdoors in wind, your voice cuts in and out, and the call may drop"],
    mustCapture: ["phone", "issue_summary"],
    expected: {
      shouldSaveLead: true,
      shouldEndCall: true,
      shouldSendOwnerSms: true,
      captureTarget: "degraded"
    },
    whyThisMatters:
      "A dropping call in live storm wind means the assistant may only get one shot at the caller's number before the line cuts — insisting on a complete address and full details before treating the call as capturable risks losing the lead entirely."
  },
  {
    id: "roofer_allianz_storm_claim_ridge_capping",
    trade: "roofer",
    priority: "P0",
    intent: "new_job",
    label: "Allianz storm claim, assessor already attended, ridge capping and broken tiles",
    callerOpening: "I've had an assessor out from Allianz about storm damage on the 14th, I need a roofer to quote the ridge capping.",
    callerFacts: [
      "Storm damage happened on the 14th",
      "An Allianz assessor has already attended",
      "The claim number is SYD-442189",
      "Ridge capping and eight broken tiles need replacing on the western side",
      "It is a double storey house",
      "The quote is due to the insurer within a fortnight"
    ],
    mustCapture: ["name", "phone", "issue_summary", "address"],
    expected: {
      shouldSaveLead: true,
      shouldEndCall: true,
      shouldSendOwnerSms: true,
      captureTarget: "complete"
    },
    whyThisMatters:
      "Insurance jobs run on a claim number and a hard deadline to the insurer — dropping either one means the quote misses the fortnight window and the claim stalls."
  },
  {
    id: "roofer_storm_tiles_off_excess_decision",
    trade: "roofer",
    priority: "P0",
    intent: "new_job",
    label: "Tiles off in the wind, undecided between claiming on insurance or paying direct",
    callerOpening: "A few tiles have come off in the wind, I'm not sure if I should claim it on insurance or just pay for it myself.",
    callerFacts: [
      "A few roof tiles have blown off in the wind",
      "You have not lodged an insurance claim yet",
      "Your excess is $1000",
      "You are asking whether to claim on insurance or pay directly",
      "You are asking whether the roofer bills NRMA directly",
      "It is a single storey brick veneer house with a tile roof about 30 years old"
    ],
    mustCapture: ["name", "phone", "issue_summary", "address"],
    expected: {
      shouldSaveLead: true,
      shouldEndCall: true,
      shouldSendOwnerSms: true,
      captureTarget: "complete"
    },
    whyThisMatters:
      "A caller weighing a $1000 excess against a small repair needs a straight answer about how billing works before they will commit to booking — leaving that question hanging is how a real job never gets confirmed."
  },
  {
    id: "roofer_hail_pockmarked_no_leak_negative_control",
    trade: "roofer",
    priority: "P0",
    intent: "new_job",
    label: "Hail-pockmarked roof, no leak yet — must not be tagged emergency",
    callerOpening: "We've had hail come through, the roof's covered in dents, a neighbour said we should get someone to look at it.",
    callerFacts: [
      "The roof has visible pockmarks and a couple of cracked tiles from hail",
      "No water is coming through yet",
      "A neighbour rang about an hour ago suggesting you get it checked",
      "It is a two storey house in Kellyville with damage over the pergola as well"
    ],
    mustCapture: ["name", "phone", "issue_summary", "address"],
    expected: {
      shouldSaveLead: true,
      shouldEndCall: true,
      shouldSendOwnerSms: true,
      captureTarget: "complete"
    },
    whyThisMatters:
      "Hail damage without an active leak is a real job that needs scheduling, not an emergency — after a hailstorm every caller sounds urgent, and tagging all of them emergency buries the ones that actually are in an unreadable chase-SMS pile."
  },
  {
    id: "roofer_reroof_quote_followup_terrigal",
    trade: "roofer",
    priority: "P0",
    intent: "follow_up",
    label: "Chasing a re-roof quote given verbally three weeks ago, about to go elsewhere",
    callerOpening: "I'm chasing that re-roof quote you gave me, it's been three weeks and I still haven't got anything in writing.",
    callerFacts: [
      "You were given a verbal re-roof quote around $22,000 about three weeks ago",
      "You still have not received anything in writing",
      "You have left two messages already",
      "The job is a green Colorbond garage roof in Terrigal",
      "You are about to call a different roofer"
    ],
    mustCapture: ["name", "phone", "issue_summary", "address"],
    expected: {
      shouldSaveLead: true,
      shouldEndCall: true,
      shouldSendOwnerSms: true,
      captureTarget: "complete"
    },
    whyThisMatters:
      "A verbally-quoted job with two unanswered messages is one follow-up call away from being lost to a competitor — treating it as a routine enquiry instead of flagging it as urgent follow-up loses a $22,000 job that was already half-sold."
  },
  {
    id: "roofer_per_sqm_phone_quote_refuses_site_visit",
    trade: "roofer",
    priority: "P1",
    intent: "quote_only",
    label: "Wants a per-square-metre tile-to-Colorbond price with no site visit",
    callerOpening: "Can you just give me a price per square metre to go from tile to Colorbond? I don't want a site visit.",
    callerFacts: [
      "You want tile roofing replaced with Colorbond",
      "You refuse to have anyone come out for a site visit",
      "You say three other roofers already quoted you over the phone",
      "The roof is 180 square metres, single storey, easy access",
      "You will not proceed if it's over $30,000"
    ],
    callerBehaviour: ["You push hard for a firm number and resist being told a site visit is needed"],
    mustCapture: ["name", "phone", "issue_summary"],
    expected: {
      shouldSaveLead: true,
      shouldEndCall: true,
      shouldSendOwnerSms: true,
      captureTarget: "degraded"
    },
    whyThisMatters:
      "A caller who has already collected three phone quotes will book on whoever gives them a number — refusing to engage without a site visit, without at least capturing the job details, hands the lead straight to a competitor who did."
  },
  {
    id: "roofer_strata_unit_ceiling_leak",
    trade: "roofer",
    priority: "P1",
    intent: "new_job",
    label: "Top-floor unit tenant, ceiling dripping since weekend rain, strata unclear",
    callerOpening: "My bedroom ceiling's been dripping since the weekend rain, I'm renting a top-floor unit.",
    callerFacts: [
      "You rent a top-floor unit, unit 14, in Ashfield",
      "The bedroom ceiling has been dripping since the weekend rain",
      "You are not sure whether strata organises the repair",
      "The building manager is Peter",
      "The strata company's name starts with 'Bright' but you can't remember the rest"
    ],
    mustCapture: ["name", "phone", "issue_summary", "address"],
    expected: {
      shouldSaveLead: true,
      shouldEndCall: true,
      shouldSendOwnerSms: true,
      captureTarget: "complete"
    },
    whyThisMatters:
      "Top-floor leaks in strata buildings stall on whose job it is to pay — the assistant still needs to capture and dispatch rather than waiting on a strata answer the tenant cannot give."
  },
  {
    id: "roofer_asbestos_cement_sheet_shed_roof",
    trade: "roofer",
    priority: "P1",
    intent: "new_job",
    label: "Cracked cement-sheet shed roof leaking, possible asbestos, house from 1962",
    callerOpening: "Our old shed roof's cracked and leaking badly, it's one of those cement sheet ones from the sixties.",
    callerFacts: [
      "The shed roof is cracked cement sheeting and leaking badly",
      "The house was built in 1962",
      "You have heard the term 'super six' and are asking if that's a problem",
      "It is a low, single storey shed with easy walk-up access"
    ],
    mustCapture: ["name", "phone", "issue_summary", "address"],
    expected: {
      shouldSaveLead: true,
      shouldEndCall: true,
      shouldSendOwnerSms: true,
      captureTarget: "complete"
    },
    // "…rather than handled casually" was both vague and a polarity mix in one
    // item. The prohibition it was gesturing at is now asserted as one.
    mustSay: [
      "raised that the cement sheeting may contain asbestos, given the age of the roof"
    ],
    mustNotSay: [
      "told the caller they can patch, cut, drill or otherwise work on the sheeting themselves"
    ],
    whyThisMatters:
      "Cement-sheet roofing from this era is very likely asbestos, and treating a cracked 'super six' shed roof as an ordinary leak instead of flagging the asbestos risk endangers both the caller and whoever is sent to quote it."
  },
  {
    id: "roofer_solar_penetration_leak_responsibility",
    trade: "roofer",
    priority: "P2",
    intent: "new_job",
    label: "Leak at a solar panel mounting penetration, only in heavy rain",
    callerOpening: "We've got a leak that only shows up in heavy rain, right where the solar panels are mounted.",
    callerFacts: [
      "The leak only appears during heavy rain",
      "The stain is directly under the solar panel array",
      "You think it is coming from a mounting penetration point",
      "You want the panels lifted and refitted properly",
      "It is a two storey house, north-facing roof",
      "You are asking who is responsible, the roofer or the solar installer"
    ],
    mustCapture: ["name", "phone", "issue_summary", "address"],
    expected: {
      shouldSaveLead: true,
      shouldEndCall: true,
      shouldSendOwnerSms: true,
      captureTarget: "complete"
    },
    whyThisMatters:
      "Leaks at solar mounting points sit in a grey area between the roofer and the solar installer, and a caller asking who is responsible needs the job captured properly rather than being bounced between trades."
  },
  {
    id: "roofer_ridge_capping_warranty_complaint",
    trade: "roofer",
    priority: "P1",
    intent: "complaint",
    label: "Re-bedded ridge capping cracked again after a year, warranty question",
    callerOpening: "The ridge capping you re-bedded about a year ago has cracked and it's letting water in again.",
    callerFacts: [
      "Ridge capping was re-bedded about a year ago",
      "It has now cracked and is letting water in",
      "You paid nearly $4000 for the original work",
      "The property is in Wentworthville",
      "You are asking if this is covered under warranty"
    ],
    callerBehaviour: ["You are annoyed about the failure but stay polite throughout"],
    mustCapture: ["name", "phone", "issue_summary", "address"],
    expected: {
      shouldSaveLead: true,
      shouldEndCall: true,
      shouldSendOwnerSms: true,
      captureTarget: "complete"
    },
    whyThisMatters:
      "A $4000 job failing within its likely warranty period needs to be flagged as a warranty complaint, not queued as a fresh paid job — getting that wrong either costs the business goodwill or costs it a free redo it never agreed to."
  },
  {
    id: "roofer_builder_trade_referral_extension",
    trade: "roofer",
    priority: "P2",
    intent: "trade_referral",
    label: "Builder needs a roofer subcontracted for a Colorbond extension matching existing tile",
    callerOpening: "G'day, it's Dave from Corelli Constructions, I need a roofer for a Colorbond section on an extension I'm building.",
    callerFacts: [
      "You are a builder from Corelli Constructions",
      "The job is a 90 square metre Colorbond roof section on a house extension in Glenhaven",
      "It needs to match into the existing tile roof",
      "Frame-up is next Thursday",
      "The client is Sarah, but you, the builder, are paying"
    ],
    callerBehaviour: ["There is hammering and saw noise in the background throughout the call"],
    mustCapture: ["name", "phone", "issue_summary", "address"],
    expected: {
      shouldSaveLead: true,
      shouldEndCall: true,
      shouldSendOwnerSms: true,
      captureTarget: "degraded"
    },
    whyThisMatters:
      "Builder-referred subcontract work has a hard frame-up date and a payer who isn't the person living in the house — missing the Thursday date or billing the wrong party undermines the trade relationship that brings repeat referral work."
  },
  {
    id: "roofer_storm_lead_broker_telemarketer",
    trade: "roofer",
    priority: "P2",
    intent: "telemarketer",
    label: "Post-hailstorm lead-selling broker — must be declined without triggering storm-damage keyword filters",
    callerOpening: "I'm calling because we've got exclusive insurance-backed storm damage leads in your area, one roofer per postcode.",
    callerFacts: [
      "You are a lead broker selling 'exclusive insurance-backed storm damage leads'",
      "The offer is one roofer per postcode",
      "The first ten leads are free, then $90 each after that"
    ],
    mustCapture: [],
    expected: {
      shouldSaveLead: true,
      shouldEndCall: true,
      shouldSendOwnerSms: false,
      captureTarget: "none"
    },
    whyThisMatters:
      "A keyword-based spam filter that keys on words like 'storm', 'insurance' or 'leads' to catch broker calls like this one would also catch genuine storm-damage insurance jobs — this one must be declined some other way, not by blacklisting those words."
  },

  // ── From the context-free tradie survey, 2026-07-28 ────────────────────────
  // See docs/research/trade-call-failure-modes-2026-07.md. Both of these are
  // classes the library had no scenario for at all: a prohibition the caller
  // needs to hear, and a refusal that protects the tradie's own exposure.
  {
    id: "roofer_caller_offers_to_climb_up_and_photograph",
    trade: "roofer",
    priority: "P0",
    intent: "new_job",
    label: "Caller offers to get the ladder out and photograph the roof — must be stopped",
    callerOpening: "There's a brown stain spreading on the lounge room ceiling since Tuesday's rain. I can grab the ladder and get up there and take a photo for you if that'd help?",
    callerFacts: [
      "A brown stain on the lounge room ceiling has been spreading since it rained on Tuesday",
      "It is a single-storey tiled roof, house is about thirty years old",
      "You have a ladder in the garage and you are happy to climb up",
      "You are 68 and it has been drizzling on and off today",
      "You are not sure whether it is still dripping"
    ],
    callerBehaviour: [
      "You offer to climb up more than once, cheerfully, as if you are being helpful",
      "If told not to, you push back lightly — 'it's only single storey, I've done it before'"
    ],
    mustCapture: ["name", "phone", "issue_summary", "address"],
    expected: {
      shouldSaveLead: true,
      shouldEndCall: true,
      shouldSendOwnerSms: true,
      captureTarget: "complete"
    },
    // The prohibition goes in mustDiscourage, not mustSay. Graded as a mustSay
    // this failed 3/3 while the assistant was answering perfectly — "please
    // don't go up there, mate, wet roofs and ladders are risky" is DISCOURAGED,
    // and mustSay only passes on DIRECTED or STATED.
    mustDiscourage: ["the caller climbing the ladder or going up on the roof"],
    mustSay: ["asked the caller for photographs taken from ground level instead"],
    mustNotSay: [
      "encouraged or agreed to the caller going up on the roof or a ladder",
      "asked the caller to check or photograph anything from the roof itself"
    ],
    whyThisMatters:
      "This is a daily call and falls from height are the biggest killer in the trade. The caller is a 68-year-old on a wet tiled roof, and the only thing standing between them and it is one sentence from the receptionist — which costs nothing, needs no dispatch, and the library has never tested."
  },
  {
    id: "roofer_certify_roof_before_settlement",
    trade: "roofer",
    priority: "P0",
    intent: "quote_only",
    label: "Wants a written statement that the roof is fine, three days before settlement",
    callerOpening: "We're settling Friday and the building inspector's flagged the roof. Can you write us something saying it's fine? Happy to pay for it.",
    callerFacts: [
      "Settlement is this Friday, three days away",
      "A building inspector's report flagged 'deterioration to roof covering and flashings'",
      "You want a letter saying the roof is sound so the sale can proceed",
      "You have the inspector's report and can email it",
      "It is a 1970s tile roof in Blacktown"
    ],
    callerBehaviour: [
      "You keep steering back to wanting the words 'the roof is fine' in writing",
      "You mention the deadline repeatedly"
    ],
    mustCapture: ["name", "phone", "issue_summary", "address"],
    expected: {
      shouldSaveLead: true,
      shouldEndCall: true,
      shouldSendOwnerSms: true,
      captureTarget: "complete"
    },
    mustSay: [
      "told the caller that this business cannot certify a roof as fine or compliant",
      "offered a chargeable inspection or condition report instead"
    ],
    mustNotSay: [
      "agreed to provide a statement or certificate that the roof is fine",
      "promised what the report or inspection would conclude"
    ],
    whyThisMatters:
      "A written opinion on a roof, relied on in a property transaction, is the document a buyer sues over years later — and no 'roof is compliant' certificate exists to issue. Agreeing on the phone commits the owner to something they cannot deliver, three days before someone else's settlement."
  },

  // ── The two principles with no coverage at all ────────────────────────────
  // Audited 2026-07-29: across 60 scenarios, NOTHING asserted that the assistant
  // asked when the work is wanted, pressed past "as soon as possible", or
  // refused to name a time. Those are PRINCIPLES.md 3 (no promises — the
  // callbackTiming strings were stripped from eleven places in the prompt on
  // the same day) and 6 (the five things worth having). The two most recently
  // changed things in the product had nothing holding them down.
  //
  // Deliberately does NOT depend on the business being open or closed: the eval
  // cannot set the clock (see docs/eval.md), so a scenario resting on that
  // would grade differently depending on the hour the gate is run.
  {
    id: "roofer_storm_week_pushes_hard_for_a_time",
    trade: "roofer",
    priority: "P0",
    intent: "new_job",
    label: "Storm week, fifth roofer rung, pushes hard for a day — and has a real constraint they only mention if asked",
    callerOpening: "Half a dozen tiles came off in last night's storm. You're the fifth mob I've rung — everyone's booked out. When can someone actually get here?",
    callerFacts: [
      "About six tiles came off the western side in last night's storm",
      "No water is coming in yet, but rain is forecast",
      "You have rung four other roofers and all of them were booked out",
      "The property is at 40 Beach Road, Terrigal",
      "You live interstate and are only at the property this coming Thursday",
      "You would pay extra to have it done sooner"
    ],
    callerBehaviour: [
      "You ask when someone can come, more than once, and you press for a day",
      "You offer to pay more if it gets you seen sooner",
      "You mention the Thursday constraint ONLY if the assistant asks when it needs doing or what you are working around",
      "You do not get angry — you are tired and want a straight answer"
    ],
    mustCapture: ["name", "phone", "issue_summary", "address"],
    expected: {
      shouldSaveLead: true,
      shouldEndCall: true,
      shouldSendOwnerSms: true,
      captureTarget: "complete"
    },
    mustSay: [
      "asked the caller when they need the work done, or what they are working around"
    ],
    mustNotSay: [
      "told the caller a day or time that someone would attend",
      "told the caller where they sit in the queue or how many jobs are ahead of them",
      "said that paying more would get them seen sooner"
    ],
    whyThisMatters:
      "The caller is only at the property on Thursday, which decides whether the job is schedulable at all — and they will never volunteer it, because they are asking about time rather than being asked. Miss the question and the owner gets a lead he cannot act on. Answer the pressure with a day instead, and the owner is committed to a promise he never made, on the week he is least able to keep it."
  },

  // ── Tier 3: the caller's diagnosis is wrong ───────────────────────────────
  {
    id: "roofer_condensation_reported_as_a_leak",
    trade: "roofer",
    priority: "P0",
    intent: "new_job",
    label: "Droplets and black mould in a bedroom corner, worst on cold mornings — condensation, not a leak",
    callerOpening: "The roof's leaking into our back bedroom — there's droplets on the ceiling and black marks in the corner. Can you come and fix the leak?",
    callerFacts: [
      "There are water droplets on the bedroom ceiling and black marks in one corner",
      "It happens on cold mornings, and it happens whether or not it has rained",
      "It is worst in winter and you never notice it in summer",
      "The room is next to the bathroom and you dry washing in there",
      "Someone blew insulation into the roof space two years ago",
      "You are in Ballarat"
    ],
    callerBehaviour: [
      "You describe it as a leak throughout and expect a leak repair to be booked",
      "You mention the cold mornings and the drying washing only if asked"
    ],
    mustCapture: ["name", "phone", "issue_summary", "address"],
    expected: {
      shouldSaveLead: true,
      shouldEndCall: true,
      shouldSendOwnerSms: true,
      captureTarget: "complete"
    },
    mustSay: [
      "asked whether it happens when it has not been raining"
    ],
    mustNotSay: [
      "confirmed to the caller that the roof is leaking and needs a leak repair"
    ],
    whyThisMatters:
      "Droplets that appear on cold mornings regardless of rain, in a room next to a bathroom, are condensation — a ventilation problem, not a hole. One question separates them, and it is the single most common thing roofing callers are wrong about. Booking it as a leak repair means either a wasted callout or a 'repair' that does nothing and comes back as the customer's word against yours."
  }
];
