import type { Db } from "../db/db.js";
import type { TenantRow, upsertLead as upsertLeadFn } from "../db/repo.js";
import type { CallState, LeadDraft } from "../twilio/state.js";

/**
 * What happens when the model calls save_lead(): merge the patch into the live
 * call state, write the row, and flush.
 *
 * This lived inside `main()` in server.ts, which meant it could not be reached
 * from a test — and a reviewer proved the consequence by replacing
 * `flushCritical` with a no-op and watching all 374 tests stay green. That
 * flush is the guarantee in docs/adr/0002: a lead is the one write whose loss
 * a paying customer would notice, and they would never know it happened,
 * because the call sounded fine and the SMS is sent from a different path.
 *
 * Every dependency is injected rather than imported so the whole thing can be
 * exercised offline. That is the point: `localiseDemo` had the identical
 * problem one layer down, and extracting it was what made it testable.
 */
export type LeadPersistDeps = {
  db: Db;
  tenant: TenantRow;
  callSid: string;
  getState: (callSid: string) => CallState;
  setState: (callSid: string, state: CallState) => void;
  /**
   * Typed as the real function, not as `(db, Record<string, unknown>) => void`.
   * The loose signature plus an `as never` at the call site meant tsc no longer
   * checked the 17-field row built below against what upsertLead accepts —
   * renaming `name` to `nme` or dropping `call_id` compiled clean, where before
   * the extraction both were errors. On the one write ADR-0002 calls
   * unrecoverable, losing the compiler is a worse trade than the testability
   * was worth, and there is no need to choose.
   */
  upsertLead: typeof upsertLeadFn;
  /** Blocking flush. ADR-0002 — deliberately not fire-and-forget. */
  flushCritical: (db: Db, reason: string) => void;
  appendTranscript?: (db: Db, callSid: string, line: string) => void;
  storeFullTranscript: boolean;
  log?: { info: (o: unknown, m: string) => void };
};

export function persistLeadPatch(deps: LeadPersistDeps, patch: Partial<LeadDraft> & Record<string, unknown>): void {
  const s = deps.getState(deps.callSid);

  // Empty string counts as "not provided": the model sends "" when it has
  // nothing rather than omitting the key, and letting that through would erase
  // a detail captured earlier in the same call.
  for (const [k, v] of Object.entries(patch)) {
    if (v !== null && v !== undefined && v !== "") {
      (s.lead as Record<string, unknown>)[k] = v;
    }
  }
  if (patch.caller_intent) s.callerIntent = patch.caller_intent as string;
  deps.setState(deps.callSid, s);

  deps.upsertLead(deps.db, {
    lead_id: deps.callSid,
    // "default" is the fallback tenant used when no number matched; it is not a
    // real row, so the lead is stored unowned rather than attributed to it.
    tenant_id: deps.tenant.tenant_id !== "default" ? deps.tenant.tenant_id : null,
    call_id: deps.callSid,
    name: s.lead.name ?? null,
    phone: s.lead.phone ?? null,
    address: s.lead.address ?? null,
    issue_type: s.lead.issue_type ?? null,
    issue_summary: s.lead.issue_summary ?? null,
    urgency_level: s.lead.urgency_level ?? null,
    preferred_time: s.lead.preferred_time ?? null,
    notes: s.lead.notes ?? null,
    confidence: s.lead.confidence ?? null,
    next_action: s.lead.next_action ?? null,
    property_type: s.lead.property_type ?? null,
    caller_sentiment: s.lead.caller_sentiment ?? null,
    caller_intent: s.callerIntent ?? null,
    job_size: s.lead.job_size ?? null
  });

  if (deps.storeFullTranscript && deps.appendTranscript) {
    deps.appendTranscript(deps.db, deps.callSid, `[lead] ${JSON.stringify(patch)}`);
  }

  // Critical write: a lost lead is a lost job for the tradie, and they would
  // never know it happened. docs/adr/0002.
  deps.flushCritical(deps.db, "save_lead");

  deps.log?.info({ callSid: deps.callSid, patch }, "lead updated");
}
