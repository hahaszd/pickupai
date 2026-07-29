import { describe, it, expect, vi } from "vitest";
import { persistLeadPatch, type LeadPersistDeps } from "../src/realtime/lead-persist.js";
import type { CallState } from "../src/twilio/state.js";
import type { TenantRow } from "../src/db/repo.js";

/**
 * ADR-0002 says a lead is the one write whose loss a paying customer would
 * notice, and that saving one therefore blocks on a flush. A reviewer replaced
 * `flushCritical` with a no-op and all 374 tests stayed green — the guarantee
 * had no test at all, because the code lived inside main() in server.ts and was
 * unreachable.
 *
 * The failure is invisible from the outside, which is why it needs a test: the
 * call sounds fine, the owner's SMS goes out on a different path, and the row
 * is gone after the next restart with nothing in the logs to say so.
 */

function harness(over: Partial<LeadPersistDeps> = {}) {
  const state = {
    lead: {}, callerIntent: undefined, tenantId: "t-1"
  } as unknown as CallState;

  const calls = {
    upsertLead: vi.fn(),
    flushCritical: vi.fn(),
    setState: vi.fn(),
    appendTranscript: vi.fn()
  };

  const deps: LeadPersistDeps = {
    db: {} as never,
    tenant: { tenant_id: "t-1", name: "Test Plumbing" } as TenantRow,
    callSid: "CA-test",
    getState: () => state,
    setState: calls.setState,
    upsertLead: calls.upsertLead,
    flushCritical: calls.flushCritical,
    appendTranscript: calls.appendTranscript,
    storeFullTranscript: false,
    ...over
  };
  return { deps, calls, state };
}

describe("persistLeadPatch", () => {
  it("flushes after writing, on every save, not just the last one", () => {
    const { deps, calls } = harness();

    persistLeadPatch(deps, { name: "Gary" });
    persistLeadPatch(deps, { issue_summary: "Leaking tap" });

    expect(calls.upsertLead).toHaveBeenCalledTimes(2);
    expect(calls.flushCritical).toHaveBeenCalledTimes(2);
    expect(calls.flushCritical).toHaveBeenCalledWith(deps.db, "save_lead");

    // Order matters: flushing before the write persists the previous state and
    // loses the one that just arrived.
    const writeAt = calls.upsertLead.mock.invocationCallOrder[0];
    const flushAt = calls.flushCritical.mock.invocationCallOrder[0];
    expect(flushAt).toBeGreaterThan(writeAt);
  });

  it("accumulates across calls — the model saves progressively", () => {
    const { deps, calls } = harness();

    persistLeadPatch(deps, { name: "Gary", phone: "+61412345678" });
    persistLeadPatch(deps, { address: "1 Test St", issue_summary: "Leaking tap" });

    const written = calls.upsertLead.mock.calls[1][1];
    expect(written).toMatchObject({
      name: "Gary", phone: "+61412345678",
      address: "1 Test St", issue_summary: "Leaking tap",
      lead_id: "CA-test", call_id: "CA-test", tenant_id: "t-1"
    });
  });

  // The model sends "" when it has nothing rather than omitting the key. Taking
  // that literally erases a detail captured earlier in the same call — the
  // caller gave their address at minute one and it is blank in the SMS.
  it("does not let an empty value erase something already captured", () => {
    const { deps, calls } = harness();

    persistLeadPatch(deps, { name: "Gary", address: "1 Test St" });
    persistLeadPatch(deps, { name: "", address: undefined, issue_summary: "Blocked drain" });

    const written = calls.upsertLead.mock.calls[1][1];
    expect(written.name).toBe("Gary");
    expect(written.address).toBe("1 Test St");
    expect(written.issue_summary).toBe("Blocked drain");
  });

  it("records caller_intent on the call state and the row", () => {
    const { deps, calls, state } = harness();
    persistLeadPatch(deps, { caller_intent: "referred_out", issue_summary: "Water main" });
    expect(state.callerIntent).toBe("referred_out");
    expect(calls.upsertLead.mock.calls[0][1].caller_intent).toBe("referred_out");
  });

  // "default" is the fallback tenant used when no number matched. It is not a
  // real row, so attributing a lead to it would put a stranger's job in a
  // tenant list that does not exist.
  it("stores a lead unowned rather than attributing it to the fallback tenant", () => {
    const { deps, calls } = harness({
      tenant: { tenant_id: "default", name: "Fallback" } as TenantRow
    });
    persistLeadPatch(deps, { name: "Gary" });
    expect(calls.upsertLead.mock.calls[0][1].tenant_id).toBeNull();
  });

  it("only writes the transcript when STORE_FULL_TRANSCRIPT is on", () => {
    const off = harness({ storeFullTranscript: false });
    persistLeadPatch(off.deps, { name: "Gary" });
    expect(off.calls.appendTranscript).not.toHaveBeenCalled();

    const on = harness({ storeFullTranscript: true });
    persistLeadPatch(on.deps, { name: "Gary" });
    expect(on.calls.appendTranscript).toHaveBeenCalled();
  });
});
