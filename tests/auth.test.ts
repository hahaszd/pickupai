import { describe, it, expect, vi } from "vitest";
import { rm } from "node:fs/promises";
import type { Request, Response, NextFunction } from "express";

/**
 * Two guards that had ZERO test references anywhere, and both were proven
 * deletable with the whole suite green:
 *
 *   - the password check in tenantLogin — anyone with a tradie's email address
 *     gets their leads, addresses and customers' phone numbers;
 *   - the entire Twilio signature check — CLAUDE.md lists
 *     TWILIO_VALIDATE_SIGNATURE=true in production under Hard constraints, and
 *     CODING_STANDARDS says an unguarded webhook is spoofable by anyone who
 *     learns the URL. Forged calls, fabricated leads, injected transcripts.
 */

describe("tenant login and session", () => {
  it("rejects a wrong password, issues a token on the right one, and drops it on logout", async () => {
    const { openDb } = await import("../src/db/db.js");
    const { createTenant, tenantLogin, tenantLogout, getTenantBySessionToken } =
      await import("../src/db/repo.js");

    const sqlitePath = `.tmp/test-auth-${Date.now()}.sqlite`;
    const db = await openDb(sqlitePath);

    const tenant = createTenant(db, {
      name: "Auth Test", trade_type: "plumber", twilio_number: "+61400000888",
      owner_phone: "+61488888880", owner_email: "auth@test.local", password: "correct-horse"
    });

    expect(tenantLogin(db, "auth@test.local", "wrong-password")).toBeNull();
    expect(tenantLogin(db, "auth@test.local", "")).toBeNull();
    expect(tenantLogin(db, "nobody@test.local", "correct-horse")).toBeNull();
    // Near-misses, because a check that compares prefixes would pass the above.
    expect(tenantLogin(db, "auth@test.local", "correct-horse ")).toBeNull();
    expect(tenantLogin(db, "auth@test.local", "correct-hors")).toBeNull();

    const session = tenantLogin(db, "auth@test.local", "correct-horse");
    expect(session).not.toBeNull();
    expect(session!.session_token).toBeTruthy();

    const token = session!.session_token!;
    expect(getTenantBySessionToken(db, token)?.tenant_id).toBe(tenant.tenant_id);
    expect(getTenantBySessionToken(db, "not-a-real-token")).toBeNull();

    tenantLogout(db, tenant.tenant_id);
    expect(getTenantBySessionToken(db, token)).toBeNull();

    await db.flush();
    await rm(sqlitePath, { force: true });
  });

  // A cancelled or deactivated tenant keeping a working dashboard session is
  // the failure the `AND active = 1` clause exists to prevent, and nothing
  // asserted it. The cookie's Max-Age is client-side only, so this clause is
  // the whole server-side revocation story.
  it("stops resolving a live session as soon as the tenant is deactivated", async () => {
    const { openDb } = await import("../src/db/db.js");
    const { createTenant, tenantLogin, getTenantBySessionToken } =
      await import("../src/db/repo.js");

    const sqlitePath = `.tmp/test-auth-active-${Date.now()}.sqlite`;
    const db = await openDb(sqlitePath);
    const tenant = createTenant(db, {
      name: "Deactivate Test", trade_type: "roofer", twilio_number: "+61400000889",
      owner_phone: "+61488888881", owner_email: "deact@test.local", password: "pw-deact"
    });

    const token = tenantLogin(db, "deact@test.local", "pw-deact")!.session_token!;
    expect(getTenantBySessionToken(db, token)).not.toBeNull();

    db.run("UPDATE tenants SET active = 0 WHERE tenant_id = ?", [tenant.tenant_id]);
    expect(getTenantBySessionToken(db, token)).toBeNull();
    expect(tenantLogin(db, "deact@test.local", "pw-deact")).toBeNull();

    await db.flush();
    await rm(sqlitePath, { force: true });
  });
});

describe("Twilio signature verification", () => {
  const AUTH_TOKEN = "test-auth-token-not-a-real-secret";
  const BASE = "https://example.test";
  const PATH = "/twilio/voice/incoming";
  const BODY = { CallSid: "CA123", From: "+61412345678", To: "+61400000000" };

  function call(headers: Record<string, string>, enabled = true) {
    const req = {
      header: (n: string) => headers[n],
      originalUrl: PATH,
      body: BODY
    } as unknown as Request;
    const res = {
      status: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis()
    } as unknown as Response & { status: ReturnType<typeof vi.fn>; send: ReturnType<typeof vi.fn> };
    const next = vi.fn() as unknown as NextFunction;
    return { req, res: res as any, next: next as any };
  }

  it("401s with no signature, 403s with a wrong one, and calls next() on a valid one", async () => {
    const { twilioValidateMiddleware } = await import("../src/twilio/verify.js");
    const twilio = (await import("twilio")).default;
    const mw = twilioValidateMiddleware({ authToken: AUTH_TOKEN, enabled: true, publicBaseUrl: BASE });

    const missing = call({});
    mw(missing.req, missing.res, missing.next);
    expect(missing.res.status).toHaveBeenCalledWith(401);
    expect(missing.next).not.toHaveBeenCalled();

    const wrong = call({ "X-Twilio-Signature": "obviously-not-a-signature" });
    mw(wrong.req, wrong.res, wrong.next);
    expect(wrong.res.status).toHaveBeenCalledWith(403);
    expect(wrong.next).not.toHaveBeenCalled();

    // A signature Twilio itself would have produced for this exact URL + body.
    const good = twilio.getExpectedTwilioSignature(AUTH_TOKEN, `${BASE}${PATH}`, BODY);
    const valid = call({ "X-Twilio-Signature": good });
    mw(valid.req, valid.res, valid.next);
    expect(valid.next).toHaveBeenCalled();
    expect(valid.res.status).not.toHaveBeenCalled();
  });

  it("rejects a signature that is valid for a different body", async () => {
    const { twilioValidateMiddleware } = await import("../src/twilio/verify.js");
    const twilio = (await import("twilio")).default;
    const mw = twilioValidateMiddleware({ authToken: AUTH_TOKEN, enabled: true, publicBaseUrl: BASE });

    // Signed for a different caller — the replay an attacker would attempt.
    const sig = twilio.getExpectedTwilioSignature(AUTH_TOKEN, `${BASE}${PATH}`, {
      ...BODY, From: "+61499999999"
    });
    const c = call({ "X-Twilio-Signature": sig });
    mw(c.req, c.res, c.next);
    expect(c.res.status).toHaveBeenCalledWith(403);
    expect(c.next).not.toHaveBeenCalled();
  });

  // Off by default is deliberate for local dev; pinned so that turning it off
  // is a visible choice rather than something that quietly stops working.
  it("passes everything through when disabled", async () => {
    const { twilioValidateMiddleware } = await import("../src/twilio/verify.js");
    const mw = twilioValidateMiddleware({ authToken: AUTH_TOKEN, enabled: false, publicBaseUrl: BASE });
    const c = call({});
    mw(c.req, c.res, c.next);
    expect(c.next).toHaveBeenCalled();
    expect(c.res.status).not.toHaveBeenCalled();
  });
});
