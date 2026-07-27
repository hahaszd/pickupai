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
  job_size?: "small" | "medium" | "large";
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

/**
 * Every call currently in progress, as `[callSid, state]` pairs.
 *
 * Call state lives only in this process's memory, so a restart destroys the
 * partially-collected lead for every live call — and the media stream dies with
 * the process either way, so the call cannot be resumed. This exists so the
 * shutdown handler can at least salvage those drafts as partial leads before
 * exiting, giving the tradie a number to ring back. See docs/adr/0001.
 */
export function listCallStates(): Array<[string, CallState]> {
  return [...mem.entries()].map(([callSid, entry]) => {
    const { _createdAt: _ignored, ...state } = entry;
    return [callSid, state] as [string, CallState];
  });
}
