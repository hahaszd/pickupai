import { describe, it, expect, vi, afterEach } from "vitest";

/**
 * Warm transfer read the GLOBAL BUSINESS_HOURS_* env vars, which are seed values
 * for the first tenant. A Perth business would have been transferred on Sydney's
 * clock — three hours out — and a tenant who set 07:00–15:00 in their dashboard
 * would have been ignored entirely. Invisible with one tenant; wrong for the
 * second.
 *
 * tests/setup-env.ts pins the global values, so these assert the tenant's own
 * columns win rather than that any particular hour is right.
 */
// ENABLE_WARM_TRANSFER defaults to false, so the function short-circuits before
// it ever looks at the hours. Turning it on is what puts the code under test.
async function atUtc(iso: string) {
  process.env.ENABLE_WARM_TRANSFER = "true";
  process.env.WARM_TRANSFER_ONLY_DURING_BUSINESS_HOURS = "true";
  vi.useFakeTimers();
  vi.setSystemTime(new Date(iso));
  vi.resetModules();
  return (await import("../src/twilio/flow.js")).shouldWarmTransferNow;
}

afterEach(() => {
  vi.useRealTimers();
  delete process.env.ENABLE_WARM_TRANSFER;
  delete process.env.WARM_TRANSFER_ONLY_DURING_BUSINESS_HOURS;
  vi.resetModules();
});

const SYD = { business_hours_start: "08:00", business_hours_end: "17:00", timezone: "Australia/Sydney" };
const PER = { business_hours_start: "08:00", business_hours_end: "17:00", timezone: "Australia/Perth" };

describe("warm transfer uses the tenant's own hours", () => {
  // 2026-08-04 01:00 UTC = 11:00 Sydney (AEST, open) = 09:00 Perth (AWST, open)
  // 2026-08-03 23:00 UTC = 09:00 Sydney (open)       = 07:00 Perth (CLOSED)
  it("a Perth tenant is closed when Sydney is open", async () => {
    const should = await atUtc("2026-08-03T23:00:00.000Z");
    expect(should(SYD), "Sydney 09:00 should be open").toBe(true);
    expect(should(PER), "Perth 07:00 should be closed").toBe(false);
  });

  it("both are open in the overlapping middle of the day", async () => {
    const should = await atUtc("2026-08-04T01:00:00.000Z");
    expect(should(SYD)).toBe(true);
    expect(should(PER)).toBe(true);
  });

  // A tenant who narrows their hours in the dashboard was being ignored.
  it("respects a tenant's own start and end times", async () => {
    const should = await atUtc("2026-08-04T06:00:00.000Z"); // 16:00 Sydney
    expect(should(SYD), "16:00 is inside 08:00-17:00").toBe(true);
    expect(
      should({ ...SYD, business_hours_end: "15:00" }),
      "16:00 is outside a tenant's own 08:00-15:00"
    ).toBe(false);
  });

  it("falls back to the env values when no tenant is resolved", async () => {
    const should = await atUtc("2026-08-04T01:00:00.000Z");
    // Should not throw and should return a boolean — the no-tenant path is real
    // (a call arriving on a number that matches nothing).
    expect(typeof should()).toBe("boolean");
    expect(typeof should({})).toBe("boolean");
  });
  // The switch itself, so the tests above cannot pass because the feature is
  // simply off — which is exactly how they failed the first time.
  it("is off entirely when the feature switch is off", async () => {
    process.env.ENABLE_WARM_TRANSFER = "false";
    vi.resetModules();
    const { shouldWarmTransferNow } = await import("../src/twilio/flow.js");
    expect(shouldWarmTransferNow(SYD)).toBe(false);
  });

  it("ignores the clock when the business-hours restriction is off", async () => {
    process.env.ENABLE_WARM_TRANSFER = "true";
    process.env.WARM_TRANSFER_ONLY_DURING_BUSINESS_HOURS = "false";
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-04T18:00:00.000Z")); // 04:00 Sydney
    vi.resetModules();
    const { shouldWarmTransferNow } = await import("../src/twilio/flow.js");
    expect(shouldWarmTransferNow(SYD)).toBe(true);
  });
});
