import pino from "pino";
import { env } from "../env.js";
import type { Db } from "../db/db.js";
import type { LeadRow } from "../db/repo.js";
import { getSystemConfig } from "../db/repo.js";
import { twilioClient } from "./client.js";
import { formatAuPhone, toE164Au } from "../utils/phone.js";
import { isMobileMessageConfigured, sendMarketingSms } from "../sms/mobile-message.js";
import { toGsm7 } from "../sms/gsm7.js";

const log = pino({ level: "info" });

let smsNumberIndex = 0;

/**
 * Pick the next SMS sender number using round-robin.
 * Reads from the `sms_numbers` key in system_config first;
 * falls back to the TWILIO_SMS_NUMBERS env var if not set in DB.
 */
function nextSmsNumber(db: Db): string | undefined {
  const dbValue = getSystemConfig(db, "sms_numbers");
  const pool = dbValue
    ? dbValue.split(",").map((n) => n.trim()).filter(Boolean)
    : env.TWILIO_SMS_NUMBERS;
  if (pool.length === 0) return undefined;
  const number = pool[smsNumberIndex % pool.length];
  smsNumberIndex = (smsNumberIndex + 1) % pool.length;
  return number;
}

function compact(s: string | null | undefined) {
  return (s ?? "").trim();
}

function truncSms(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 3) + "..." : s;
}

const INTENT_HEADERS: Record<string, string> = {
  new_job: "NEW JOB",
  follow_up: "FOLLOW-UP",
  complaint: "COMPLAINT",
  reschedule: "RESCHEDULE",
  quote_only: "QUOTE REQUEST",
  job_applicant: "JOB APPLICANT",
  supplier: "SUPPLIER CALL",
  trade_referral: "REFERRAL",
  referred_out: "REFERRED ON",
  cancellation: "CANCELLATION",
  voicemail: "VOICEMAIL",
  unknown: "CALL"
};

/** Build the Australian conditional-forwarding dial code for a given E.164 number. */
export function generateForwardingCode(e164: string): string {
  return `**61*${e164.replace(/\+/g, "")}*11*20#`;
}

export const FIRST_CALL_CELEBRATION_PREFIX =
  `[FIRST CALL] Your first real call just came in! PickupAI answered it and here are the details:\n\n`;

/** Intents that should NOT trigger an SMS to the owner. */
/**
 * Would this message tell the owner anything at all?
 *
 * The rule the owner set on 2026-07-29: send one message for every real
 * caller, whatever was collected — a name alone is worth having, an issue with
 * no number is worth having. The single exception is a message with nothing in
 * it: no name, no number the owner could ring (given or caller ID), and nothing
 * about what they wanted. That is not a lead, it is a notification that the
 * phone rang.
 *
 * Deliberately an AND, not an OR. A caller who gives only "my hot water's out"
 * and hangs up from a withheld number leaves nothing to act on; a caller who
 * gives only a number leaves plenty.
 */
export function ownerSmsWouldSayNothing(opts: {
  lead: Pick<LeadRow, "name" | "phone" | "issue_summary" | "notes">;
  fromNumber?: string | null;
}): boolean {
  const l = opts.lead;
  const reachable = (!!compact(l.phone) && !isUnreachableNumber(l.phone)) || !!usableCallerId(opts.fromNumber);
  const hasContent = !!compact(l.issue_summary) || !!compact(l.notes);
  return !compact(l.name) && !reachable && !hasContent;
}

export const NO_SMS_INTENTS = new Set([
  // What these five have in common is that the person on the phone is not a
  // potential customer. That is the only reason to suppress a message.
  //
  // referred_out was briefly in this list and was taken out on 2026-07-29 by
  // owner decision: that caller rang the RIGHT business, got a straight useful
  // answer for free, and is the cheapest goodwill this product will ever buy.
  // The owner has a right to know someone called him, and whether to follow it
  // up is his call, not the AI's. The message already leads with
  // "REFERRED - <who>", so it costs him two seconds to read and dismiss.
  "wrong_number",
  "spam",
  "telemarketer",
  "silent",
  "abusive"
]);

/**
 * Values that turn up in a phone field and cannot be rung.
 *
 * Twilio documents only the alpha forms: since 2023-05-17 a withheld caller ID
 * arrives as the string `anonymous`, and it persists whatever alpha string the
 * carrier sent (`ANONYMOUS`, `RESTRICTED`).
 * https://www.twilio.com/en-us/changelog/changes-to-withheld-caller-id-behavior
 *
 * The NUMERIC forms below are what carriers hand over and Twilio does not
 * document them anywhere, so they are listed by the word each one spells on a
 * phone keypad rather than as magic numbers — otherwise the next person reads
 * them as a typo and deletes them. Only `266696687` was caught before; a
 * withheld caller arriving as `+7378742833` was printed to the owner as a
 * number to ring back.
 *
 * Matching is on the EXACT digit string, so a real number that merely contains
 * one of these runs (+61266696687) is unaffected.
 */
const PLACEHOLDER_DIGITS = new Set([
  "266696687",  // ANONYMOUS
  "7378742833", // RESTRICTED
  "8656696",    // UNKNOWN
  "862825",     // UNAVAIL
  "7748433"     // PRIVATE
]);
const PLACEHOLDER_WORDS = new Set([
  "anonymous", "restricted", "unavailable", "unknown", "private", "withheld", "blocked"
]);

/**
 * True for anything the owner could not ring back. Deliberately narrow: it only
 * rejects the exact known placeholders, because a false positive here silently
 * drops a real customer's number, which is the worse of the two failures.
 */
export function isUnreachableNumber(value?: string | null): boolean {
  const raw = compact(value);
  if (!raw) return false;
  const letters = raw.toLowerCase().replace(/[^a-z]/g, "");
  if (letters && PLACEHOLDER_WORDS.has(letters)) return true;
  return PLACEHOLDER_DIGITS.has(raw.replace(/\D/g, ""));
}

/**
 * A caller ID we could actually ring back. Twilio sends a placeholder rather
 * than a number when the caller withholds it, and a placeholder printed as
 * something to ring is worse than a blank.
 */
function usableCallerId(from?: string | null): string {
  const raw = compact(from);
  return raw && /^\+?\d{6,}$/.test(raw) && !isUnreachableNumber(raw) ? raw : "";
}

export type OwnerSmsDecision =
  | { send: true }
  | {
      send: false;
      /** `already_sent` is not worth recording; the others are. */
      reason: "intent" | "already_sent" | "no_lead" | "nothing_to_report";
      detail?: string;
    };

/**
 * Whether this call should wake the owner's phone, as a pure function.
 *
 * The decision used to be three conditionals inside notifyOwnerSmsIfNeeded,
 * which lives inside main() in server.ts and is therefore unreachable from a
 * test. A reviewer INVERTED the suppression check — `!NO_SMS_INTENTS.has(...)`
 * — and all 374 tests stayed green. That inversion suppresses every genuine job
 * and wakes the owner at 2am for every telemarketer, and nothing would have
 * caught it. NO_SMS_INTENTS and ownerSmsWouldSayNothing were both well covered
 * as a set and a predicate; what had no coverage was whether anything consulted
 * them.
 *
 * Order is deliberate. `already_sent` is checked before the emptiness rule so a
 * retry of a message that went out is never re-examined, and intent is checked
 * first of all because a telemarketer's call should not even be looked at.
 */
export function decideOwnerSms(input: {
  callerIntent?: string | null;
  alreadySent: boolean;
  lead: (Pick<LeadRow, "name" | "phone" | "issue_summary" | "notes">) | null;
  fromNumber?: string | null;
}): OwnerSmsDecision {
  if (input.callerIntent && NO_SMS_INTENTS.has(input.callerIntent)) {
    return { send: false, reason: "intent", detail: input.callerIntent };
  }
  if (input.alreadySent) return { send: false, reason: "already_sent" };
  if (!input.lead) return { send: false, reason: "no_lead" };
  if (ownerSmsWouldSayNothing({ lead: input.lead, fromNumber: input.fromNumber })) {
    return { send: false, reason: "nothing_to_report" };
  }
  return { send: true };
}

export type SendOwnerSmsResult =
  | { status: "sent"; sid: string; to: string; from: string }
  | { status: "skipped"; reason: "no_recipient" | "no_sender" };

export function formatOwnerSms(opts: {
  lead: LeadRow;
  callId: string;
  callerIntent?: string | null;
  dashboardUrl?: string;
  /**
   * The number the caller rang from, from Twilio's `From`.
   *
   * Used only when the caller did not give a number. The dashboard has fallen
   * back to it for a long time; this message did not, so a call where the
   * caller declined to leave a number reached the owner's phone with no number
   * on it at all — while the system knew it and showed it on a page the owner
   * does not open. It is labelled rather than presented as a given number,
   * because it is not the same thing: a caller can ring from a landline and
   * want the callback on a mobile, which is why the prompt still asks.
   */
  fromNumber?: string | null;
}) {
  const l = opts.lead;
  const intent = opts.callerIntent ?? "unknown";

  const sentimentTags: Record<string, string> = {
    frustrated: "FRUSTRATED",
    distressed: "DISTRESSED",
    rushed: "RUSHED"
  };
  const sentimentTag = l.caller_sentiment && sentimentTags[l.caller_sentiment]
    ? ` [${sentimentTags[l.caller_sentiment]}]`
    : "";

  const viewId = l.lead_id || opts.callId;

  const hasName = !!compact(l.name);
  const hasAddress = !!compact(l.address);
  const hasPhone = !!compact(l.phone) && !isUnreachableNumber(l.phone);
  // Twilio sends a placeholder rather than a number when the caller withholds
  // caller ID, and those must not be rendered as something to ring.
  const callerId = usableCallerId(opts.fromNumber);
  const hasSummary = !!compact(l.issue_summary);
  const isDegraded = intent === "new_job" && hasPhone && hasSummary && (!hasName || !hasAddress);

  const partialTag = isDegraded ? " [PARTIAL]" : "";

  // Every job reads "NEW JOB". The urgency tag that used to sit here was
  // removed with the rest of the grading machinery on 2026-07-28: the owner
  // reads the summary and judges it faster than the label could tell him, and
  // an over-applied label is worse than none.
  const header =
    intent === "new_job"
      ? `NEW JOB${sentimentTag}${partialTag}`
      : ((INTENT_HEADERS[intent] ?? `CALL [${intent}]`) + sentimentTag);

  const propertyLabel = compact(l.property_type);
  const jobSizeLabel = compact(l.job_size);

  // `notes` was collected and then thrown away — it appeared nowhere in this
  // message. The prompt routes real content there: the body of a voicemail
  // (session.ts, "Voicemail: [their message]"), an insurer and claim number,
  // and "audio unclear" warnings. A tradie was getting VOICEMAIL: plus a name
  // and number, with none of what the caller actually said.
  //
  // Two budgets, because the two cases are not alike. On a voicemail the note
  // IS the message and deserves room; elsewhere it is a supplement and gets the
  // same allowance as the issue summary.
  const notes = compact(l.notes);
  const isVoicemail = intent === "voicemail";
  // The prompt tells the model to put insurance details "in issue_summary or
  // notes", so the same text can land in both. Don't print it twice.
  const notesAreDuplicate =
    !!notes && hasSummary && compact(l.issue_summary).toLowerCase().includes(notes.toLowerCase());
  const notesLine =
    !notes || notesAreDuplicate
      ? null
      : isVoicemail
      // Enough to decide whether to ring back now; the full message is on the
      // lead page. 300 characters here was two segments of its own.
      ? `Msg: ${truncSms(notes, 140)}`
      : `Notes: ${truncSms(notes, 80)}`;

  // Built around what the owner has to DO. Every character costs money — one
  // message runs to two or three segments — and the tradie is reading this in a
  // van, so the test is whether they can decide "ring back now or later, and
  // what do I bring" without opening anything.
  //
  // Deliberately NOT here: property type and job size, which are judgement
  // context rather than instructions, and the full issue summary. Those live on
  // the lead page. Labels are dropped where the content speaks for itself — a
  // phone number does not need to be called "Phone".
  const lines = [
    `${header}:`,
    // Name and number on one line: this is the callback, and it is the whole
    // reason the message exists.
    [compact(l.name), hasPhone ? formatAuPhone(compact(l.phone)) : ""].filter(Boolean).join("  ") || null,
    // Only when they gave nothing. Withheld caller ID is real, so this can
    // still be absent — but silently dropping a number we hold is not a
    // failure mode worth keeping.
    !hasPhone && callerId ? `Rang from ${formatAuPhone(callerId)}` : null,
    hasAddress ? truncSms(compact(l.address), 60) : null,
    hasSummary ? truncSms(compact(l.issue_summary), 80) : null,
    notesLine,
    compact(l.preferred_time) ? `Wants: ${compact(l.preferred_time)}` : null,
    // The instruction, promoted. It used to sit second from last.
    compact(l.next_action) ? `> ${truncSms(compact(l.next_action), 60)}` : null,
    isDegraded ? `[partial - check the recording]` : null,
    opts.dashboardUrl ? `${opts.dashboardUrl.replace(/^https?:\/\//, "")}/dashboard/leads/${viewId}` : null
  ].filter(Boolean) as string[];

  // Sanitise last so nothing downstream can reintroduce a non-GSM-7 character.
  // A single em dash from the model turns a 2-segment message into 5.
  return toGsm7(lines.join("\n"));
}

/**
 * Build the confirmation SMS sent to the *caller* after a successful call.
 * Includes caller name, business name, job reference, a callback expectation
 * based on business hours, and optional photo suggestion for visual-issue
 * trades.
 */
export function buildCallerConfirmationSms(opts: {
  businessName: string;
  callerName?: string | null;
  issueType?: string | null;
  issueSummary?: string | null;
  businessHoursStart?: string;
  businessHoursEnd?: string;
  timezone?: string;
  vacationMode?: boolean;
  tradeType?: string | null;
}): string {
  const biz = opts.businessName;

  // No callback time is promised. This used to say "shortly" / "first thing
  // tomorrow morning" / "on Monday morning", computed from business hours —
  // eleven similar promises lived in the prompt too. Nobody can make them: the
  // lead lands on a phone in a van and there is no knowing when it is read.
  // Removed 2026-07-29. Vacation mode is different and survives, because a
  // business being away is a fact about availability rather than a promise
  // about response time, and a caller not told it assumes someone is on it.
  const awayNote = opts.vacationMode ? " The team is away at the moment." : "";

  const greeting = compact(opts.callerName)
    ? `Hi ${compact(opts.callerName)}! Thanks`
    : "Thanks";

  const ref = compact(opts.issueType) || compact(opts.issueSummary);
  const refSnippet = ref
    ? ` about your ${ref.length > 40 ? ref.slice(0, 37) + "..." : ref}`
    : "";

  return `${greeting} for calling ${biz}!${refSnippet}\nYour details are with the team.${awayNote} - ${biz}`;
}

export async function sendOwnerSms(
  db: Db,
  body: string,
  ownerPhone?: string,
  statusCallback?: string
): Promise<SendOwnerSmsResult> {
  const raw = ownerPhone ?? env.OWNER_PHONE_NUMBER;
  if (!raw) {
    log.warn("skipping SMS — no recipient phone number");
    return { status: "skipped", reason: "no_recipient" };
  }
  const to = toE164Au(raw);

  // Prefer Mobile Message when configured: it's ~5x cheaper and supports
  // alphanumeric sender IDs (PickupAI). Fall through to Twilio on hard
  // failure so a Mobile Message outage doesn't kill operational SMS.
  // statusCallback is intentionally ignored here — Mobile Message uses its
  // own status webhook configured via configureMobileMessageWebhooks.
  if (isMobileMessageConfigured()) {
    const r = await sendMarketingSms(to, body);
    if (r.status === "sent") {
      return { status: "sent", sid: r.message_id, to, from: env.MOBILE_MSG_SENDER! };
    }
    if (r.status === "skipped") {
      return { status: "skipped", reason: "no_sender" };
    }
    log.warn({ to, reason: r.reason }, "Mobile Message send failed; falling back to Twilio");
  }

  if (env.TWILIO_MESSAGING_SERVICE_SID) {
    const message = await twilioClient.messages.create({
      to, body,
      messagingServiceSid: env.TWILIO_MESSAGING_SERVICE_SID,
      ...(statusCallback ? { statusCallback } : {})
    });
    return { status: "sent", sid: message.sid, to, from: env.TWILIO_MESSAGING_SERVICE_SID };
  }
  const from = nextSmsNumber(db);
  if (!from) {
    log.warn("skipping SMS — no sender numbers configured");
    return { status: "skipped", reason: "no_sender" };
  }
  const message = await twilioClient.messages.create({
    to, from, body,
    ...(statusCallback ? { statusCallback } : {})
  });
  return { status: "sent", sid: message.sid, to, from };
}
