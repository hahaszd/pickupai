import { describe, it, expect } from "vitest";
import { buildSystemPrompt } from "../src/realtime/session.js";
import type { TenantRow } from "../src/db/repo.js";

// These lock in three fixes that came out of a per-trade product review. Each
// one was a live production behaviour, not a hypothetical.
function makeTenant(trade: string): TenantRow {
  return {
    tenant_id: "t", name: "Test Trade Co", trade_type: trade, ai_name: "Olivia",
    twilio_number: "+61400000000", owner_phone: "+61412345678", owner_email: null,
    password_hash: null, session_token: null, business_hours_start: "08:00",
    business_hours_end: "17:00", timezone: "Australia/Sydney", enable_warm_transfer: 0,
    service_area: null, custom_instructions: null, vacation_mode: 0, vacation_message: null,
    active: 1, created_at: new Date().toISOString(), last_login_at: null,
    payment_status: "active", trial_ends_at: null, stripe_customer_id: null
  } as TenantRow;
}

/**
 * These asserted per-hazard safety advice — switchboard instructions, "get seen
 * by a doctor today", the distinction between a shock and being electrocuted.
 * All of it was deleted on 2026-07-31 by owner decision (PRINCIPLES.md 8):
 * people with real emergencies ring 000, not a plumber, and giving safety
 * advice is Principle 1's judgement wearing a costume.
 *
 * Rewritten to assert the ABSENCE rather than deleted, per CODING_STANDARDS —
 * three tests in this repo once spent months asserting a feature that had been
 * intentionally removed, and nobody noticed because they still passed.
 */
describe("the assistant gives no safety advice at all", () => {
  const TRADES = ["electrician", "plumber", "roofer", "handyman", "builder"];

  it("never tells a caller what to touch, switch off, or stay away from", () => {
    for (const trade of TRADES) {
      const p = buildSystemPrompt(makeTenant(trade), [], null);
      for (const gone of [
        "switch off the affected circuit",
        "Don't open the switchboard",
        "Do NOT send them to the switchboard",
        "switch off the power at the mains",
        "Avoid the rooms directly under the leak",
        "avoid the affected area"
      ]) {
        expect(p, `${trade} still carries: ${gone}`).not.toContain(gone);
      }
    }
  });

  // The one the owner argued through, and the clearest case. A mains shock CAN
  // cause a delayed arrhythmia and being able to speak is not evidence of being
  // unharmed — but if the assistant needs to know that, it is practising
  // medicine off a transcript, and 000 is the wrong number for "should I get
  // this looked at" anyway.
  it("never makes a medical judgement, or overrides a caller about their own body", () => {
    const p = buildSystemPrompt(makeTenant("electrician"), [], null);
    expect(p).not.toContain("should get seen by a doctor today");
    expect(p).not.toContain("even when they insist they're fine");
    expect(p).toMatch(/If they say they are fine, they are fine as far as you are concerned/i);
  });

  it("keeps exactly one line, for three things that cannot be misread", () => {
    for (const trade of TRADES) {
      const p = buildSystemPrompt(makeTenant(trade), [], null);
      expect(p).toContain("That sounds like one for triple zero");
      // Spoken form, not the digits. A realtime TTS reading "000" can say
      // "zero zero zero", which is not what an Australian says and lands badly
      // on a frightened caller — and this line now carries 100% of the
      // product's safety utterance instead of one of eight.
      expect(p).not.toMatch(/one for 000/);
      // The opening must not eat the line: "I can smell gas but it's fine" is
      // still a caller who has told you they can smell gas.
      expect(p).toMatch(/their opening does not count as having refused/i);
      expect(p).toContain("on fire, smoking, or smells of burning");
      expect(p).toContain("they can smell gas");
      expect(p).toContain("trapped, unconscious, not breathing, or badly hurt");
      // Said once, and Principle 4 does not stop applying because the topic is
      // safety.
      expect(p).toMatch(/if they tell you it is not that serious, drop it immediately/i);
    }
  });

  it("records the hazards it must not advise on, rather than dropping them", () => {
    const p = buildSystemPrompt(makeTenant("electrician"), [], null);
    expect(p).toMatch(/Everything else you simply write down/i);
    expect(p).toContain("a switchboard that feels hot");
  });
});

describe("handyman licensing scope", () => {
  const prompt = () => buildSystemPrompt(makeTenant("handyman"), [], null);

  it("renders a licensed-work boundary instead of the unbounded accept-all text", () => {
    // The out-of-trade decline block was gated on `!isHandyman`, so the one
    // trade that needs a licensing boundary had no decline path at all.
    const p = prompt();
    expect(p).toContain("# Scope — Licensed Work");
    expect(p).not.toContain("Accept enquiries for all of these service types");
  });

  it("names the restricted categories a handyman cannot legally do", () => {
    const p = prompt();
    expect(p).toMatch(/new or moved power points/i);
    expect(p).toMatch(/replacing taps, mixers, toilets, hot water units/i);
    expect(p).toMatch(/Gas work of any kind/i);
  });

  it("still captures the lead rather than refusing the caller", () => {
    const p = prompt();
    expect(p).toContain("Still take their details");
    expect(p).toContain("LICENSED WORK - ");
  });

  it("does not promise to attend licensed emergencies", () => {
    // The old emergency tip promised "The team will prioritise getting someone
    // out" for burst pipes and no power — the exact jobs a handyman must not take.
    const p = prompt();
    expect(p).not.toContain("The team will prioritise getting someone out");
  });

  it("prompts for the rest of the job list", () => {
    // A multi-job visit is the handyman's most valuable call, and the generic
    // "STOP collecting once you have an issue description" rule ended it early.
    expect(prompt()).toContain("anything else on the list");
  });
});

describe("urgency classification — removed 2026-07-28", () => {
  // urgency_level and its rubric were deleted by decision: the owner reads the
  // message and judges urgency himself faster than a label could tell him, and
  // the label made every lead without it score as a degraded capture. These
  // tests now pin the REMOVAL, because the failure mode is someone
  // reintroducing a grade because the prompt "feels like it needs one".
  it("does not ask the assistant to grade urgency at all", () => {
    for (const trade of ["plumber", "electrician", "roofer", "handyman"]) {
      const prompt = buildSystemPrompt(makeTenant(trade), [], null);
      expect(prompt, trade).not.toContain("urgency_level");
      expect(prompt, trade).not.toContain("## Setting urgency_level");
    }
  });

  // The safety half is a different thing entirely and must survive: a caller
  // who can be hurt during the call needs the instruction now, not from an
  // owner reading an SMS twenty minutes later.
  // This asserted that the life-safety instructions survived the urgency
  // deletion, on the reasoning that a safety instruction is not a
  // classification. That reasoning was overturned on 2026-07-31: deciding what
  // is dangerous and what to do about it IS the judgement, and the callers it
  // was built for ring 000 rather than a plumber. PRINCIPLES.md 8.
  it("no longer keeps hazard-specific instructions, and says so in one line instead", () => {
    const prompt = buildSystemPrompt(makeTenant("plumber"), [], null);
    expect(prompt).not.toContain("# Life-Threatening Emergencies");
    expect(prompt).not.toMatch(/leave the building right away and call 000/i);
    expect(prompt).toContain("# If Someone Is In Danger Right Now");
    expect(prompt).toContain("That sounds like one for triple zero");
  });

  it("asks the assistant to describe the situation instead of grading it", () => {
    const prompt = buildSystemPrompt(makeTenant("electrician"), [], null);
    expect(prompt).toMatch(/issue_summary/);
  });
});

describe("unlisted trades", () => {
  // A sealants business signed up, was stored as the literal string "other",
  // and would have been introduced to callers as "an Australian other
  // business" with no trade questions at all. It was the only real signup the
  // product had ever had.
  it("never describes a business as an 'other' business", () => {
    for (const trade of ["other", "tradie", ""]) {
      const prompt = buildSystemPrompt(makeTenant(trade), [], null);
      expect(prompt, `trade_type=${JSON.stringify(trade)}`).not.toContain("an Australian other business");
      expect(prompt, `trade_type=${JSON.stringify(trade)}`).not.toContain("an Australian tradie business");
    }
  });

  it("uses a trade the signup form did not offer, verbatim", () => {
    // buildTradeSection has no config for these, but the stored string is the
    // label — which is why the signup form now asks people to type it.
    // Note these must be trades with no TRADE_ALIASES entry: fencing,
    // locksmith, concreting and landscaping are deliberately absorbed into
    // handyman and are therefore introduced with the handyman label.
    for (const trade of ["sealants", "waterproofing", "glazier", "plasterer"]) {
      expect(buildSystemPrompt(makeTenant(trade), [], null)).toContain(`an Australian ${trade} business`);
    }
  });

  it("still gives the assistant questions to ask", () => {
    // Falling through with no intake section left it able to collect a name
    // and a number and nothing else, which is the entire thing this product
    // claims to do better than voicemail.
    const prompt = buildSystemPrompt(makeTenant("sealants"), [], null);
    expect(prompt).toContain("# Intake Questions");
    expect(prompt).toContain("What's the job — what needs doing?");
  });

  it("tells the assistant not to fake knowledge of a trade it has no config for", () => {
    const prompt = buildSystemPrompt(makeTenant("sealants"), [], null);
    expect(prompt).toMatch(/NEVER pretend to technical knowledge/i);
  });
});

describe("save_lead schema", () => {
  const prompt = () => buildSystemPrompt(makeTenant("plumber"), [], null);

  it("exposes confidence so the model can actually set it", () => {
    // The prompt instructed the model to "always set confidence" while the
    // parameter was absent from the schema, so the column was always null.
    expect(prompt()).toContain("confidence");
  });

  it("exposes job_size and never asks the model to write job_value", () => {
    // job_value is the owner's dollar figure, summed for their ROI stat.
    // The model writing "medium" into it zeroed that total.
    const p = prompt();
    expect(p).toContain("job_size");
    expect(p).not.toMatch(/set job_value/);
  });
});

describe("the assistant never asks the caller to do anything", () => {
  // Distinct from safety advice, and it survived the first deletion because
  // nothing had named it: a caller offering to climb onto their roof to take a
  // photo is not a hazard the assistant is judging, it is a customer being
  // asked to work on their own house so a form can be filled in.
  const TRADES = ["roofer", "electrician", "plumber", "handyman"];

  it("refuses a caller's offer to climb, photograph, or go and check", () => {
    for (const trade of TRADES) {
      const p = buildSystemPrompt(makeTenant(trade), [], null);
      expect(p, trade).toContain("Never ask a caller to go and inspect anything, or to do anything to the property");
      expect(p, trade).toMatch(/just tell me what you can see from where you are/i);
      // Narrowed 2026-08-03. The first wording was "never ask a caller to DO
      // anything", which the same prompt contradicts six times over — it asks
      // callers to repeat themselves, spell a suburb, confirm a read-back, and
      // give a number. An absolute the prompt breaks is not a rule, it is a
      // coin toss about which half the model keeps.
      expect(p, trade).toContain("Questions are completely fine and they are your job");
    }
  });

  // If the assistant declines BECAUSE it is dangerous, that is the judgement
  // section 8 deleted, arriving by the back door.
  it("does not let the refusal be explained as a safety matter", () => {
    const p = buildSystemPrompt(makeTenant("roofer"), [], null);
    expect(p).toMatch(/This is NOT about danger, and you must not explain it as though it were/i);
    expect(p).toMatch(/You are not judging the ladder/i);
  });

  // The narrowed ban no longer needs a triple-zero carve-out: pointing someone
  // to 000 is not asking them to inspect the property. What it does need is the
  // sentence for a caller who asks outright, which the first version banned
  // without supplying — the failure this repo has measured four times.
  it("supplies the sentence for a caller who asks what to do", () => {
    const p = buildSystemPrompt(makeTenant("plumber"), [], null);
    expect(p).toMatch(/I'm the AI receptionist here, so I'm honestly not the one to tell you what to do/);
    expect(p).toContain("I can't see it and I'm not the tradesperson");
    // The evasive improvisations that a bare prohibition produces, named so the
    // model does not reach for them — same shape as the price rule.
    expect(p).toContain('"I\'m not able to advise on that"');
    expect(p).toMatch(/applies to every "what should I do" question, not only dangerous ones/);
  });

  // Asking is not requesting. The intake questions are the job and must survive.
  it("keeps the questions that collect what the caller already knows", () => {
    const p = buildSystemPrompt(makeTenant("plumber"), [], null);
    expect(p).toContain("Is there active water leaking right now?");
    expect(p).toContain("Can they see where it's coming from");
  });
});

describe("the business name is substituted everywhere it appears", () => {
  // The placeholder was replaced in ONE section, with a non-global replace. The
  // danger section added 2026-07-31 read out verbatim: "let This business judge
  // it. He knows the house, the circuit and the machine." Two placeholders, in
  // the section carrying the product's only safety utterance.
  it("leaves no placeholder anywhere in the rendered prompt", () => {
    for (const trade of ["electrician", "plumber", "roofer", "handyman", "builder"]) {
      const p = buildSystemPrompt(makeTenant(trade), [], null);
      expect(p, `${trade} still contains the raw placeholder`).not.toContain("This business");
      expect(p).toContain("Test Trade Co");
    }
  });
});
