/**
 * Everything the Spam Act 2003 (Cth) requires of a marketing email, in one
 * pure module so it can be tested without a server, a database or an SMTP host.
 *
 * Deliberately NOT inside `main()` in server.ts. `smsPreSendCheck` lives there
 * and is therefore unreachable from a test — the exact defect class this repo
 * has been extracting away from all week. The email path starts on the right
 * side of that line.
 *
 * The legal reading behind every rule here is
 * `docs/research/spam-act-email-outreach-2026-08.md`. Two findings from it drive
 * the shape of this file:
 *
 * 1. **s 17 has no consent defence.** The third-largest Spam Act penalty on
 *    record — Latitude Finance, $3,960,000, April 2026 — was charged entirely
 *    under s 17(1), sender identification, with no s 16 or s 18 count in the
 *    notice at all. Getting consent right does not protect you here.
 * 2. **A penalty unit is $364 from 1 July 2026.** A body corporate pays $36,400
 *    per s 16(1) contravention and $18,200 per s 17 or s 18 contravention.
 *    Twenty-three emails sent wrong is not a rounding error.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

/** The subset of a prospect this module needs. Keeps it free of db types. */
export type SuppressionSubject = {
  prospect_id: string;
  email?: string | null;
  unsubscribed_at?: string | null;
  status?: string | null;
};

export type PreSendResult = { ok: true } | { ok: false; reason: string };

/**
 * The identity that must appear in every message, per s 17. `contactValidUntil`
 * exists to make the 30-day requirement checkable rather than assumed: s 17(2)
 * requires the contact details to be reasonably likely to be capable of being
 * used for at least 30 days after the message is sent.
 */
export type SenderIdentity = {
  /** The entity that authorised the sending. Must be the real legal name. */
  legalName: string;
  /** Trading name, when it differs. Both appear; neither replaces the other. */
  tradingName?: string;
  abn?: string;
  /** A contact address that will still work 30 days from now. */
  contactEmail: string;
  contactPhone?: string;
  postalAddress?: string;
};

/**
 * Reasons a send is blocked. Exported so callers can log and count them without
 * matching on strings that might be reworded.
 */
export const BLOCK_REASONS = {
  UNSUBSCRIBED: "unsubscribed",
  DO_NOT_CONTACT: "do_not_contact",
  NOT_INTERESTED: "not_interested",
  NO_EMAIL: "no_email",
  MALFORMED_EMAIL: "malformed_email",
  ROLE_ADDRESS_UNSAFE: "role_address_unsafe",
} as const;

/** Addresses that are never a business's marketing contact. */
const UNSAFE_LOCAL_PARTS = new Set([
  "noreply",
  "no-reply",
  "donotreply",
  "do-not-reply",
  "postmaster",
  "abuse",
  "mailer-daemon",
  "bounce",
  "bounces",
]);

/** Conservative shape check. Not a validator — a rejecter of obvious junk. */
const EMAIL_SHAPE = /^[^\s@,;<>()[\]\\]+@[^\s@,;<>()[\]\\]+\.[A-Za-z]{2,}$/;

/**
 * The one gate every send must pass. There is deliberately no `force` flag and
 * no test-override escape hatch: the SMS path has one (`TEST_OVERRIDE_PHONE`)
 * and it exists to bypass the suppression list, which is the single check that
 * must never be bypassable. Suppression is cross-channel by construction here —
 * it reads `unsubscribed_at`, the same column the SMS STOP handler stamps, so a
 * person who opted out of texts can never be emailed.
 */
export function emailPreSendCheck(p: SuppressionSubject): PreSendResult {
  if (p.unsubscribed_at) return { ok: false, reason: BLOCK_REASONS.UNSUBSCRIBED };
  if (p.status === "do_not_contact") return { ok: false, reason: BLOCK_REASONS.DO_NOT_CONTACT };
  if (p.status === "not_interested") return { ok: false, reason: BLOCK_REASONS.NOT_INTERESTED };

  const email = (p.email ?? "").trim();
  if (!email) return { ok: false, reason: BLOCK_REASONS.NO_EMAIL };
  if (!EMAIL_SHAPE.test(email)) return { ok: false, reason: BLOCK_REASONS.MALFORMED_EMAIL };

  const local = email.slice(0, email.indexOf("@")).toLowerCase();
  if (UNSAFE_LOCAL_PARTS.has(local)) return { ok: false, reason: BLOCK_REASONS.ROLE_ADDRESS_UNSAFE };

  return { ok: true };
}

// ── Unsubscribe tokens ──────────────────────────────────────────────────────

/**
 * A signed, non-expiring unsubscribe token.
 *
 * Non-expiring is deliberate. s 18(2) requires the address to remain capable of
 * receiving an unsubscribe message for at least 30 days after the message is
 * sent; a token that expires on day 31 satisfies the letter and fails anyone who
 * finds the email later. There is no cost to it working forever.
 *
 * HMAC rather than a lookup table so unsubscribing needs no database read on the
 * hot path and cannot be enumerated by guessing prospect ids.
 */
export function unsubscribeToken(prospectId: string, secret: string): string {
  const sig = createHmac("sha256", secret).update(prospectId).digest("base64url").slice(0, 24);
  return `${Buffer.from(prospectId).toString("base64url")}.${sig}`;
}

/** Returns the prospect id if the token is authentic, else null. */
export function verifyUnsubscribeToken(token: string, secret: string): string | null {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  let prospectId: string;
  try {
    prospectId = Buffer.from(token.slice(0, dot), "base64url").toString("utf8");
  } catch {
    return null;
  }
  if (!prospectId) return null;
  const expected = unsubscribeToken(prospectId, secret);
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  return timingSafeEqual(a, b) ? prospectId : null;
}

// ── Message assembly ────────────────────────────────────────────────────────

export type MarketingEmail = {
  to: string;
  subject: string;
  text: string;
  /** Set as Reply-To. s 18 is satisfied by a reply address as well as the link. */
  replyTo: string;
  headers: Record<string, string>;
};

/**
 * Assemble a compliant commercial electronic message.
 *
 * The caller supplies the persuasion; this function supplies everything the Act
 * requires and refuses to build a message without it. A missing sender identity
 * throws rather than producing a message that would contravene s 17 — the whole
 * point of a compliance module is that non-compliance is not reachable.
 */
export function buildMarketingEmail(opts: {
  to: string;
  subject: string;
  /** The message itself. Written per-recipient; this module never generates it. */
  body: string;
  sender: SenderIdentity;
  /** Absolute https URL. Must not require a login, a fee, or any personal detail. */
  unsubscribeUrl: string;
}): MarketingEmail {
  const { to, subject, body, sender, unsubscribeUrl } = opts;

  if (!sender.legalName?.trim()) throw new Error("s 17: sender legalName is required");
  if (!sender.contactEmail?.trim()) throw new Error("s 17: sender contactEmail is required");
  if (!subject?.trim()) throw new Error("a commercial message needs a subject");
  if (!body?.trim()) throw new Error("refusing to send an empty message");
  if (!/^https:\/\//.test(unsubscribeUrl)) {
    throw new Error("s 18: unsubscribeUrl must be an absolute https URL");
  }

  // s 17(1): clear and accurate identification of the authorising entity, and
  // s 17(2): contact details that stay usable for at least 30 days.
  const who = sender.tradingName && sender.tradingName !== sender.legalName
    ? `${sender.tradingName} (${sender.legalName})`
    : sender.legalName;
  const identity = [
    `This message was authorised and sent by ${who}${sender.abn ? `, ABN ${sender.abn}` : ""}.`,
    sender.postalAddress ? sender.postalAddress : null,
    `Contact us: ${sender.contactEmail}${sender.contactPhone ? ` · ${sender.contactPhone}` : ""}`,
  ]
    .filter(Boolean)
    .join("\n");

  // s 18(1): a clear and conspicuous statement that the recipient may use an
  // electronic address to send an unsubscribe message. Spam Regulations 2021
  // s 7: no premium service, no fee, no login, and no personal information
  // beyond the address the message was sent to — which one click satisfies.
  const optOut = [
    "Don't want to hear from us again?",
    `Unsubscribe with one click: ${unsubscribeUrl}`,
    `Or reply to this email with "unsubscribe" — either works, and we act on it within five business days.`,
    "No account, no form, no details needed.",
  ].join("\n");

  const text = `${body.trim()}\n\n—\n${identity}\n\n${optOut}\n`;

  return {
    to,
    subject: subject.trim(),
    replyTo: sender.contactEmail,
    text,
    headers: {
      // RFC 8058 / RFC 2369. Not required by the Act, but mail providers use it
      // to render a native unsubscribe control, which is the least-friction
      // path a recipient can be given.
      "List-Unsubscribe": `<${unsubscribeUrl}>, <mailto:${sender.contactEmail}?subject=unsubscribe>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  };
}

/**
 * Marketing email is refused unless every piece of the s 17 identity and the
 * unsubscribe secret is present. Deliberately a send-time throw rather than a
 * boot-time env requirement: an existing deploy that never sends marketing must
 * keep booting, but a half-configured one must never produce a message that
 * contravenes s 17. Failing loud beats failing compliant-looking.
 */
export function assertMarketingEmailConfigured(cfg: {
  legalName?: string;
  contactEmail?: string;
  unsubscribeSecret?: string;
  publicBaseUrl?: string;
}): asserts cfg is { legalName: string; contactEmail: string; unsubscribeSecret: string; publicBaseUrl: string } {
  const missing: string[] = [];
  if (!cfg.legalName?.trim()) missing.push("OUTREACH_SENDER_LEGAL_NAME");
  if (!cfg.contactEmail?.trim()) missing.push("OUTREACH_SENDER_CONTACT_EMAIL");
  if (!cfg.unsubscribeSecret?.trim()) missing.push("OUTREACH_UNSUBSCRIBE_SECRET");
  if (!/^https:\/\//.test(cfg.publicBaseUrl ?? "")) missing.push("PUBLIC_BASE_URL (https)");
  if (missing.length) {
    throw new Error(
      `Refusing to send marketing email — not configured: ${missing.join(", ")}. ` +
        `s 17 of the Spam Act has no consent defence; a message without accurate sender ` +
        `identification contravenes it regardless of how the address was obtained.`
    );
  }
  const local = cfg.contactEmail!.slice(0, cfg.contactEmail!.indexOf("@")).toLowerCase();
  if (UNSAFE_LOCAL_PARTS.has(local)) {
    throw new Error(
      `OUTREACH_SENDER_CONTACT_EMAIL is "${cfg.contactEmail}", which cannot receive an ` +
        `unsubscribe reply. s 18 requires a functional one. Use a monitored mailbox.`
    );
  }
}

/** The public unsubscribe URL for a prospect. One click, no login, no form. */
export function unsubscribeUrlFor(prospectId: string, secret: string, publicBaseUrl: string): string {
  return `${publicBaseUrl.replace(/\/+$/, "")}/u/${unsubscribeToken(prospectId, secret)}`;
}

/**
 * Does an assembled message actually carry what the Act requires? Used by tests
 * and by any future audit of what was really sent, rather than of what the
 * builder was supposed to produce.
 */
export function auditMarketingEmail(msg: { text: string; headers?: Record<string, string> }): {
  ok: boolean;
  missing: string[];
} {
  const missing: string[] = [];
  if (!/authorised and sent by/i.test(msg.text)) missing.push("s17_sender_identification");
  if (!/Contact us:/i.test(msg.text)) missing.push("s17_contact_details");
  if (!/unsubscribe/i.test(msg.text)) missing.push("s18_unsubscribe_statement");
  if (!/https:\/\//.test(msg.text)) missing.push("s18_unsubscribe_address");
  return { ok: missing.length === 0, missing };
}
