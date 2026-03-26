import type { LeadRow } from "../db/repo.js";

export type LeadDraft = {
  name?: string;
  phone?: string;
  address?: string;
  issue_type?: string;
  issue_summary?: string;
  urgency_level?: "emergency" | "urgent" | "routine";
  preferred_time?: string;
  notes?: string;
  next_action?: string;
  confidence?: number;
  property_type?: "residential" | "commercial" | "strata" | "rental";
  caller_sentiment?: "positive" | "neutral" | "frustrated" | "distressed" | "rushed";
  job_value?: "small" | "medium" | "large";
};

export type CallState = {
  lead: LeadDraft;
  callerHistory: LeadRow[];
  historyConfirmed: boolean;
  callerIntent: string | null;
  tenantId?: string;
  tenantOwnerPhone?: string;
  tenantOwnerEmail?: string;
  isDemo?: boolean;
  fromNumber?: string;
};

type CallStateEntry = CallState & { _createdAt: number };

const mem = new Map<string, CallStateEntry>();

const CALL_STATE_MAX_AGE_MS = 30 * 60 * 1000;
setInterval(() => {
  const cutoff = Date.now() - CALL_STATE_MAX_AGE_MS;
  for (const [k, v] of mem) {
    if (v._createdAt < cutoff) mem.delete(k);
  }
}, 5 * 60 * 1000).unref();

export function getOrInitCallState(callSid: string): CallState {
  const existing = mem.get(callSid);
  if (existing) return existing;
  const init: CallStateEntry = {
    lead: {},
    callerHistory: [],
    historyConfirmed: false,
    callerIntent: null,
    _createdAt: Date.now()
  };
  mem.set(callSid, init);
  return init;
}

export function setCallState(callSid: string, state: CallState) {
  const entry: CallStateEntry = { ...state, _createdAt: mem.get(callSid)?._createdAt ?? Date.now() };
  mem.set(callSid, entry);
}

export function clearCallState(callSid: string) {
  mem.delete(callSid);
}
