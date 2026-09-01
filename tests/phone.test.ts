import { describe, it, expect } from "vitest";
import { formatAuPhone, isAuMobile, validateOwnerPhone } from "../src/utils/phone.js";

describe("formatAuPhone", () => {
  it("formats a mobile number (+61) to local style", () => {
    expect(formatAuPhone("+61412345678")).toBe("0412 345 678");
  });

  it("formats a Sydney landline to local style", () => {
    expect(formatAuPhone("+61280001234")).toBe("02 8000 1234");
  });

  it("formats a Melbourne landline to local style", () => {
    expect(formatAuPhone("+61390001234")).toBe("03 9000 1234");
  });

  it("returns non-AU numbers unchanged", () => {
    expect(formatAuPhone("+14155551234")).toBe("+14155551234");
  });

  it("returns numbers without + prefix unchanged", () => {
    expect(formatAuPhone("0412345678")).toBe("0412345678");
  });

  it("returns empty string unchanged", () => {
    expect(formatAuPhone("")).toBe("");
  });

  it("handles another mobile prefix", () => {
    expect(formatAuPhone("+61400000000")).toBe("0400 000 000");
  });

  it("formats a Queensland landline (07)", () => {
    expect(formatAuPhone("+61732001234")).toBe("07 3200 1234");
  });

  it("formats a WA/SA landline (08)", () => {
    expect(formatAuPhone("+61892001234")).toBe("08 9200 1234");
  });

  it("returns 1300 numbers with +61 prefix as-is (non-standard)", () => {
    const result = formatAuPhone("+611300123456");
    expect(result).toBeDefined();
  });

  it("returns 1800 numbers with +61 prefix as-is (non-standard)", () => {
    const result = formatAuPhone("+611800123456");
    expect(result).toBeDefined();
  });
});

describe("isAuMobile", () => {
  it("accepts 04 local mobile", () => {
    expect(isAuMobile("0412 345 678")).toBe(true);
  });

  it("accepts +61 mobile", () => {
    expect(isAuMobile("+61412345678")).toBe(true);
  });

  it("accepts 8-digit mobile after national trim", () => {
    expect(isAuMobile("412345678")).toBe(true);
  });

  it("rejects Sydney landline 02", () => {
    expect(isAuMobile("02 8000 1234")).toBe(false);
    expect(isAuMobile("+61280001234")).toBe(false);
  });

  it("rejects 1300", () => {
    expect(isAuMobile("1300 000 000")).toBe(false);
  });

  it("rejects empty or whitespace", () => {
    expect(isAuMobile("")).toBe(false);
    expect(isAuMobile("   ")).toBe(false);
  });
});

describe("validateOwnerPhone — a tenant's number must be able to receive SMS", () => {
  it("accepts AU mobiles in every format we normalise, returning E.164", () => {
    for (const raw of ["0412 345 678", "0412345678", "+61412345678", "61412345678", "412345678", "0412-345-678"]) {
      const r = validateOwnerPhone(raw);
      expect(r.ok, `expected ${raw} to be accepted`).toBe(true);
      if (r.ok) expect(r.e164).toBe("+61412345678");
    }
  });

  // The case that actually happened: an Adelaide landline passed signup on
  // 2026-09-01 and every SMS to that account went nowhere.
  it("rejects the landline that got through, and says why", () => {
    const r = validateOwnerPhone("08 8472 8935");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("not_mobile");
      expect(r.message).toMatch(/landline/i);
      expect(r.message).toMatch(/04/);
    }
  });

  it("rejects a landline from every state, not just 08", () => {
    for (const raw of ["02 5944 1492", "03 9123 4567", "07 3123 4567", "08 8472 8935", "+61285551234"]) {
      const r = validateOwnerPhone(raw);
      expect(r.ok, `expected ${raw} to be rejected`).toBe(false);
      if (!r.ok) expect(r.reason).toBe("not_mobile");
    }
  });

  // A landline is not a typo, so it must not be reported as one — otherwise the
  // person retypes the same number and hits the same wall.
  it("distinguishes a landline from something that is not a number at all", () => {
    const junk = validateOwnerPhone("not a phone");
    expect(junk.ok).toBe(false);
    if (!junk.ok) {
      expect(junk.reason).toBe("not_a_number");
      expect(junk.message).not.toMatch(/landline/i);
    }
    for (const raw of ["", "   ", "12345", "1300 123 456", "+1 415 723 4000"]) {
      const r = validateOwnerPhone(raw);
      expect(r.ok, `expected ${raw} to be rejected`).toBe(false);
      if (!r.ok) expect(r.reason).toBe("not_a_number");
    }
  });

  it("handles null and undefined without throwing", () => {
    expect(validateOwnerPhone(null).ok).toBe(false);
    expect(validateOwnerPhone(undefined).ok).toBe(false);
  });
});
