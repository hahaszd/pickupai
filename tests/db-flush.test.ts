import { describe, it, expect } from "vitest";
import { mkdir, rm } from "node:fs/promises";
import { openDb, type FlushInfo } from "../src/db/db.js";

function tmpPath(name: string) {
  return `.tmp/test-flush-${name}-${process.hrtime.bigint()}.sqlite`;
}

describe("db.flush durability", () => {
  it("a flush queued while another is running still persists the newer write", async () => {
    // Regression test. The previous implementation guarded with
    // `if (flushing) return`, so a second flush resolved immediately without
    // writing — handing the caller a durability promise it had not kept. That
    // is exactly the guarantee critical writes rely on (docs/adr/0002).
    const path = tmpPath("concurrent");
    const db = await openDb(path);

    db.run("INSERT INTO system_config (key, value, updated_at) VALUES (?, ?, datetime('now'))", ["first", "1"]);
    const firstFlush = db.flush();

    // Written while firstFlush is mid-write, then flushed again.
    db.run("INSERT INTO system_config (key, value, updated_at) VALUES (?, ?, datetime('now'))", ["second", "2"]);
    const secondFlush = db.flush();

    await Promise.all([firstFlush, secondFlush]);

    // Reopen from disk — only durable data survives.
    const reopened = await openDb(path);
    expect(reopened.get("SELECT value FROM system_config WHERE key = ?", ["first"])?.value).toBe("1");
    expect(reopened.get("SELECT value FROM system_config WHERE key = ?", ["second"])?.value).toBe("2");

    await rm(path, { force: true });
  });

  it("awaiting flush persists the write that preceded it", async () => {
    const path = tmpPath("await");
    const db = await openDb(path);

    db.run("INSERT INTO system_config (key, value, updated_at) VALUES (?, ?, datetime('now'))", ["lead", "saved"]);
    await db.flush();

    const reopened = await openDb(path);
    expect(reopened.get("SELECT value FROM system_config WHERE key = ?", ["lead"])?.value).toBe("saved");

    await rm(path, { force: true });
  });

  // This test asserted recovery from a failing flush without ever inducing one:
  // it flushed successfully twice and passed. The behaviour it names — one
  // transient Neon blip must not stop all future persistence — could have been
  // deleted outright and it stayed green.
  //
  // Mutation-checked 2026-07-29, and the check corrected a wrong assumption
  // worth recording. flushNow() guards the chain TWICE over:
  //   const run = (inFlight ?? Promise.resolve()).then(writeOut, writeOut);
  //   inFlight = run.catch(() => {});
  // Either one alone is sufficient — passing writeOut as the rejection handler
  // already consumes a failed predecessor, and .catch() already hands the chain
  // a resolved promise. Removing either leaves this test green; removing both
  // fails it with EISDIR on the recovery flush. So the assertion is real, and
  // the redundancy is real too: no single line here is load-bearing, which is
  // exactly why a line-by-line mutation check would have called this untested.
  it("a failing flush does not wedge the queue for later flushes", async () => {
    const path = tmpPath("recover");
    const db = await openDb(path);

    db.run("INSERT INTO system_config (key, value, updated_at) VALUES (?, ?, datetime('now'))", ["a", "1"]);
    await db.flush();

    // Induce a real failure: a directory where the blob file goes, so the
    // write rejects with EISDIR. Standing in for the transient Postgres
    // failure this guard exists for, which a unit test cannot produce.
    await rm(path, { force: true });
    await mkdir(path, { recursive: true });

    db.run("INSERT INTO system_config (key, value, updated_at) VALUES (?, ?, datetime('now'))", ["b", "2"]);
    await expect(db.flush()).rejects.toThrow();

    // The queue must not be wedged. Clear the obstruction and flush again —
    // this is the assertion the old test claimed to make.
    await rm(path, { recursive: true, force: true });
    db.run("INSERT INTO system_config (key, value, updated_at) VALUES (?, ?, datetime('now'))", ["c", "3"]);
    await expect(db.flush()).resolves.toBeUndefined();

    // And the write made DURING the failed flush is still there — it lives in
    // memory, so the next successful flush carries it.
    const reopened = await openDb(path);
    expect(reopened.get("SELECT value FROM system_config WHERE key = ?", ["b"])?.value).toBe("2");
    expect(reopened.get("SELECT value FROM system_config WHERE key = ?", ["c"])?.value).toBe("3");

    await rm(path, { force: true });
  });
});

describe("flush instrumentation", () => {
  it("reports blob size and duration on every flush", async () => {
    // These two numbers are the migration trigger in docs/adr/0001; if they
    // stop being reported the deferral loses its exit signal.
    const path = tmpPath("instrument");
    const seen: FlushInfo[] = [];
    const db = await openDb(path, undefined, { onFlush: (info) => seen.push(info) });

    db.run("INSERT INTO system_config (key, value, updated_at) VALUES (?, ?, datetime('now'))", ["k", "v"]);
    await db.flush();

    expect(seen.length).toBeGreaterThanOrEqual(1);
    expect(seen[0].bytes).toBeGreaterThan(0);
    expect(seen[0].durationMs).toBeGreaterThanOrEqual(0);

    await rm(path, { force: true });
  });
});
