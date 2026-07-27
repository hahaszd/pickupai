import { describe, it, expect } from "vitest";
import { isGsm7, toGsm7, smsCost } from "../src/sms/gsm7.js";

describe("smsCost", () => {
  it("counts a short ASCII message as one segment", () => {
    expect(smsCost("Short message")).toMatchObject({ encoding: "GSM-7", segments: 1 });
  });

  it("switches to UCS-2 on a single non-GSM-7 character", () => {
    // The whole reason this module exists.
    expect(smsCost("Plain ascii").encoding).toBe("GSM-7");
    expect(smsCost("Plain ascii — with an em dash").encoding).toBe("UCS-2");
  });

  it("shows the real cost of one em dash", () => {
    // Measured against a live owner notification: 285 ASCII characters is 2
    // segments; the same message with one em dash is 5.
    const ascii = "x".repeat(285);
    const withDash = "x".repeat(284) + "—";
    expect(smsCost(ascii).segments).toBe(2);
    expect(smsCost(withDash).segments).toBe(5);
  });

  it("charges two characters for GSM-7 extension characters", () => {
    expect(smsCost("[]").characters).toBe(4);
  });

  it("reports zero segments for an empty message", () => {
    expect(smsCost("").segments).toBe(0);
  });

  it("uses 160 for a single segment and 153 once concatenated", () => {
    expect(smsCost("a".repeat(160)).segments).toBe(1);
    expect(smsCost("a".repeat(161)).segments).toBe(2);
    expect(smsCost("a".repeat(306)).segments).toBe(2);
    expect(smsCost("a".repeat(307)).segments).toBe(3);
  });
});

describe("toGsm7", () => {
  it("leaves an already-safe message untouched", () => {
    const s = "NEW JOB (EMERGENCY):\nDave Cornish  0412 345 678\nBurst pipe.";
    expect(toGsm7(s)).toBe(s);
  });

  it("replaces the punctuation a language model reaches for", () => {
    expect(toGsm7("water everywhere — needs someone today")).toBe("water everywhere - needs someone today");
    expect(toGsm7("the tap’s dripping")).toBe("the tap's dripping");
    expect(toGsm7("“burst pipe”")).toBe('"burst pipe"');
    expect(toGsm7("hang on…")).toBe("hang on...");
  });

  it("strips invisible characters that cost budget and show nothing", () => {
    expect(toGsm7("a​b﻿c")).toBe("abc");
  });

  it("normalises spaces that are not spaces", () => {
    expect(toGsm7("a b c")).toBe("a b c");
  });

  it("keeps the accented characters GSM-7 can carry", () => {
    // é and ü are in the GSM-7 alphabet; losing them would be a regression.
    expect(toGsm7("café über")).toBe("café über");
  });

  it("strips diacritics it cannot carry rather than dropping the letter", () => {
    expect(toGsm7("Grzegorz Brzęczyszczykiewicz")).toContain("Brzeczyszczykiewicz");
  });

  it("drops a character with no sensible substitute", () => {
    // One emoji costing 56% of the message's capacity is worse than losing it.
    expect(toGsm7("done 🎉")).toBe("done ");
    expect(isGsm7(toGsm7("done 🎉"))).toBe(true);
  });

  it("always returns something GSM-7 encodable", () => {
    const nasty = "— ’ “ … • ½ ° → 🎉 ​   ñ ć";
    expect(isGsm7(toGsm7(nasty))).toBe(true);
  });
});
