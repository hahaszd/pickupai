import { env } from "../env.js";
import type { Db } from "../db/db.js";
import type { LeadRow } from "../db/repo.js";
import { getSystemConfig } from "../db/repo.js";
import { twilioClient } from "./client.js";

let smsNumberIndex = 0;

/**
 * Pick the next SMS sender number using round-robin.
 * Reads from the `sms_numbers` key in system_config first;
 * falls back to the TWILIO_SMS_NUMBERS env var if not set in DB.
 */
function nextSmsNumber(db: Db): string {
  const dbValue = getSystemConfig(db, "sms_numbers");
  const pool = dbValue
    ? dbValue.split(",").map((n) => n.trim()).filter(Boolean)
    : env.TWILIO_SMS_NUMBERS;
  const number = pool[smsNumberIndex % pool.length];
  smsNumberIndex = (smsNumberIndex + 1) % pool.length;
  return number;
}

function compact(s: string | null | undefined) {
  return (s ?? "").trim();
}

const INTENT_HEADERS: Record<string, string> = {
  new_job: "NEW JOB",
  follow_up: "FOLLOW-UP",
  complaint: "COMPLAINT ⚠️",
  reschedule: "RESCHEDULE",
  quote_only: "QUOTE REQUEST",
  job_applicant: "JOB APPLICANT",
  supplier: "SUPPLIER CALL",
  trade_referral: "REFERRAL",
  unknown: "CALL"
};

/** Intents that should NOT trigger an SMS to the owner. */
export const NO_SMS_INTENTS = new Set([
  "wrong_number",
  "spam",
  "telemarketer",
  "silent",
  "abusive"
]);

export function formatOwnerSms(opts: {
  lead: LeadRow;
  callId: string;
  callerIntent?: string | null;
}) {
  const l = opts.lead;
  const intent = opts.callerIntent ?? "unknown";
  const urgency = compact(l.urgency_level) || "unknown";

  // For new_job include urgency in header; others use intent label only.
  const header =
    intent === "new_job"
      ? `NEW JOB (${urgency.toUpperCase()})`
      : (INTENT_HEADERS[intent] ?? `CALL [${intent}]`);

  const lines = [
    `${header}:`,
    compact(l.name) ? `Name: ${compact(l.name)}` : null,
    compact(l.phone) ? `Phone: ${compact(l.phone)}` : null,
    compact(l.address) ? `Address: ${compact(l.address)}` : null,
    compact(l.issue_summary) ? `Details: ${compact(l.issue_summary)}` : null,
    compact(l.preferred_time) ? `Preferred time: ${compact(l.preferred_time)}` : null,
    compact(l.next_action) ? `Next: ${compact(l.next_action)}` : null,
    `CallId: ${opts.callId}`
  ].filter(Boolean) as string[];

  return lines.join("\n");
}

export async function sendOwnerSms(db: Db, body: string, ownerPhone?: string) {
  const to = ownerPhone ?? env.OWNER_PHONE_NUMBER;
  return twilioClient.messages.create({
    to,
    from: nextSmsNumber(db),
    body
  });
}
