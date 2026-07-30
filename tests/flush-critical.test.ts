import { describe, it, expect, vi } from "vitest";
import { makeFlushCritical } from "../src/db/flush-critical.js";
import type { Db } from "../src/db/db.js";

/**
 * ADR-0002's guarantee, which had no test at all: the whole body could be
 * replaced with `void db; void what;` and 401 tests stayed green.
 *
 * Extracting the save_lead handler did not close this. That extraction proves
 * persistLeadPatch calls whatever it is handed, and its test hands it a
 * vi.fn() — so the wiring was covered and the thing being wired was not. Two
 * layers of indirection, one of them still unfalsifiable.
 */
describe("flushCritical", () => {
  it("starts the flush synchronously, before returning", () => {
    const flush = vi.fn().mockResolvedValue(undefined);
    const log = { error: vi.fn() };
    makeFlushCritical(log)({ flush } as unknown as Db, "save_lead");
    // Synchronously: the Realtime callback is void-returning and cannot await,
    // so a flush deferred to a later tick can be lost to a SIGKILL that arrives
    // in between — which is the whole scenario ADR-0002 is about.
    expect(flush).toHaveBeenCalledTimes(1);
  });

  // This returns void into a callback the Realtime session invokes mid-call. An
  // uncaught rejection there takes the process down while someone is on the
  // phone — losing the call as well as the write.
  it("catches a rejected flush instead of letting it become unhandled", async () => {
    const boom = new Error("neon is down");
    const flush = vi.fn().mockRejectedValue(boom);
    const log = { error: vi.fn() };

    const unhandled: unknown[] = [];
    const onUnhandled = (e: unknown) => unhandled.push(e);
    process.on("unhandledRejection", onUnhandled);
    try {
      expect(() => makeFlushCritical(log)({ flush } as unknown as Db, "save_lead")).not.toThrow();
      await new Promise((r) => setImmediate(r));
      await new Promise((r) => setImmediate(r));
      expect(unhandled).toEqual([]);
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }

    // And it must still be LOUD. A silent swallow is how a persistent Postgres
    // failure goes unnoticed for a week while every lead is lost on restart.
    expect(log.error).toHaveBeenCalledTimes(1);
    expect(log.error.mock.calls[0][0]).toMatchObject({ err: boom, what: "save_lead" });
  });
});
