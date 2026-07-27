import { describe, it, expect } from "vitest";
import { percentile, p95 } from "../src/utils/stats.js";

describe("percentile", () => {
  it("returns 0 for an empty sample", () => {
    expect(percentile([], 0.95)).toBe(0);
  });

  it("returns the only value for a single sample", () => {
    expect(percentile([42], 0.95)).toBe(42);
  });

  it("does not care about input order", () => {
    expect(percentile([9, 1, 5, 3, 7], 0.5)).toBe(percentile([1, 3, 5, 7, 9], 0.5));
  });

  it("does not mutate the caller's array", () => {
    // The rolling window in server.ts is reused between flushes; sorting it in
    // place would silently reorder the history.
    const samples = [5, 1, 3];
    percentile(samples, 0.95);
    expect(samples).toEqual([5, 1, 3]);
  });

  it("uses nearest-rank: p95 of 1..100 is 95", () => {
    const samples = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(p95(samples)).toBe(95);
  });

  it("never reads past the end of the sample", () => {
    expect(p95([1, 2])).toBe(2);
    expect(p95([1])).toBe(1);
  });
});

describe("p95 against the flush-alert threshold", () => {
  const THRESHOLD = 1000;

  it("one slow flush among fast ones does not trip the threshold", () => {
    // This is the whole point of moving from a single sample to p95: the first
    // flush after a deploy carries Neon connection setup and a free-tier
    // wake-up, and used to fire an alert on every single deploy.
    const samples = [...Array(49).fill(120), 1282];
    expect(p95(samples)).toBeLessThan(THRESHOLD);
  });

  it("a sustained slowdown does trip it", () => {
    const samples = [...Array(20).fill(200), ...Array(30).fill(1400)];
    expect(p95(samples)).toBeGreaterThan(THRESHOLD);
  });

  it("a handful of slow flushes in a healthy window still trips at p95", () => {
    // 5% of 50 is enough to reach the 95th percentile — a real degradation
    // shows up here well before the median moves.
    const samples = [...Array(45).fill(150), ...Array(5).fill(1500)];
    expect(p95(samples)).toBeGreaterThan(THRESHOLD);
  });
});
