import { env } from "../env.js";
import type { Db } from "../db/db.js";
import {
  getLatestLeadForCall, getCallFromNumber, getNotificationStatus,
  createNotification, markNotification, getTenantById, getTenantCallCount,
  logTenantSms
} from "../db/repo.js";
import {
  decideOwnerSms, formatOwnerSms, sendOwnerSms, FIRST_CALL_CELEBRATION_PREFIX
} from "../twilio/sms.js";
import { isEmailConfigured, sendEmail, formatLeadEmail } from "../utils/email.js";
import { exportLeadToCrm } from "../crm/index.js";
import type { CrmExporter } from "../crm/types.js";

/**
 * Everything that happens after a call ends: decide whether the owner hears
 * about it, export the lead, send the SMS, send the email, and record what
 * happened to each.
 *
 * Extracted from `main()` in server.ts on 2026-08-04. It was 165 lines in a
 * closure, which meant NO test could reach any of it — and this is the code
 * path that produces the product's only output. A reviewer had already proved
 * the cost by inverting the suppression test and watching the whole suite stay
 * green: that inversion suppresses every genuine job and wakes the owner for
 * every telemarketer, and nothing would have caught it.
 *
 * `decideOwnerSms` (the WHETHER) was pulled out first and is unit-tested. This
 * is the SEQUENCE, which carries its own decisions — the in-flight guard, the
 * first-call celebration, and which notification status each path records.
 *
 * Dependencies are injected rather than imported where they are closure state
 * in server.ts: the database handle, the in-flight set shared across
 * invocations, the CRM exporters built at boot, the analytics sink and the
 * logger.
 */
export type NotifyDeps = {
  db: Db;
  /**
   * Shared across invocations, and load-bearing. notifyOwnerSmsIfNeeded is
   * called twice for the same call about a second apart — once from onEndCall
   * and once from /twilio/voice/status — and this is the only thing covering
   * that window, because getNotificationStatus is still not "sent" while the
   * first sendOwnerSms is in flight.
   */
  smsInflight: Set<string>;
  crmExporters: CrmExporter[];
  trackEvent: (name: string, opts: Record<string, unknown>) => void;
  log: { info: (o: unknown, m?: string) => void; warn: (o: unknown, m?: string) => void };
};

export async function notifyOwnerSmsIfNeeded(
  deps: NotifyDeps,
  callId: string,
  callerIntent?: string | null,
  ownerPhone?: string,
  ownerEmail?: string
): Promise<void> {
  const { db, smsInflight, crmExporters, trackEvent, log } = deps;
  if (smsInflight.has(callId)) return;

  // The decision itself is decideOwnerSms in twilio/sms.ts, so it can be
  // tested: it was three conditionals in here, and a reviewer inverted the
  // suppression check with all 374 tests still green — which suppresses every
  // real job and wakes the owner for every telemarketer.
  const lead = getLatestLeadForCall(db, callId);
  const callerId = getCallFromNumber(db, callId);
  const decision = decideOwnerSms({
    callerIntent,
    alreadySent: getNotificationStatus(db, callId, "sms")?.status === "sent",
    lead,
    fromNumber: callerId
  });

  // Nothing to record for a message that already went out.
  //
  // The first version of this comment claimed the old order "left an orphan
  // pending notification on every repeat call, and getDailyFunnelStats counts
  // rows, so it inflated sms_total". Both halves were wrong and a reviewer
  // checked them: notifications has a UNIQUE index on (call_id, channel) and
  // createNotification is INSERT OR IGNORE, so no orphan is ever created; and
  // smsByDay filters `sent_at IS NOT NULL`, so a pending row could not be
  // counted anyway. The reordering is a behavioural no-op.
  //
  // Left in place because returning before the write is clearer than writing
  // and discarding — but recorded honestly, because a wrong rationale stated
  // as fact is what the next person acts on.
  if (!decision.send && decision.reason === "already_sent") return;

  const id = createNotification(db, callId, "sms");
  if (!decision.send && decision.reason === "intent") {
    markNotification(db, id, { status: "skipped", error: `intent:${callerIntent}` });
    trackEvent("sms_skipped_intent", {
      call_id: callId,
      level: "info",
      payload: { callerIntent }
    });
    log.info({ callId, callerIntent }, "skipping owner SMS for non-actionable call type");
    return;
  }
  if (!lead) {
    markNotification(db, id, { status: "skipped", error: "no_lead_for_call" });
    trackEvent("sms_skipped_no_lead", { call_id: callId, level: "warn" });
    return;
  }

  // Claim the call BEFORE anything with a side effect. notifyOwnerSmsIfNeeded
  // is invoked twice for the same call about a second apart — once from
  // onEndCall and once from /twilio/voice/status — and smsInflight is the
  // only guard covering that window, because getNotificationStatus is still
  // not "sent" while the first sendOwnerSms is in flight. Round 1 moved the
  // CRM export above this line and gave every tenant with Airtable or Sheets
  // export enabled two copies of every lead.
  smsInflight.add(callId);
  setTimeout(() => smsInflight.delete(callId), 60_000);

  // The CRM export runs before the emptiness check, and deliberately.
  // ownerSmsWouldSayNothing decides whether to INTERRUPT the owner — it is a
  // rule about his phone buzzing, not about what is worth keeping. A row
  // carrying only an address and a timestamp is a poor notification and a
  // perfectly good record, and the CRM is silent.
  exportLeadToCrm(crmExporters, lead)
    .then((results) => {
      const errors = results.filter((r) => !r.ok);
      if (errors.length) log.warn({ errors }, "crm export errors");
    })
    .catch((err) => log.warn({ err }, "crm export failed"));

  // Every real caller gets a message, whatever was collected — the only
  // exception is a message that would say nothing at all: no name, no number
  // the owner could ring, and nothing about what they wanted. That is not a
  // lead, it is a notification that the phone rang. See ownerSmsWouldSayNothing.
  // Email is suppressed alongside the SMS: it is the same interruption in a
  // slower medium, and an empty one costs the same attention to dismiss.
  if (!decision.send && decision.reason === "nothing_to_report") {
    markNotification(db, id, { status: "skipped", error: "nothing_to_report" });
    trackEvent("sms_skipped_empty", { call_id: callId, tenant_id: lead.tenant_id, level: "info" });
    log.info({ callId }, "skipping owner SMS: no name, no reachable number, no content");
    return;
  }

  // Resolve tenant to get business name and owner email for notifications
  const notifyTenant = lead.tenant_id ? getTenantById(db, lead.tenant_id) : null;
  const businessName = notifyTenant?.name ?? "Your Business";
  const recipientEmail = ownerEmail ?? notifyTenant?.owner_email ?? null;

  try {
    // Check if this is the tenant's first real call — send a celebration message
    const isFirstCall = notifyTenant && getTenantCallCount(db, notifyTenant.tenant_id) <= 1;

    const body = formatOwnerSms({
      lead,
      callId,
      callerIntent,
      dashboardUrl: env.PUBLIC_BASE_URL,
      fromNumber: callerId
    });
    const firstCallPrefix = isFirstCall ? FIRST_CALL_CELEBRATION_PREFIX : "";
    const sms = await sendOwnerSms(db, firstCallPrefix + body, ownerPhone);
    if (sms.status === "sent") {
      markNotification(db, id, { status: "sent", error: null });
      if (lead.tenant_id) logTenantSms(db, { tenant_id: lead.tenant_id, to_phone: sms.to, body: firstCallPrefix + body, status: "sent", twilio_sid: sms.sid });
      trackEvent("owner_sms_sent", { call_id: callId, tenant_id: lead.tenant_id });
      if (isFirstCall) {
        trackEvent("first_call_celebration", { tenant_id: lead.tenant_id, call_id: callId });
      }
    } else {
      markNotification(db, id, { status: "skipped", error: sms.reason });
      trackEvent("owner_sms_skipped", {
        call_id: callId,
        tenant_id: lead.tenant_id,
        level: "warn",
        payload: { reason: sms.reason }
      });
    }
  } catch (err: any) {
    markNotification(db, id, { status: "error", error: err?.message ?? String(err) });
    trackEvent("owner_sms_error", {
      call_id: callId,
      tenant_id: lead.tenant_id,
      level: "error",
      payload: { message: err?.message ?? String(err) }
    });
  }

  // Send email notification in parallel (non-blocking, best-effort)
  if (recipientEmail && isEmailConfigured()) {
    const emailId = createNotification(db, callId, "email");
    const { subject, text } = formatLeadEmail({
      lead, callerIntent, businessName,
      dashboardUrl: env.PUBLIC_BASE_URL
    });
    sendEmail({ to: recipientEmail, subject, text })
      .then((result) => {
        if (result.status === "sent") {
          markNotification(db, emailId, { status: "sent", error: null });
          trackEvent("owner_email_sent", { call_id: callId, tenant_id: lead.tenant_id });
        } else {
          markNotification(db, emailId, { status: "skipped", error: result.reason });
        }
      })
      .catch((err) => {
        markNotification(db, emailId, { status: "error", error: err?.message ?? String(err) });
        log.warn({ err, callId }, "owner email notification failed");
      });
  }

  // The emergency follow-up SMS used to live here: a second message two
  // minutes after any lead tagged urgency_level="emergency", asking whether
  // the owner had rung back. Removed 2026-07-28 with the rest of the urgency
  // machinery — every call now sends one message and the owner judges it.
  //
  // It was also three bugs in twelve lines, all recorded in BACKLOG.md before
  // the decision: no per-tenant cap, so twenty hail calls meant forty
  // messages; `lead` captured in the closure and never re-read, so marking the
  // job handled did not suppress it; and an unref'd in-process timer, so a
  // deploy inside the window cancelled it silently anyway.
}
