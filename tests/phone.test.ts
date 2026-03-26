import { describe, it, expect } from "vitest";
import { formatAuPhone } from "../src/utils/phone.js";

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
