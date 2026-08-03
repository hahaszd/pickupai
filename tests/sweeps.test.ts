import { describe, it, expect } from "vitest";
import { rm } from "node:fs/promises";

/**
 * The two background sweeps ran on every instance, on an interval, with their
 * queries inside `main()` where no test could reach them.
 *
 * The number-release one is the most consequential piece of code in the
 * product: **releasing a Twilio number is irreversible and it is the tradie's
 * business phone.** A wrong row does not lose a lead, it loses the number his
 * customers ring. The Twilio call is thin; the query is the whole risk.
 */

async function fixture(name: string) {
  const { openDb } = await import("../src/db/db.js");
  const repo = await import("../src/db/repo.js");
  const path = `.tmp/test-sweep-${name}-${Date.now()}.sqlite`;
  const db = await openDb(path);

  let n = 0;
  const make = (over: Record<string, unknown>) => {
    n++;
    const t = repo.createTenant(db, {
      name: `T${n}`, trade_type: "plumber",
      twilio_number: (over.twilio_number as string) ?? `+6140000${String(1000 + n)}`,
      owner_phone: `+61400${String(100000 + n)}`,
      owner_email: `t${n}@test.local`, password: "pw"
    });
    const { twilio_number: _tn, ...rest } = over;
    if (Object.keys(rest).length) repo.updateTenant(db, t.tenant_id, rest as never);
    return t.tenant_id;
  };
  return { db, path, repo, make };
}

describe("trial-expiry sweep: which tenants get flipped", () => {
  it("picks only active trials whose end date has passed", async () => {
    const { db, path, repo, make } = await fixture("trial");
    const NOW = "2026-08-04T00:00:00.000Z";

    const due = make({ payment_status: "trial", trial_ends_at: "2026-08-03T00:00:00.000Z" });
    make({ payment_status: "trial", trial_ends_at: "2026-08-05T00:00:00.000Z" });      // not yet
    make({ payment_status: "trial", trial_ends_at: null });                             // no end date
    make({ payment_status: "active", trial_ends_at: "2026-08-03T00:00:00.000Z" });      // paying
    make({ payment_status: "trial", trial_ends_at: "2026-08-03T00:00:00.000Z", active: 0 }); // deactivated

    expect(repo.findExpiredTrials(db, NOW).map((t) => t.tenant_id)).toEqual([due]);
    await db.flush();
    await rm(path, { force: true });
  });

  // The sweep runs on an interval, so an off-by-one on the comparison means a
  // tenant flips a cycle early or never flips at all.
  it("is strictly less-than, so a tenant is not expired on the instant it ends", async () => {
    const { db, path, repo, make } = await fixture("trial-boundary");
    const ENDS = "2026-08-04T00:00:00.000Z";
    make({ payment_status: "trial", trial_ends_at: ENDS });

    expect(repo.findExpiredTrials(db, ENDS)).toHaveLength(0);
    expect(repo.findExpiredTrials(db, "2026-08-04T00:00:00.001Z")).toHaveLength(1);
    await db.flush();
    await rm(path, { force: true });
  });
});

describe("number-release sweep: whose phone number gets released", () => {
  it("never picks a tenant who is still paying", async () => {
    const { db, path, repo, make } = await fixture("release-paying");
    const CUTOFF = "2026-08-04T00:00:00.000Z";
    const OLD = "2026-07-01T00:00:00.000Z";

    // The one thing that must never happen.
    make({ payment_status: "active", expired_at: OLD });
    make({ payment_status: "trial", expired_at: OLD });

    expect(repo.findNumbersDueForRelease(db, CUTOFF)).toEqual([]);
    await db.flush();
    await rm(path, { force: true });
  });

  it("picks an expired tenant past the grace window, and only that one", async () => {
    const { db, path, repo, make } = await fixture("release-pick");
    // CUTOFF is already grace-adjusted by the caller (now minus the grace days),
    // so "inside the grace window" means expired_at is AFTER it. My first
    // version of this test used a date before the cutoff, called it "inside
    // grace", and read the correct result as a bug in the query.
    const CUTOFF = "2026-08-04T00:00:00.000Z";
    const OLD = "2026-07-01T00:00:00.000Z";
    const STILL_IN_GRACE = "2026-08-05T00:00:00.000Z";

    const due = make({ payment_status: "expired", expired_at: OLD });
    make({ payment_status: "trial_expired", expired_at: STILL_IN_GRACE });
    make({ payment_status: "expired", expired_at: null });                            // never stamped
    make({ payment_status: "expired", expired_at: OLD, number_released_at: OLD });    // already done
    make({ payment_status: "expired", expired_at: OLD, twilio_number: "+PENDING_9" });
    make({ payment_status: "expired", expired_at: OLD, twilio_number: "+RELEASED-61400000999-1" });

    expect(repo.findNumbersDueForRelease(db, CUTOFF).map((t) => t.tenant_id)).toEqual([due]);
    await db.flush();
    await rm(path, { force: true });
  });

  // CLAUDE.md: these jobs run on EVERY instance and must be idempotent. The
  // number_released_at stamp is the only thing making that true.
  it("does not pick the same tenant twice once stamped", async () => {
    const { db, path, repo, make } = await fixture("release-idempotent");
    const CUTOFF = "2026-08-04T00:00:00.000Z";
    const id = make({ payment_status: "expired", expired_at: "2026-07-01T00:00:00.000Z" });

    expect(repo.findNumbersDueForRelease(db, CUTOFF)).toHaveLength(1);
    repo.updateTenant(db, id, { number_released_at: new Date().toISOString() } as never);
    expect(repo.findNumbersDueForRelease(db, CUTOFF)).toHaveLength(0);
    await db.flush();
    await rm(path, { force: true });
  });

  it("stamps the released number so it stays readable and stays unique", async () => {
    const { repo } = await fixture("stamp");
    const stamped = repo.releasedNumberStamp("+61280000796", 1754265600000);
    expect(stamped).toBe("+RELEASED-61280000796-1754265600000");
    // The original must survive a report reading it back.
    expect(stamped).toContain("61280000796");
    // And a second release of the same number must not collide.
    expect(repo.releasedNumberStamp("+61280000796", 1754265600001)).not.toBe(stamped);
    // It must not still match the LIKE filters that pick candidates.
    expect(stamped.startsWith("+RELEASED")).toBe(true);
  });
});
