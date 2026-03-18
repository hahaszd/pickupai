import type { LeadDraft } from "../twilio/state.js";

const VALID_URGENCY = new Set(["emergency", "urgent", "routine"]);
const VALID_INTENTS = new Set([
  "new_job",
  "follow_up",
  "complaint",
  "reschedule",
  "quote_only",
  "wrong_number",
  "spam",
  "telemarketer",
  "job_applicant",
  "supplier",
  "trade_referral",
  "silent",
  "abusive",
  "unknown"
]);

type SaveLeadPatch = Partial<LeadDraft> & { caller_intent?: string };
type StringLeadField =
  | "name"
  | "phone"
  | "address"
  | "issue_type"
  | "issue_summary"
  | "preferred_time"
  | "notes"
  | "next_action";

function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function safeParseFunctionArgs(raw: string | undefined): Record<string, unknown> {
  if (!raw || !raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function sanitizeSaveLeadArgs(args: Record<string, unknown>): SaveLeadPatch {
  const patch: SaveLeadPatch = {};

  const stringFields: StringLeadField[] = [
    "name",
    "phone",
    "address",
    "issue_type",
    "issue_summary",
    "preferred_time",
    "notes",
    "next_action"
  ];

  for (const key of stringFields) {
    const value = asNonEmptyString(args[key as string]);
    if (value) patch[key] = value;
  }

  const urgency = asNonEmptyString(args.urgency_level);
  if (urgency && VALID_URGENCY.has(urgency)) {
    patch.urgency_level = urgency as LeadDraft["urgency_level"];
  }

  const intent = asNonEmptyString(args.caller_intent);
  if (intent && VALID_INTENTS.has(intent)) {
    patch.caller_intent = intent;
  }

  if (typeof args.confidence === "number" && Number.isFinite(args.confidence)) {
    patch.confidence = Math.max(0, Math.min(1, args.confidence));
  }

  return patch;
}

export function sanitizeEndCallReason(args: Record<string, unknown>): string {
  return asNonEmptyString(args.reason) ?? "conversation complete";
}
