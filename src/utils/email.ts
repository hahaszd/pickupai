import pino from "pino";
import nodemailer from "nodemailer";
import { env } from "../env.js";
import type { LeadRow } from "../db/repo.js";

const log = pino({ level: "info" });

/** Returns true when SMTP is configured. */
export function isEmailConfigured(): boolean {
  return !!(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS);
}

/** Send an email via SMTP using nodemailer. */
export async function sendEmail(opts: {
  to: string;
  subject: string;
  text: string;
}): Promise<{ status: "sent" } | { status: "skipped"; reason: string }> {
  if (!isEmailConfigured()) {
    return { status: "skipped", reason: "smtp_not_configured" };
  }
  const { SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, SMTP_FROM } = env;

  try {
    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE,
      auth: { user: SMTP_USER, pass: SMTP_PASS }
    });

    await transporter.sendMail({
      from: SMTP_FROM,
      to: opts.to,
      subject: opts.subject,
      text: opts.text
    });

    log.info({ to: opts.to, subject: opts.subject }, "email sent");
    return { status: "sent" };
  } catch (err: any) {
    log.warn({ err, to: opts.to }, "email send failed");
    return { status: "skipped", reason: err?.message ?? "unknown_error" };
  }
}

/** Format a lead notification email body. */
export function formatLeadEmail(opts: {
  lead: LeadRow;
  callerIntent?: string | null;
  businessName: string;
  dashboardUrl: string;
}): { subject: string; text: string } {
  const { lead, callerIntent, businessName, dashboardUrl } = opts;
  const intent = callerIntent ?? "unknown";
  const urgency = lead.urgency_level ?? "routine";

  const urgencyTag = urgency === "emergency" ? " [EMERGENCY]" : urgency === "urgent" ? " [URGENT]" : "";
  const intentLabel =
    intent === "new_job" ? "New Job" :
    intent === "follow_up" ? "Follow-up" :
    intent === "complaint" ? "Complaint" :
    intent === "reschedule" ? "Reschedule" :
    intent === "quote_only" ? "Quote Request" :
    intent === "supplier" ? "Supplier Call" :
    intent === "trade_referral" ? "Referral" :
    "Call";

  const subject = `${intentLabel}${urgencyTag} — ${lead.name ?? "Unknown caller"} | ${businessName}`;

  const lines = [
    `New ${intentLabel.toLowerCase()} via PickupAI for ${businessName}`,
    "",
    lead.name          ? `Name:           ${lead.name}` : null,
    lead.phone         ? `Phone:          ${lead.phone}` : null,
    lead.address       ? `Address:        ${lead.address}` : null,
    lead.issue_summary ? `Details:        ${lead.issue_summary}` : null,
    lead.urgency_level ? `Urgency:        ${lead.urgency_level.toUpperCase()}` : null,
    lead.preferred_time ? `Preferred time: ${lead.preferred_time}` : null,
    lead.next_action   ? `Next action:    ${lead.next_action}` : null,
    "",
    `View full details: ${dashboardUrl}/dashboard/leads/${lead.lead_id}`,
    "",
    `—`,
    `PickupAI · Your 24/7 AI Receptionist`,
    `To stop these emails, update your notification settings in the dashboard.`
  ].filter((l): l is string => l !== null);

  return { subject, text: lines.join("\n") };
}
