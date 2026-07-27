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

describe("electrical safety advice", () => {
  const prompt = () => buildSystemPrompt(makeTenant("electrician"), [], null);

  it("never gives one blanket instruction to operate the switchboard", () => {
    // The old tip was a single line — "If it's safe to do so, switch off the
    // affected circuit at the switchboard" — fired for all seven emergency
    // keywords, including a switchboard that is itself burning.
    expect(prompt()).not.toContain("switch off the affected circuit at the switchboard and do not touch");
    expect(prompt()).toContain("Match the advice to what they actually describe");
  });

  it("sends callers away from a switchboard that is smoking, sparking or hot", () => {
    const p = prompt();
    expect(p).toContain("get everyone away from it now and call 000");
    expect(p).toMatch(/Don't open the switchboard/i);
  });

  it("does not send a plain power outage to the switchboard", () => {
    expect(prompt()).toContain("Do NOT send them to the switchboard");
  });

  it("tells a caller who has taken a mains shock to see a doctor", () => {
    // "shock" matched the trade keyword list but not the life-threatening rule,
    // which said "electrocuted" — a word that means killed. A caller who is
    // still talking therefore fell between the two and got switchboard advice.
    const p = prompt();
    expect(p).toContain("should get seen by a doctor today");
    expect(p).toContain('"electrocuted" means killed');
    expect(p).toContain("Never send someone who has just taken a shock to the switchboard");
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
