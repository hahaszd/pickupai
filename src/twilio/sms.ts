import pino from "pino";
import { env } from "../env.js";
import type { Db } from "../db/db.js";
import type { LeadRow } from "../db/repo.js";
import { getSystemConfig } from "../db/repo.js";
import { twilioClient } from "./client.js";
import { formatAuPhone, toE164Au } from "../utils/phone.js";
import { isWithinHours } from "../utils/time.js";
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
export const NO_SMS_INTENTS = new Set([
  "wrong_number",
  "spam",
  "telemarketer",
  "silent",
  "abusive"
]);

export type SendOwnerSmsResult =
  | { status: "sent"; sid: string; to: string; from: string }
  | { status: "skipped"; reason: "no_recipient" | "no_sender" };

export function formatOwnerSms(opts: {
  lead: LeadRow;
  callId: string;
  callerIntent?: string | null;
  dashboardUrl?: string;
}) {
  const l = opts.lead;
  const intent = opts.callerIntent ?? "unknown";
  const urgency = compact(l.urgency_level) || "unknown";

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
  const hasUrgency = !!compact(l.urgency_level);
  const hasPhone = !!compact(l.phone);
  const hasSummary = !!compact(l.issue_summary);
  const isDegraded = intent === "new_job" && hasPhone && hasSummary && (!hasName || !hasAddress || !hasUrgency);

  const partialTag = isDegraded ? " [PARTIAL]" : "";

  const header =
    intent === "new_job"
      ? (compact(l.urgency_level) ? `NEW JOB (${urgency.toUpperCase()})${sentimentTag}${partialTag}` : `NEW JOB${sentimentTag}${partialTag}`)
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
 * Includes caller name, business name, job reference, urgency-aware callback
 * expectation, and optional photo suggestion for visual-issue trades.
 */
export function buildCallerConfirmationSms(opts: {
  businessName: string;
  callerName?: string | null;
  issueType?: string | null;
  issueSummary?: string | null;
  urgencyLevel?: string | null;
  businessHoursStart?: string;
  businessHoursEnd?: string;
  timezone?: string;
  vacationMode?: boolean;
  tradeType?: string | null;
}): string {
  const biz = opts.businessName;

  let timing: string;
  if (opts.vacationMode) {
    timing = "when they're back";
  } else if (opts.urgencyLevel === "emergency") {
    timing = "as a priority";
  } else {
    const isOpen = isWithinHours({
      startHHMM: opts.businessHoursStart || "08:00",
      endHHMM: opts.businessHoursEnd || "17:00",
      timeZone: opts.timezone || "Australia/Sydney"
    });

    const now = new Date();
    const dayNum = (() => {
      try {
        const tz = opts.timezone || "Australia/Sydney";
        const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).formatToParts(now);
        const wd = parts.find((p) => p.type === "weekday")?.value ?? "";
        return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(wd);
      } catch { return now.getDay(); }
    })();
    const isFriAfterHours = dayNum === 5 && !isOpen;
    const isWeekend = dayNum === 0 || dayNum === 6;

    if (isWeekend || isFriAfterHours) timing = "on Monday morning";
    else if (isOpen) timing = "shortly";
    else timing = "first thing tomorrow morning";
  }

  const greeting = compact(opts.callerName)
    ? `Hi ${compact(opts.callerName)}! Thanks`
    : "Thanks";

  const ref = compact(opts.issueType) || compact(opts.issueSummary);
  const refSnippet = ref
    ? ` about your ${ref.length > 40 ? ref.slice(0, 37) + "..." : ref}`
    : "";

  return `${greeting} for calling ${biz}!${refSnippet}\nThe team will call you back ${timing}. - ${biz}`;
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
