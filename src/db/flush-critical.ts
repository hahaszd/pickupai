import type { Db } from "./db.js";

/**
 * Persist a critical write now rather than waiting out the 300 ms debounce
 * (docs/adr/0002). Prefer `await db.flush()` directly where the call site is
 * async; this exists for the realtime tool-call callbacks, which are synchronous
 * and `void`-returning, so the best available there is to start the flush
 * immediately and log failures.
 *
 * It lived in server.ts, which calls `main()` on import and is therefore
 * unreachable from a test — and the whole body could be replaced with
 * `void db; void what;` with all 401 tests green. Extracting `onLeadUpdate` did
 * NOT close that: the extraction proves `persistLeadPatch` calls whatever it is
 * handed, and a test that injects `vi.fn()` says nothing about the real thing.
 *
 * What must hold, and had no coverage:
 *   - flush() is actually called, synchronously, before returning;
 *   - a rejected flush is caught, because this returns void into a callback
 *     the Realtime session invokes and an unhandled rejection there takes the
 *     process down mid-call;
 *   - and it is still LOGGED, because a silent swallow is how a persistent
 *     Postgres failure would go unnoticed for a week.
 */
export function makeFlushCritical(log: { error: (o: unknown, m: string) => void }) {
  return function flushCritical(db: Db, what: string): void {
    db.flush().catch((err) => log.error({ err, what }, "critical write flush failed"));
  };
}
