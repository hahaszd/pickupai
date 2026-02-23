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
};

export type CallState = {
  lead: LeadDraft;
  callerHistory: LeadRow[];
  historyConfirmed: boolean;
  callerIntent: string | null;
};

const mem = new Map<string, CallState>();

export function getOrInitCallState(callSid: string): CallState {
  const existing = mem.get(callSid);
  if (existing) return existing;
  const init: CallState = {
    lead: {},
    callerHistory: [],
    historyConfirmed: false,
    callerIntent: null
  };
  mem.set(callSid, init);
  return init;
}

export function setCallState(callSid: string, state: CallState) {
  mem.set(callSid, state);
}

export function clearCallState(callSid: string) {
  mem.delete(callSid);
}
