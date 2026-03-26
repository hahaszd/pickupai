import { describe, it, expect } from "vitest";
import { isWithinHours } from "../src/utils/time.js";

describe("isWithinHours", () => {
  it("returns true when current time is within business hours", () => {
    const result = isWithinHours({
      startHHMM: "08:00",
      endHHMM: "17:00",
      now: new Date("2026-03-25T10:00:00")
    });
    expect(result).toBe(true);
  });

  it("returns false when current time is before business hours", () => {
    const result = isWithinHours({
      startHHMM: "08:00",
      endHHMM: "17:00",
      now: new Date("2026-03-25T06:30:00")
    });
    expect(result).toBe(false);
  });

  it("returns false when current time is after business hours", () => {
    const result = isWithinHours({
      startHHMM: "08:00",
      endHHMM: "17:00",
      now: new Date("2026-03-25T20:00:00")
    });
    expect(result).toBe(false);
  });

  it("returns true at exactly the start of business hours", () => {
    const result = isWithinHours({
      startHHMM: "08:00",
      endHHMM: "17:00",
      now: new Date("2026-03-25T08:00:00")
    });
    expect(result).toBe(true);
  });

  it("returns false at exactly the end of business hours", () => {
    const result = isWithinHours({
      startHHMM: "08:00",
      endHHMM: "17:00",
      now: new Date("2026-03-25T17:00:00")
    });
    expect(result).toBe(false);
  });

  it("handles overnight window (e.g. 22:00-06:00)", () => {
    expect(isWithinHours({
      startHHMM: "22:00",
      endHHMM: "06:00",
      now: new Date("2026-03-25T23:00:00")
    })).toBe(true);

    expect(isWithinHours({
      startHHMM: "22:00",
      endHHMM: "06:00",
      now: new Date("2026-03-25T03:00:00")
    })).toBe(true);

    expect(isWithinHours({
      startHHMM: "22:00",
      endHHMM: "06:00",
      now: new Date("2026-03-25T12:00:00")
    })).toBe(false);
  });

  it("returns true when start equals end (24h operation)", () => {
    const result = isWithinHours({
      startHHMM: "09:00",
      endHHMM: "09:00",
      now: new Date("2026-03-25T03:00:00")
    });
    expect(result).toBe(true);
  });

  it("returns true for invalid time format (defaults to always open)", () => {
    const result = isWithinHours({
      startHHMM: "bad",
      endHHMM: "17:00",
      now: new Date("2026-03-25T10:00:00")
    });
    expect(result).toBe(true);
  });

  it("respects timezone parameter (UTC midnight is 11am AEDT)", () => {
    const utcMidnight = new Date("2026-03-25T00:00:00Z");
    const result = isWithinHours({
      startHHMM: "08:00",
      endHHMM: "17:00",
      timeZone: "Australia/Sydney",
      now: utcMidnight
    });
    expect(result).toBe(true);
  });

  it("handles midnight (00:00) correctly in overnight window", () => {
    const result = isWithinHours({
      startHHMM: "22:00",
      endHHMM: "06:00",
      now: new Date("2026-03-25T00:00:00")
    });
    expect(result).toBe(true);
  });

  it("falls back to server time for invalid timezone", () => {
    const result = isWithinHours({
      startHHMM: "00:00",
      endHHMM: "23:59",
      timeZone: "Mars/Olympus",
      now: new Date("2026-03-25T12:00:00")
    });
    expect(result).toBe(true);
  });
});
