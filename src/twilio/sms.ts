import pino from "pino";
import { env } from "../env.js";
import type { Db } from "../db/db.js";
import type { LeadRow } from "../db/repo.js";
import { getSystemConfig } from "../db/repo.js";
import { twilioClient } from "./client.js";
import { formatAuPhone, toE164Au } from "../utils/phone.js";
import { isWithinHours } from "../utils/time.js";

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
  const jobValueLabel = compact(l.job_value as unknown as string);

  const lines = [
    `${header}:`,
    hasName ? `Name: ${compact(l.name)}` : null,
    hasPhone ? `Phone: ${formatAuPhone(compact(l.phone))}` : null,
    hasAddress ? `Address: ${truncSms(compact(l.address), 80)}` : null,
    propertyLabel ? `Property: ${propertyLabel}` : null,
    hasSummary ? `Details: ${truncSms(compact(l.issue_summary), 120)}` : null,
    jobValueLabel ? `Scope: ${jobValueLabel}` : null,
    compact(l.preferred_time) ? `Preferred time: ${compact(l.preferred_time)}` : null,
    compact(l.next_action) ? `Next: ${compact(l.next_action)}` : null,
    isDegraded ? `Note: Some details weren't captured - check the recording.` : null,
    opts.dashboardUrl ? `View: ${opts.dashboardUrl}/dashboard/leads/${viewId}` : null
  ].filter(Boolean) as string[];

  return lines.join("\n");
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

  const VISUAL_TRADES = new Set(["plumber", "plumbing", "electrician", "electrical", "roofer", "roofing", "painter", "painting", "tiler", "tiling", "builder", "building", "handyman"]);
  const trades = (opts.tradeType ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  const isVisualTrade = trades.length === 0 || trades.some((t) => VISUAL_TRADES.has(t));
  const photoLine = isVisualTrade
    ? "\nIf you have photos of the issue, feel free to text them to this number - it helps the team prepare."
    : "";

  return `${greeting} for calling ${biz}!${refSnippet}\nThe team will call you back ${timing}.${photoLine} - ${biz}`;
}

export async function sendOwnerSms(
  db: Db,
  body: string,
  ownerPhone?: string
): Promise<SendOwnerSmsResult> {
  const raw = ownerPhone ?? env.OWNER_PHONE_NUMBER;
  if (!raw) {
    log.warn("skipping SMS — no recipient phone number");
    return { status: "skipped", reason: "no_recipient" };
  }
  const to = toE164Au(raw);
  if (env.TWILIO_MESSAGING_SERVICE_SID) {
    const message = await twilioClient.messages.create({
      to, body, messagingServiceSid: env.TWILIO_MESSAGING_SERVICE_SID
    });
    return { status: "sent", sid: message.sid, to, from: env.TWILIO_MESSAGING_SERVICE_SID };
  }
  const from = nextSmsNumber(db);
  if (!from) {
    log.warn("skipping SMS — no sender numbers configured");
    return { status: "skipped", reason: "no_sender" };
  }
  const message = await twilioClient.messages.create({ to, from, body });
  return { status: "sent", sid: message.sid, to, from };
}
