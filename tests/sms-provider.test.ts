import { describe, it, expect } from "vitest";
import { detectProviderFromSid, summariseActualProvider } from "../src/sms/mobile-message.js";

// Twilio SMS SIDs are "SM" + 32 hex chars. Mobile Message returns its own
// non-conforming ids, and both share one column, so the shape is the only
// thing distinguishing them.
const TWILIO_SID = "SM" + "a".repeat(32);
const MM_ID = "6f1c9e2a-4b77-4c1e-9f2d-0a1b2c3d4e5f";

describe("detectProviderFromSid", () => {
  it("recognises a Twilio SMS SID", () => {
    expect(detectProviderFromSid(TWILIO_SID)).toBe("Twilio");
  });

  it("is case-insensitive about the hex", () => {
    expect(detectProviderFromSid("SM" + "A1B2C3D4".repeat(4))).toBe("Twilio");
  });

  it("treats any other non-empty id as Mobile Message", () => {
    expect(detectProviderFromSid(MM_ID)).toBe("MM");
  });

  it("does not mistake an MMS SID for an SMS SID", () => {
    // MM-prefixed Twilio ids are MMS, not the SMS path this distinguishes.
    expect(detectProviderFromSid("MM" + "a".repeat(32))).toBe("MM");
  });

  it("returns null when no id was stored", () => {
    expect(detectProviderFromSid(null)).toBeNull();
    expect(detectProviderFromSid(undefined)).toBeNull();
    expect(detectProviderFromSid("")).toBeNull();
  });
});

describe("summariseActualProvider", () => {
  it("reports twilio when every sample is a Twilio SID", () => {
    const r = summariseActualProvider([TWILIO_SID, TWILIO_SID, TWILIO_SID]);
    expect(r.provider).toBe("twilio");
    expect(r.twilio).toBe(3);
    expect(r.mobilemessage).toBe(0);
  });

  it("reports mobilemessage when every sample is a Mobile Message id", () => {
    expect(summariseActualProvider([MM_ID, MM_ID]).provider).toBe("mobilemessage");
  });

  it("reports mixed when both appear", () => {
    // The realistic shape of a Mobile Message account running out of credit
    // partway through: some sent, then every later one falls back to Twilio.
    const r = summariseActualProvider([TWILIO_SID, TWILIO_SID, MM_ID]);
    expect(r.provider).toBe("mixed");
    expect(r.twilio).toBe(2);
    expect(r.mobilemessage).toBe(1);
  });

  it("reports null rather than guessing when nothing is identifiable", () => {
    const r = summariseActualProvider([null, undefined, ""]);
    expect(r.provider).toBeNull();
    expect(r.unknown).toBe(3);
    expect(r.sampled).toBe(3);
  });

  it("reports null for an empty sample", () => {
    expect(summariseActualProvider([]).provider).toBeNull();
  });
});
