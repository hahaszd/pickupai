/**
 * Nearest-rank percentile.
 *
 * Lives here rather than inline in server.ts so it can be tested: server.ts
 * calls main() on import, so anything defined there is unreachable from a unit
 * test. A percentile that is quietly wrong makes the alert that depends on it
 * useless without ever failing loudly.
 */
export function percentile(samples: number[], p: number): number {
  if (samples.length === 0) return 0;
  const sorted = [...samples].sort((a, b) => a - b);
  const rank = Math.ceil(sorted.length * p);
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank - 1))];
}

export const p95 = (samples: number[]): number => percentile(samples, 0.95);
