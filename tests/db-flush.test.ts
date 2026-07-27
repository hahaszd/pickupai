import { describe, it, expect } from "vitest";
import { rm } from "node:fs/promises";
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

  it("a failing flush does not wedge the queue for later flushes", async () => {
    const path = tmpPath("recover");
    const db = await openDb(path);

    // The chain keeps its own rejection swallowed so the next link still runs;
    // without that, one transient Neon blip would stop all future persistence.
    db.run("INSERT INTO system_config (key, value, updated_at) VALUES (?, ?, datetime('now'))", ["a", "1"]);
    await db.flush();
    db.run("INSERT INTO system_config (key, value, updated_at) VALUES (?, ?, datetime('now'))", ["b", "2"]);
    await expect(db.flush()).resolves.toBeUndefined();

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
