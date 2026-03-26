import type { LeadDraft } from "../twilio/state.js";

const VALID_URGENCY = new Set(["emergency", "urgent", "routine"]);
const VALID_PROPERTY_TYPES = new Set(["residential", "commercial", "strata", "rental"]);
const VALID_SENTIMENTS = new Set(["positive", "neutral", "frustrated", "distressed", "rushed"]);
const VALID_JOB_VALUES = new Set(["small", "medium", "large"]);
const VALID_INTENTS = new Set([
  "new_job",
  "follow_up",
  "complaint",
  "reschedule",
  "quote_only",
  "cancellation",
  "wrong_number",
  "spam",
  "telemarketer",
  "job_applicant",
  "supplier",
  "trade_referral",
  "silent",
  "abusive",
  "voicemail",
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

export function safeParseFunctionArgs(raw: string | null | undefined): Record<string, unknown> {
  if (raw == null || !raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function sanitizeSaveLeadArgs(args: Record<string, unknown>): SaveLeadPatch {
  const patch: SaveLeadPatch = {};

  const FIELD_MAX_LENGTHS: Record<StringLeadField, number> = {
    name: 200,
    phone: 50,
    address: 500,
    issue_type: 100,
    issue_summary: 1000,
    preferred_time: 200,
    notes: 2000,
    next_action: 500
  };

  const stringFields: StringLeadField[] = Object.keys(FIELD_MAX_LENGTHS) as StringLeadField[];

  for (const key of stringFields) {
    let value = asNonEmptyString(args[key as string]);
    if (value) {
      const maxLen = FIELD_MAX_LENGTHS[key];
      if (value.length > maxLen) value = value.slice(0, maxLen);
      patch[key] = value;
    }
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

  const propertyType = asNonEmptyString(args.property_type);
  if (propertyType && VALID_PROPERTY_TYPES.has(propertyType)) {
    patch.property_type = propertyType as LeadDraft["property_type"];
  }

  const sentiment = asNonEmptyString(args.caller_sentiment);
  if (sentiment && VALID_SENTIMENTS.has(sentiment)) {
    patch.caller_sentiment = sentiment as LeadDraft["caller_sentiment"];
  }

  const jobValue = asNonEmptyString(args.job_value);
  if (jobValue && VALID_JOB_VALUES.has(jobValue)) {
    patch.job_value = jobValue as LeadDraft["job_value"];
  }

  return patch;
}

export function sanitizeEndCallReason(args: Record<string, unknown>): string {
  const raw = asNonEmptyString(args.reason) ?? "conversation complete";
  return raw.length > 500 ? raw.slice(0, 500) : raw;
}
