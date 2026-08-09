import { describe, it, expect } from "vitest";
import {
  emailPreSendCheck,
  buildMarketingEmail,
  auditMarketingEmail,
  unsubscribeToken,
  verifyUnsubscribeToken,
  BLOCK_REASONS,
  type SenderIdentity,
} from "../src/outreach/email-compliance.js";

const SENDER: SenderIdentity = {
  legalName: "Example Pty Ltd",
  tradingName: "PickupAI",
  abn: "12 345 678 901",
  contactEmail: "hello@example.com.au",
  contactPhone: "+61 2 8000 0000",
  postalAddress: "PO Box 1, Sydney NSW 2000",
};

const SECRET = "test-secret-not-a-real-one";
const URL = "https://example.com.au/u/abc.def";

describe("emailPreSendCheck — the gate", () => {
  it("passes a clean prospect", () => {
    expect(emailPreSendCheck({ prospect_id: "p1", email: "a@b.com.au" })).toEqual({ ok: true });
  });

  // The whole reason suppression lives on `unsubscribed_at` and not on a
  // channel-specific column: the SMS STOP handler stamps it, and an opt-out is
  // cross-channel. Someone who texted STOP must never receive an email.
  it("blocks anyone who opted out on ANY channel", () => {
    const r = emailPreSendCheck({
      prospect_id: "p1",
      email: "a@b.com.au",
      unsubscribed_at: "2026-01-01T00:00:00Z",
    });
    expect(r).toEqual({ ok: false, reason: BLOCK_REASONS.UNSUBSCRIBED });
  });

  it("blocks do_not_contact and not_interested", () => {
    expect(emailPreSendCheck({ prospect_id: "p", email: "a@b.com.au", status: "do_not_contact" }))
      .toEqual({ ok: false, reason: BLOCK_REASONS.DO_NOT_CONTACT });
    expect(emailPreSendCheck({ prospect_id: "p", email: "a@b.com.au", status: "not_interested" }))
      .toEqual({ ok: false, reason: BLOCK_REASONS.NOT_INTERESTED });
  });

  it("blocks missing and malformed addresses", () => {
    expect(emailPreSendCheck({ prospect_id: "p" }).ok).toBe(false);
    expect(emailPreSendCheck({ prospect_id: "p", email: "   " }).ok).toBe(false);
    for (const bad of ["notanemail", "a@b", "a b@c.com", "a@b.com,c@d.com", "<a@b.com>"]) {
      expect(emailPreSendCheck({ prospect_id: "p", email: bad }), bad).toEqual({
        ok: false,
        reason: BLOCK_REASONS.MALFORMED_EMAIL,
      });
    }
  });

  // The 2026-08-10 evidence run surfaced `donotreply@reece.com.au` as a
  // candidate address on a real business's page. Sending there is useless and
  // reads as automated bulk mail to any provider inspecting it.
  it("blocks noreply-style addresses even though they are well formed", () => {
    for (const bad of ["noreply@x.com.au", "DoNotReply@x.com.au", "postmaster@x.com.au", "abuse@x.com.au"]) {
      expect(emailPreSendCheck({ prospect_id: "p", email: bad }), bad).toEqual({
        ok: false,
        reason: BLOCK_REASONS.ROLE_ADDRESS_UNSAFE,
      });
    }
  });

  it("allows ordinary role addresses a small business really uses", () => {
    for (const good of ["info@x.com.au", "admin@x.com.au", "sales@x.com.au", "enquiries@x.com.au"]) {
      expect(emailPreSendCheck({ prospect_id: "p", email: good }), good).toEqual({ ok: true });
    }
  });

  // Detect by a different mechanism than the code computes by: rather than
  // re-listing the reasons, assert the property that matters — nothing gets
  // through with an opt-out stamp, whatever else is true of the row.
  it("no combination of other fields lets a suppressed prospect through", () => {
    const stamps = ["2020-01-01", "2026-08-10T04:00:00.000Z"];
    const statuses = [null, "new", "contacted", "interested"];
    for (const unsubscribed_at of stamps) {
      for (const status of statuses) {
        const r = emailPreSendCheck({ prospect_id: "p", email: "real@business.com.au", unsubscribed_at, status });
        expect(r.ok, `${unsubscribed_at} / ${status}`).toBe(false);
      }
    }
  });
});

describe("unsubscribe tokens", () => {
  it("round-trips", () => {
    const t = unsubscribeToken("prospect-123", SECRET);
    expect(verifyUnsubscribeToken(t, SECRET)).toBe("prospect-123");
  });

  it("rejects a token signed with a different secret", () => {
    const t = unsubscribeToken("prospect-123", SECRET);
    expect(verifyUnsubscribeToken(t, "other-secret")).toBeNull();
  });

  it("rejects tampering with the id half", () => {
    const t = unsubscribeToken("prospect-123", SECRET);
    const forged = `${Buffer.from("prospect-999").toString("base64url")}.${t.split(".").pop()}`;
    expect(verifyUnsubscribeToken(forged, SECRET)).toBeNull();
  });

  it("rejects junk without throwing", () => {
    for (const junk of ["", ".", "abc", "....", "!!!.???", "a.b.c"]) {
      expect(() => verifyUnsubscribeToken(junk, SECRET)).not.toThrow();
      expect(verifyUnsubscribeToken(junk, SECRET)).toBeNull();
    }
  });

  // s 18(2) requires the facility to work for at least 30 days. A token that
  // expires would satisfy the letter and fail a real person who finds the email
  // later, so it must not expire at all.
  it("does not encode an expiry", () => {
    const a = unsubscribeToken("p", SECRET);
    const b = unsubscribeToken("p", SECRET);
    expect(a).toBe(b);
  });
});

describe("buildMarketingEmail — s 17 and s 18", () => {
  const base = { to: "a@b.com.au", subject: "Hello", body: "We answer your phone.", sender: SENDER, unsubscribeUrl: URL };

  it("carries everything the Act requires", () => {
    const msg = buildMarketingEmail(base);
    expect(auditMarketingEmail(msg)).toEqual({ ok: true, missing: [] });
    expect(msg.text).toContain("Example Pty Ltd");
    expect(msg.text).toContain("ABN 12 345 678 901");
    expect(msg.text).toContain(URL);
    expect(msg.replyTo).toBe(SENDER.contactEmail);
  });

  it("names both the trading name and the legal name", () => {
    const msg = buildMarketingEmail(base);
    expect(msg.text).toContain("PickupAI (Example Pty Ltd)");
  });

  it("does not duplicate the name when they are the same", () => {
    const msg = buildMarketingEmail({ ...base, sender: { ...SENDER, tradingName: "Example Pty Ltd" } });
    expect(msg.text).not.toContain("Example Pty Ltd (Example Pty Ltd)");
  });

  // Spam Regulations 2021 s 7 — the unsubscribe must not require a login, a
  // fee, or any personal information beyond the address messaged.
  it("promises no account, no form and no details", () => {
    const msg = buildMarketingEmail(base);
    expect(msg.text).toMatch(/no account, no form, no details/i);
  });

  it("offers a reply-based opt-out as well as the link", () => {
    const msg = buildMarketingEmail(base);
    expect(msg.text).toMatch(/reply to this email/i);
  });

  // Schedule 2 cl 6: five BUSINESS days. The Act never says "working days" and
  // never says five days in s 18 at all — a wording slip we made once already.
  it("says five business days, not working days", () => {
    const msg = buildMarketingEmail(base);
    expect(msg.text).toContain("five business days");
    expect(msg.text).not.toMatch(/working days/i);
  });

  it("sets one-click List-Unsubscribe headers", () => {
    const msg = buildMarketingEmail(base);
    expect(msg.headers["List-Unsubscribe"]).toContain(URL);
    expect(msg.headers["List-Unsubscribe"]).toContain("mailto:");
    expect(msg.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
  });

  // Non-compliance must not be reachable. Every one of these would be a
  // contravention, so the builder refuses rather than emitting the message.
  it("refuses to build a message that would contravene the Act", () => {
    expect(() => buildMarketingEmail({ ...base, sender: { ...SENDER, legalName: "" } })).toThrow(/s 17/);
    expect(() => buildMarketingEmail({ ...base, sender: { ...SENDER, contactEmail: "" } })).toThrow(/s 17/);
    expect(() => buildMarketingEmail({ ...base, unsubscribeUrl: "http://x/u/1" })).toThrow(/s 18/);
    expect(() => buildMarketingEmail({ ...base, unsubscribeUrl: "/u/1" })).toThrow(/s 18/);
    expect(() => buildMarketingEmail({ ...base, body: "  " })).toThrow(/empty/);
    expect(() => buildMarketingEmail({ ...base, subject: "" })).toThrow(/subject/);
  });
});

/**
 * The /u/:token route lives inside main() in server.ts and is therefore
 * unreachable from a test — the same defect class as smsPreSendCheck. What CAN
 * be pinned is the claim that actually matters, and it is pinned against a real
 * database rather than a mock: an opt-out arriving on either channel suppresses
 * BOTH. The route's only job is to call markProspectUnsubscribed; this proves
 * that call is sufficient.
 */
describe("suppression is one record, not one per channel", () => {
  it("an email opt-out also blocks SMS, and an SMS opt-out also blocks email", async () => {
    const { rm } = await import("node:fs/promises");
    const { openDb } = await import("../src/db/db.js");
    const { createProspect, getProspectById, markProspectUnsubscribed } = await import("../src/db/repo.js");

    const sqlitePath = `.tmp/test-unsub-${Date.now()}.sqlite`;
    const db = await openDb(sqlitePath);
    try {
      const p = createProspect(db, {
        business_name: "Test Sparky",
        owner_name: null,
        phone: "+61400000001",
        email: "test@sparky.com.au",
        website: null,
        trade_type: "electrician",
        suburb: "Sydney",
        state: "NSW",
        source: "test",
        google_rating: null,
        review_count: null,
        notes: null,
        last_contacted_at: null,
        next_followup_at: null,
      });

      // Before: emailable.
      expect(emailPreSendCheck(getProspectById(db, p.prospect_id)!).ok).toBe(true);

      // The /u/:token route does exactly this, and so does the SMS STOP handler.
      markProspectUnsubscribed(db, p.prospect_id);

      const after = getProspectById(db, p.prospect_id)!;

      // Email side: blocked by the gate in this module.
      expect(emailPreSendCheck(after)).toEqual({ ok: false, reason: BLOCK_REASONS.UNSUBSCRIBED });

      // SMS side: asserted on the two fields smsPreSendCheck reads, because the
      // function itself is trapped inside main(). If that guard is ever
      // extracted, replace this with a direct call — but do not delete it: the
      // point is that ONE opt-out closes BOTH channels.
      expect(after.unsubscribed_at, "unsubscribed_at is what smsPreSendCheck blocks on").toBeTruthy();
      expect(after.status, "do_not_contact is the second thing it blocks on").toBe("do_not_contact");
    } finally {
      await rm(sqlitePath, { force: true });
    }
  });
});

describe("auditMarketingEmail — detects a defect the builder cannot", () => {
  // The builder and its test share an author. This audits an arbitrary message
  // body, so it can catch a hand-written or externally-templated send that
  // skipped the builder entirely.
  it("names what is missing from a non-compliant message", () => {
    const r = auditMarketingEmail({ text: "Buy our thing. Cheers." });
    expect(r.ok).toBe(false);
    expect(r.missing).toContain("s17_sender_identification");
    expect(r.missing).toContain("s17_contact_details");
    expect(r.missing).toContain("s18_unsubscribe_statement");
    expect(r.missing).toContain("s18_unsubscribe_address");
  });
});
