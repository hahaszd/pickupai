import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import { EventEmitter } from "node:events";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import type { NextFunction, Request, Response } from "express";
import { WebSocketServer } from "ws";
import pino from "pino";
import pinoHttp from "pino-http";
import { buildSystemPrompt, type ChatContext } from "./chat/system-prompt.js";
import { createSilenceMP3, getSpeakerChangeDelay } from "./silence.js";

// ─── Simple in-memory rate limiter ────────────────────────────────────────────
// Tracks attempt counts per IP in a sliding window. No external deps needed.
const rateLimitStore = new Map<string, { count: number; windowStart: number }>();

function rateLimit(opts: { maxRequests: number; windowMs: number; message?: string }) {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ?? req.socket.remoteAddress ?? "unknown";
    const now = Date.now();
    const key = `${req.path}:${ip}`;
    const entry = rateLimitStore.get(key);
    if (!entry || now - entry.windowStart > opts.windowMs) {
      rateLimitStore.set(key, { count: 1, windowStart: now });
      return next();
    }
    entry.count++;
    if (entry.count > opts.maxRequests) {
      return res.status(429).send(opts.message ?? "Too many requests. Please try again later.");
    }
    return next();
  };
}

// Prune stale rate-limit entries every 5 minutes to avoid memory growth.
setInterval(() => {
  const cutoff = Date.now() - 10 * 60 * 1000;
  for (const [key, entry] of rateLimitStore) {
    if (entry.windowStart < cutoff) rateLimitStore.delete(key);
  }
}, 5 * 60 * 1000).unref();

// ─── One-time stream tokens for WebSocket authentication ───────────────────
// Each TwiML <Stream> gets a unique token passed as a custom parameter.
// The media-stream WebSocket validates it on the "start" event.
const streamTokens = new Map<string, number>();
setInterval(() => {
  const now = Date.now();
  for (const [token, expiry] of streamTokens) {
    if (expiry < now) streamTokens.delete(token);
  }
}, 5 * 60 * 1000).unref();

// ─── Admin session tokens ──────────────────────────────────────────────────
// Random session tokens issued on admin login; avoids storing the raw
// ADMIN_TOKEN secret in a cookie.
const adminSessions = new Map<string, number>(); // token → expiresAt
const ADMIN_SESSION_TTL_MS = 24 * 60 * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  for (const [tok, exp] of adminSessions) {
    if (exp < now) adminSessions.delete(tok);
  }
}, 5 * 60 * 1000).unref();

function safeTokenCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

import { env } from "./env.js";
import { openDb } from "./db/db.js";
import {
  appendTranscript,
  claimDemoNumber,
  createNotification,
  createAnalyticsEvent,
  createTenant,
  deleteTenant,
  generateTempPassword,
  getActiveDemoSession,
  getAdminTenantDetail,
  getLatestLeadForCall,
  getLeadHistoryByPhone,
  getLeadWithCall,
  getNotificationStatus,
  getOverviewStats,
  getDailyFunnelStats,
  getTenantById,
  getTenantByNumber,
  getTenantBySessionToken,
  getDemoTenantByNumber,
  hashPassword,
  listLeadsForTenant,
  listNotificationsForCall,
  listAnalyticsEvents,
  listSystemConfig,
  listTenants,
  listTenantsWithStats,
  listDemoSessions,
  clearDemoSessions,
  markNotification,
  setSystemConfig,
  getSystemConfig,
  tenantLogin,
  tenantLogout,
  updateLeadStatus,
  updateTenant,
  upsertCall,
  upsertLead,
  createProspect,
  updateProspect,
  getProspectById,
  listProspects,
  deleteProspect,
  getProspectStats,
  importProspects,
  createOutreachLog,
  listOutreachForProspect,
  createPasswordResetToken,
  verifyPasswordResetToken,
  getTenantLeadStats,
  getFoundingCustomerCount,
  getTenantsNeedingNudge,
  getTenantCallCount,
  newLeadId,
  insertChatLog,
  updateChatLogResponse,
  listChatLogs,
  countChatLogs
} from "./db/repo.js";
import type { TenantRow, CallRow, SystemConfigRow, ProspectRow, ChatLogRow } from "./db/repo.js";
import {
  adminLoginPage,
  adminOverviewPage,
  adminFunnelPage,
  adminUsersPage,
  adminUserDetailPage,
  adminDemoSessionsPage,
  adminConfigPage,
  adminProspectsPage,
  adminProspectDetailPage,
  adminProspectImportPage,
  adminBulkSmsPage,
  adminChatLogsPage,
  buildProvisionSms,
} from "./admin/pages.js";
import { twilioValidateMiddleware } from "./twilio/verify.js";
import { buildAbsoluteUrl, getCallSid, shouldWarmTransferNow } from "./twilio/flow.js";
import { newVoiceResponse, connectStreamTwiml, sayFriendly, voicemailFallbackTwiml } from "./twilio/twiml.js";
import { getOrInitCallState, setCallState, clearCallState } from "./twilio/state.js";
import { startCallRecording } from "./twilio/recording.js";
import { formatOwnerSms, NO_SMS_INTENTS, sendOwnerSms, generateForwardingCode, FIRST_CALL_CELEBRATION_PREFIX, buildCallerConfirmationSms } from "./twilio/sms.js";
import { isEmailConfigured, sendEmail, formatLeadEmail } from "./utils/email.js";
import { formatAuPhone } from "./utils/phone.js";
import { createCrmExporters, exportLeadToCrm } from "./crm/index.js";
import { RealtimeSession } from "./realtime/session.js";
import {
  loginPage,
  signupPage,
  welcomePage,
  leadsPage,
  leadDetailPage,
  settingsPage,
  upgradePage,
  statsPage,
  forgotPasswordPage,
  resetPasswordPage,
  setGaMeasurementId
} from "./dashboard/pages.js";
import { gaHeadSnippet } from "./analytics/ga.js";
import Stripe from "stripe";

/** Lazy Stripe client — only instantiated if STRIPE_SECRET_KEY is set */
function getStripe(): Stripe | null {
  if (!env.STRIPE_SECRET_KEY) return null;
  return new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" as any });
}

const log = pino({ level: "info" });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, "../public");

// ─── Cookie helpers (no extra deps needed) ───────────────────────────────────

/** Returns true if the tenant hasn't linked a real Twilio number yet */
function isPendingNumber(twilio_number: string | null | undefined): boolean {
  return !twilio_number || twilio_number.startsWith("+PENDING_");
}

function parseCookies(req: Request): Record<string, string> {
  const cookies: Record<string, string> = {};
  const header = req.headers.cookie ?? "";
  header.split(";").forEach((part) => {
    const idx = part.indexOf("=");
    if (idx < 0) return;
    const key = part.slice(0, idx).trim();
    const val = decodeURIComponent(part.slice(idx + 1).trim());
    cookies[key] = val;
  });
  return cookies;
}

function setSessionCookie(res: Response, token: string) {
  res.setHeader(
    "Set-Cookie",
    `dash_session=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Lax; Path=/dashboard; Max-Age=${60 * 60 * 24 * 30}`
  );
}

function clearSessionCookie(res: Response) {
  res.setHeader("Set-Cookie", "dash_session=; HttpOnly; Secure; SameSite=Lax; Path=/dashboard; Max-Age=0");
}

// ─── CSV export helper ────────────────────────────────────────────────────────

function csvSafe(val: string): string {
  if (/^[=+\-@\t\r]/.test(val)) return "'" + val;
  return val;
}

function leadsToCSV(leads: any[]): string {
  const headers = ["name", "phone", "address", "issue_type", "issue_summary", "urgency_level", "preferred_time", "lead_status", "next_action", "created_at"];
  const rows = leads.map((l) =>
    headers.map((h) => `"${csvSafe(String(l[h] ?? "")).replace(/"/g, '""')}"`).join(",")
  );
  return [headers.join(","), ...rows].join("\n");
}

// ─── Seed default tenant from env vars ───────────────────────────────────────

function seedDefaultTenant(db: any) {
  const existing = listTenants(db);
  if (existing.length > 0) return;
  if (!env.TWILIO_DEFAULT_VOICE_NUMBER) return;

  log.info("No tenants found — seeding default tenant from env vars");
  try {
    createTenant(db, {
      name: "My Tradie Business",
      trade_type: "tradie",
      ai_name: "Olivia",
      twilio_number: env.TWILIO_DEFAULT_VOICE_NUMBER,
      owner_phone: env.OWNER_PHONE_NUMBER || "",
      owner_email: env.SEED_EMAIL ?? "owner@example.com",
      password: env.SEED_PASSWORD ?? "changeme123"
    });
    log.info(
      { number: env.TWILIO_DEFAULT_VOICE_NUMBER, email: env.SEED_EMAIL ?? "owner@example.com" },
      "Default tenant created. Check SEED_EMAIL / SEED_PASSWORD env vars for login credentials."
    );
  } catch (err) {
    log.warn({ err }, "Failed to seed default tenant");
  }
}

// ─── Fallback tenant (for callers to any unregistered number) ─────────────────

function buildFallbackTenant(): TenantRow {
  return {
    tenant_id: "default",
    name: "My Tradie Business",
    trade_type: "tradie",
    ai_name: "Olivia",
    twilio_number: env.TWILIO_DEFAULT_VOICE_NUMBER ?? "",
    owner_phone: env.OWNER_PHONE_NUMBER ?? "",
    owner_email: null,
    password_hash: null,
    session_token: null,
    business_hours_start: env.BUSINESS_HOURS_START,
    business_hours_end: env.BUSINESS_HOURS_END,
    timezone: env.BUSINESS_TIMEZONE,
    enable_warm_transfer: env.ENABLE_WARM_TRANSFER ? 1 : 0,
    service_area: null,
    custom_instructions: null,
    vacation_mode: 0,
    vacation_message: null,
    active: 1,
    created_at: new Date().toISOString(),
    last_login_at: null,
    payment_status: null,
    trial_ends_at: null,
    stripe_customer_id: null
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  // Startup validations
  if (!env.OPENAI_API_KEY) {
    log.warn("OPENAI_API_KEY is not set — AI voice calls will fail. Set it in your environment variables.");
  }

  const db = await openDb(env.SQLITE_PATH, env.DATABASE_URL);
  seedDefaultTenant(db);

  // Auto-configure Twilio webhook URLs to point to this server instance.
  // Whichever environment (dev/prod) starts last takes ownership of the numbers.
  if (env.TWILIO_AUTO_CONFIGURE_WEBHOOKS) {
    try {
      const { twilioClient } = await import("./twilio/client.js");
      const voiceUrl = `${env.PUBLIC_BASE_URL}/twilio/voice/incoming`;
      const statusCallback = `${env.PUBLIC_BASE_URL}/twilio/voice/status`;
      const numbers = await twilioClient.incomingPhoneNumbers.list({ limit: 50 });
      for (const num of numbers) {
        await twilioClient.incomingPhoneNumbers(num.sid).update({
          voiceUrl,
          voiceMethod: "POST",
          statusCallback,
          statusCallbackMethod: "POST"
        });
        log.info({ number: num.phoneNumber, voiceUrl }, "Twilio webhook updated");
      }
    } catch (err) {
      log.error({ err }, "Failed to auto-configure Twilio webhooks — continuing anyway");
    }
  }

  const app = express();
  setGaMeasurementId(env.GA_MEASUREMENT_ID);
  const crmExporters = createCrmExporters();

  if (crmExporters.length > 0) {
    log.info({ destinations: crmExporters.map((e) => e.destination) }, "crm exporters enabled");
  }

  // ── Notification helper ───────────────────────────────────────────────────

  const smsInflight = new Set<string>();

  async function notifyOwnerSmsIfNeeded(
    callId: string,
    callerIntent?: string | null,
    ownerPhone?: string,
    ownerEmail?: string
  ) {
    if (smsInflight.has(callId)) return;

    const id = createNotification(db, callId, "sms");
    if (callerIntent && NO_SMS_INTENTS.has(callerIntent)) {
      markNotification(db, id, { status: "skipped", error: `intent:${callerIntent}` });
      trackEvent("sms_skipped_intent", {
        call_id: callId,
        level: "info",
        payload: { callerIntent }
      });
      log.info({ callId, callerIntent }, "skipping owner SMS for non-actionable call type");
      return;
    }
    const existing = getNotificationStatus(db, callId, "sms");
    if (existing?.status === "sent") return;
    const lead = getLatestLeadForCall(db, callId);
    if (!lead) {
      markNotification(db, id, { status: "skipped", error: "no_lead_for_call" });
      trackEvent("sms_skipped_no_lead", { call_id: callId, level: "warn" });
      return;
    }

    smsInflight.add(callId);
    setTimeout(() => smsInflight.delete(callId), 60_000);

    exportLeadToCrm(crmExporters, lead)
      .then((results) => {
        const errors = results.filter((r) => !r.ok);
        if (errors.length) log.warn({ errors }, "crm export errors");
      })
      .catch((err) => log.warn({ err }, "crm export failed"));

    // Resolve tenant to get business name and owner email for notifications
    const notifyTenant = lead.tenant_id ? getTenantById(db, lead.tenant_id) : null;
    const businessName = notifyTenant?.name ?? "Your Business";
    const recipientEmail = ownerEmail ?? notifyTenant?.owner_email ?? null;

    try {
      // Check if this is the tenant's first real call — send a celebration message
      const isFirstCall = notifyTenant && getTenantCallCount(db, notifyTenant.tenant_id) <= 1;

      const body = formatOwnerSms({ lead, callId, callerIntent, dashboardUrl: env.PUBLIC_BASE_URL });
      const firstCallPrefix = isFirstCall ? FIRST_CALL_CELEBRATION_PREFIX : "";
      const sms = await sendOwnerSms(db, firstCallPrefix + body, ownerPhone);
      if (sms.status === "sent") {
        markNotification(db, id, { status: "sent", error: null });
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

    // For emergency calls: send a second urgent follow-up SMS 2 minutes later
    // to ensure the owner doesn't miss it
    if (lead.urgency_level === "emergency") {
      const ownerSmsNumber = ownerPhone ?? notifyTenant?.owner_phone;
      if (ownerSmsNumber) {
        const emergencyTimer = setTimeout(async () => {
          try {
            await sendOwnerSms(
              db,
              `EMERGENCY FOLLOW-UP\n${lead.name ?? "A caller"} reported an emergency${lead.address ? ` at ${lead.address}` : ""}.\nHave you called them back?\n${lead.phone ? `Their number: ${formatAuPhone(lead.phone)}\n` : ""}View job: ${env.PUBLIC_BASE_URL}/dashboard/leads/${lead.lead_id}`,
              ownerSmsNumber
            );
            trackEvent("emergency_followup_sms_sent", { call_id: callId, tenant_id: lead.tenant_id });
          } catch (err) {
            log.warn({ err, callId }, "emergency follow-up SMS failed");
          }
        }, 2 * 60 * 1000); // 2 minutes
        if (typeof emergencyTimer.unref === "function") emergencyTimer.unref();
      }
    }
  }

  function trackEvent(
    eventName: string,
    opts: {
      tenant_id?: string | null;
      call_id?: string | null;
      level?: "info" | "warn" | "error";
      payload?: Record<string, unknown>;
    } = {}
  ) {
    const payloadJson = opts.payload ? JSON.stringify(opts.payload) : null;
    createAnalyticsEvent(db, {
      event_name: eventName,
      tenant_id: opts.tenant_id ?? null,
      call_id: opts.call_id ?? null,
      level: opts.level ?? "info",
      payload_json: payloadJson
    });
    const logPayload = { eventName, tenant_id: opts.tenant_id, call_id: opts.call_id, ...(opts.payload ?? {}) };
    if (opts.level === "error") log.error(logPayload, "analytics event");
    else if (opts.level === "warn") log.warn(logPayload, "analytics event");
    else log.info(logPayload, "analytics event");
  }

  // ── Stripe webhook (MUST be registered before express.json() to preserve raw body) ──

  app.post("/stripe/webhook", express.raw({ type: "application/json" }), async (req, res) => {
    const stripe = getStripe();
    if (!stripe || !env.STRIPE_WEBHOOK_SECRET) {
      return res.sendStatus(200);
    }
    const sig = req.headers["stripe-signature"] as string;
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, env.STRIPE_WEBHOOK_SECRET);
    } catch (err: any) {
      log.warn({ err }, "Stripe webhook signature verification failed");
      return res.status(400).send("Webhook signature verification failed");
    }

    try {
      if (event.type === "checkout.session.completed") {
        const session = event.data.object as Stripe.Checkout.Session;
        const tenantId = session.metadata?.tenant_id;
        if (tenantId) {
          const existing = getTenantById(db, tenantId);
          if (existing && (existing.payment_status === "demo" || existing.payment_status === "pending")) {
            const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
            updateTenant(db, tenantId, {
              payment_status: "trial",
              trial_ends_at: trialEndsAt,
              stripe_customer_id: session.customer as string
            });
            if (env.OWNER_PHONE_NUMBER) {
              try {
                const sms = await sendOwnerSms(db,
                  `PickupAI: New trial started (card on file) - ${existing.name} (${formatAuPhone(existing.owner_phone)}). Trial ends in 14 days. Admin: ${env.PUBLIC_BASE_URL}/admin/users/${tenantId}`
                );
                if (sms.status === "skipped") log.warn({ reason: sms.reason }, "founder trial notification SMS skipped");
              } catch (e) { log.warn({ e }, "founder trial notification SMS failed"); }
            }
          } else {
            log.info({ tenantId, currentStatus: existing?.payment_status }, "checkout.session.completed received but tenant not demo/pending — skipping (idempotent)");
          }
        }
      } else if (event.type === "invoice.payment_succeeded") {
        const invoice = event.data.object as Stripe.Invoice;
        const billingReason = (invoice as any).billing_reason;
        if (billingReason === "subscription_create" && (invoice as any).amount_paid === 0) {
          log.info("Stripe: trial start $0 invoice — skipping activation");
        } else {
          const customerId = typeof invoice.customer === "string" ? invoice.customer : (invoice.customer as any)?.id;
          const tenants = listTenants(db);
          const t = tenants.find(x => x.stripe_customer_id === customerId);
          if (t) {
            updateTenant(db, t.tenant_id, { payment_status: "active" });
            log.info({ tenantId: t.tenant_id, billingReason }, "Stripe payment succeeded — account active");

            if (billingReason === "subscription_create") {
              try {
                const hasNumber = !t.twilio_number.startsWith("+PENDING");
                const activationBody = hasNumber
                  ? `Your PickupAI subscription is now active, ${t.name}! Your number: ${formatAuPhone(t.twilio_number)}. If you haven't already, set up call forwarding from your welcome page: ${env.PUBLIC_BASE_URL}/dashboard/welcome`
                  : `Your PickupAI subscription is now active, ${t.name}! We're setting up your dedicated number - you'll get an SMS with your activation code shortly.`;
                const sms = await sendOwnerSms(db, activationBody, t.owner_phone);
                if (sms.status === "skipped") log.warn({ reason: sms.reason }, "customer activation SMS skipped");
              } catch (e) { log.warn({ e }, "customer activation SMS failed"); }
              if (env.OWNER_PHONE_NUMBER) {
                try {
                  const sms = await sendOwnerSms(db,
                    `PickupAI: New paying customer - ${t.name} (${formatAuPhone(t.owner_phone)}). Log in to assign their number: ${env.PUBLIC_BASE_URL}/admin/users/${t.tenant_id}`
                  );
                  if (sms.status === "skipped") log.warn({ reason: sms.reason }, "founder payment notification SMS skipped");
                } catch (e) { log.warn({ e }, "founder notification SMS failed"); }
              }
            }
          }
        }
      } else if (event.type === "customer.subscription.deleted") {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
        const tenants = listTenants(db);
        const t = tenants.find(x => x.stripe_customer_id === customerId);
        if (t) {
          updateTenant(db, t.tenant_id, { payment_status: "expired" });
          log.info({ tenantId: t.tenant_id }, "Stripe subscription cancelled — account expired");
        }
      } else if (event.type === "customer.subscription.updated") {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
        const tenants = listTenants(db);
        const t = tenants.find(x => x.stripe_customer_id === customerId);
        if (t) {
          if (sub.cancel_at_period_end) {
            updateTenant(db, t.tenant_id, { payment_status: "cancelling" });
            const periodEnd = new Date((sub as any).current_period_end * 1000).toLocaleDateString("en-AU");
            try {
              await sendOwnerSms(db,
                `PickupAI: Your subscription is set to cancel on ${periodEnd}. Your AI receptionist will stay active until then.`,
                t.owner_phone
              );
            } catch (e) { log.warn({ e }, "cancelling notification SMS failed"); }
            log.info({ tenantId: t.tenant_id, periodEnd }, "Subscription cancelling at period end");
          } else if (t.payment_status === "cancelling") {
            updateTenant(db, t.tenant_id, { payment_status: "active" });
            log.info({ tenantId: t.tenant_id }, "Subscription reactivated — cancellation reversed");
          }
        }
      } else if (event.type === "invoice.payment_failed") {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = typeof invoice.customer === "string" ? invoice.customer : (invoice.customer as any)?.id;
        const tenants = listTenants(db);
        const t = tenants.find(x => x.stripe_customer_id === customerId);
        if (t) {
          updateTenant(db, t.tenant_id, { payment_status: "payment_failed" });
          log.warn({ tenantId: t.tenant_id }, "Stripe payment failed — marking account, notifying customer");
          try {
            const sms = await sendOwnerSms(db,
              `PickupAI: Your payment failed. Your AI receptionist may stop answering calls soon. Please update your payment method at ${env.PUBLIC_BASE_URL}/dashboard/upgrade or contact us at hello@getpickupai.com.au`,
              t.owner_phone
            );
            if (sms.status === "skipped") log.warn({ reason: sms.reason }, "payment failed notification SMS skipped");
          } catch (e) { log.warn({ e }, "payment failed notification SMS failed"); }
          if (env.OWNER_PHONE_NUMBER) {
            try {
              await sendOwnerSms(db,
                `PickupAI: Payment failed for ${t.name} (${formatAuPhone(t.owner_phone)}). Follow up: ${env.PUBLIC_BASE_URL}/admin/users/${t.tenant_id}`
              );
            } catch (e) { log.warn({ e }, "founder payment-failed notification SMS failed"); }
          }
        }
      }
    } catch (err: any) {
      log.error({ err }, "Stripe webhook handler error");
      return res.sendStatus(500);
    }
    res.sendStatus(200);
  });

  // ── Middleware ────────────────────────────────────────────────────────────

  app.use(
    express.urlencoded({
      extended: false,
      verify: (req, _res, buf) => { (req as any).rawBody = buf.toString("utf8"); }
    })
  );
  app.use(express.json());
  app.use(pinoHttp({ logger: log }));

  // Security response headers
  app.use((_req, res, next) => {
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    next();
  });

  // Inject GA4 snippet into static marketing pages when GA_MEASUREMENT_ID is set.
  if (env.GA_MEASUREMENT_ID) {
    const gaSnippet = gaHeadSnippet(env.GA_MEASUREMENT_ID);
    const gaInject = (_req: Request, res: Response, next: NextFunction) => {
      const filePath = path.join(PUBLIC_DIR, _req.path === "/" ? "index.html" : _req.path + ".html");
      fs.readFile(filePath, "utf-8", (err, html) => {
        if (err) return next();
        res.type("html").send(html.replace("</head>", gaSnippet + "\n</head>"));
      });
    };
    app.get("/", gaInject);
    app.get("/terms", gaInject);
    app.get("/privacy", gaInject);
  }

  // Serve landing page from /public
  app.use(express.static(PUBLIC_DIR));

  // Clean URLs for legal pages
  app.get("/terms", (_req, res) => res.sendFile(path.join(PUBLIC_DIR, "terms.html")));
  app.get("/privacy", (_req, res) => res.sendFile(path.join(PUBLIC_DIR, "privacy.html")));

  const twilioVerify = twilioValidateMiddleware({
    authToken: env.TWILIO_AUTH_TOKEN,
    enabled: env.TWILIO_VALIDATE_SIGNATURE,
    publicBaseUrl: env.PUBLIC_BASE_URL
  });

  // ── Admin guard (API: header/query — UI: cookie) ──────────────────────────

  const adminGuard = (req: Request, res: Response, next: NextFunction) => {
    if (!env.ADMIN_TOKEN) {
      return res.status(503).send("Admin panel is not configured. Set ADMIN_TOKEN to enable.");
    }
    const token = typeof req.header("x-admin-token") === "string"
      ? req.header("x-admin-token")!
      : typeof req.query.token === "string" ? req.query.token as string : "";
    if (token && safeTokenCompare(token, env.ADMIN_TOKEN)) return next();
    return res.status(401).json({ error: "unauthorized" });
  };

  /** Cookie-based admin auth for HTML panel */
  const adminHtmlAuth = (req: Request, res: Response, next: NextFunction) => {
    if (!env.ADMIN_TOKEN) {
      return res.status(503).send("Admin panel is not configured. Set ADMIN_TOKEN to enable.");
    }
    const cookies = parseCookies(req);
    const sessionToken = cookies.admin_session;
    if (sessionToken && adminSessions.has(sessionToken) && adminSessions.get(sessionToken)! > Date.now()) return next();
    // Also accept x-admin-token header or ?token= for backwards compat
    const token = typeof req.header("x-admin-token") === "string"
      ? req.header("x-admin-token")!
      : typeof req.query.token === "string" ? req.query.token as string : "";
    if (token && safeTokenCompare(token, env.ADMIN_TOKEN)) return next();
    return res.redirect("/admin/login");
  };

  // ── Dashboard auth middleware ──────────────────────────────────────────────

  const dashAuth = (req: Request, res: Response, next: NextFunction) => {
    const cookies = parseCookies(req);
    const token = cookies.dash_session;
    if (!token) return res.redirect("/dashboard/login");
    const tenant = getTenantBySessionToken(db, token);
    if (!tenant) return res.redirect("/dashboard/login");
    (req as any).dashTenant = tenant;
    next();
  };

  /** Blocks access to premium routes when trial has expired or payment is pending.
   *  - "active"          → always allowed
   *  - "trial" + valid   → allowed
   *  - "pending"         → redirect to checkout (signup incomplete)
   *  - null / "none"     → allowed (legacy/seed accounts — no card required)
   *  - "payment_failed"  → redirect to upgrade page with payment failed message
   *  - "trial" expired, "expired", "cancelled" → redirect to upgrade page */
  const trialGuard = (req: Request, res: Response, next: NextFunction) => {
    const tenant: TenantRow = (req as any).dashTenant;
    if (!tenant) return next();
    const status = tenant.payment_status;
    if (status === "active" || status === "cancelling") return next();
    if (!status || status === "none") return next(); // legacy / seed accounts
    if (status === "demo") {
      return res.redirect("/dashboard/welcome");
    }
    if (status === "pending") {
      return res.redirect("/dashboard/upgrade?reason=pending");
    }
    if (status === "payment_failed") {
      return res.redirect("/dashboard/upgrade?reason=payment_failed");
    }
    if (status === "trial" && tenant.trial_ends_at) {
      if (new Date(tenant.trial_ends_at) > new Date()) return next(); // still in trial
    }
    if (status === "trial" || status === "expired" || status === "cancelled") {
      return res.redirect("/dashboard/upgrade");
    }
    next();
  };

  // ── Health ────────────────────────────────────────────────────────────────

  app.get("/health", (_req, res) => res.json({ ok: true, mode: "realtime", multiTenant: true }));

  // Public stats for landing page social proof
  app.get("/api/stats", (_req, res) => {
    const totalCalls = db.get<{ n: number }>("SELECT COUNT(*) AS n FROM calls WHERE status = 'completed' AND is_demo = 0")?.n ?? 0;
    const totalTenants = db.get<{ n: number }>("SELECT COUNT(*) AS n FROM tenants WHERE active = 1 AND twilio_number NOT LIKE '+PENDING%'")?.n ?? 0;
    res.json({ calls_answered: totalCalls, businesses_served: totalTenants });
  });

  // ── AI Chat Assistant ─────────────────────────────────────────────────────
  const chatRateLimitAnon = rateLimit({ maxRequests: 20, windowMs: 60_000, message: "Too many chat messages. Please wait a moment." });
  const chatRateLimitAuth = rateLimit({ maxRequests: 40, windowMs: 60_000, message: "Too many chat messages. Please wait a moment." });

  app.post("/api/chat", (req, res, next) => {
    const cookies = parseCookies(req);
    const token = cookies.dash_session;
    const tenant = token ? getTenantBySessionToken(db, token) : null;
    (req as any).chatTenant = tenant ?? null;
    const limiter = tenant ? chatRateLimitAuth : chatRateLimitAnon;
    limiter(req, res, next);
  }, async (req: Request, res: Response) => {
    if (!env.OPENAI_API_KEY) {
      return res.status(503).json({ error: "Chat is temporarily unavailable." });
    }

    const body = req.body;
    if (!body || !Array.isArray(body.messages)) {
      return res.status(400).json({ error: "Invalid request. Provide { messages: [...] }." });
    }

    const MAX_HISTORY = 20;
    const userMessages: Array<{ role: string; content: string }> = body.messages
      .slice(-MAX_HISTORY)
      .filter((m: any) => typeof m.role === "string" && typeof m.content === "string" && (m.role === "user" || m.role === "assistant"))
      .map((m: any) => ({ role: m.role as string, content: (m.content as string).slice(0, 2000) }));

    if (userMessages.length === 0) {
      return res.status(400).json({ error: "At least one message is required." });
    }

    const tenant = (req as any).chatTenant as TenantRow | null;
    const ctx: ChatContext = {
      isAuthenticated: !!tenant,
      businessName: tenant?.name,
      tradeType: tenant?.trade_type,
    };

    const systemPrompt = buildSystemPrompt(ctx);

    const lastUserMsg = userMessages.filter(m => m.role === "user").pop()?.content ?? "";
    const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ?? req.socket.remoteAddress ?? "unknown";
    const chatLogId = insertChatLog(db, {
      tenantId: tenant?.tenant_id,
      ip,
      userMessage: lastUserMsg,
    });

    try {
      const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          stream: true,
          max_tokens: 800,
          messages: [
            { role: "system", content: systemPrompt },
            ...userMessages,
          ],
        }),
      });

      if (!openaiRes.ok) {
        const errText = await openaiRes.text();
        log.error({ status: openaiRes.status, body: errText }, "OpenAI chat completions error");
        return res.status(502).json({ error: "AI is temporarily unavailable. Please try again." });
      }

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders();

      const reader = openaiRes.body as any;
      if (!reader || typeof reader[Symbol.asyncIterator] !== "function") {
        res.write("data: [DONE]\n\n");
        return res.end();
      }

      const decoder = new TextDecoder();
      let buffer = "";
      let fullResponse = "";

      for await (const chunk of reader) {
        buffer += decoder.decode(chunk, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data: ")) continue;
          const payload = trimmed.slice(6);
          if (payload === "[DONE]") {
            res.write("data: [DONE]\n\n");
            continue;
          }
          try {
            const parsed = JSON.parse(payload);
            const token = parsed.choices?.[0]?.delta?.content;
            if (token) {
              fullResponse += token;
              res.write(`data: ${JSON.stringify({ token })}\n\n`);
            }
          } catch {
            // skip malformed SSE lines
          }
        }
      }

      if (buffer.trim()) {
        const trimmed = buffer.trim();
        if (trimmed.startsWith("data: ")) {
          const payload = trimmed.slice(6);
          if (payload === "[DONE]") {
            res.write("data: [DONE]\n\n");
          } else {
            try {
              const parsed = JSON.parse(payload);
              const token = parsed.choices?.[0]?.delta?.content;
              if (token) {
                fullResponse += token;
                res.write(`data: ${JSON.stringify({ token })}\n\n`);
              }
            } catch { /* skip */ }
          }
        }
      }

      if (fullResponse) {
        try { updateChatLogResponse(db, chatLogId, fullResponse); } catch { /* non-critical */ }
      }

      res.write("data: [DONE]\n\n");
      res.end();
    } catch (err: any) {
      log.error({ err }, "Chat endpoint error");
      if (!res.headersSent) {
        return res.status(500).json({ error: "Something went wrong. Please try again." });
      }
      res.end();
    }
  });

  // ── System health monitoring ───────────────────────────────────────────────
  app.get("/health/detailed", adminGuard, (_req, res) => {
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" });
    const recentErrors = db.all<{ event_name: string; created_at: string; payload_json: string | null }>(
      `SELECT event_name, created_at, payload_json FROM analytics_events
       WHERE level IN ('warn','error') AND created_at >= ? ORDER BY created_at DESC LIMIT 50`,
      [today + "T00:00:00.000Z"]
    );
    const aiFailures = db.get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM analytics_events WHERE (event_name LIKE '%fail%' OR event_name LIKE '%error%' OR event_name LIKE '%timeout%') AND created_at >= ?`,
      [today + "T00:00:00.000Z"]
    )?.n ?? 0;
    const smsFailed = db.get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM notifications WHERE status IN ('error','failed') AND sent_at >= ?`,
      [today + "T00:00:00.000Z"]
    )?.n ?? 0;
    const callsInProgress = db.get<{ n: number }>(
      "SELECT COUNT(*) AS n FROM calls WHERE status = 'in-progress'"
    )?.n ?? 0;
    res.json({
      ok: aiFailures === 0 && smsFailed === 0,
      timestamp: new Date().toISOString(),
      today: { ai_failures: aiFailures, sms_failed: smsFailed, calls_in_progress: callsInProgress },
      recent_errors: recentErrors.slice(0, 20)
    });
  });

  // ── Landing page contact form ───────────────────────────────────────────
  app.post("/contact", express.json(), rateLimit({ maxRequests: 5, windowMs: 60_000 }), async (req, res) => {
    const { name, email, phone, trade } = req.body ?? {};
    if (!name || !email) return res.status(400).json({ error: "Name and email are required" });
    log.info({ name, email, phone, trade }, "Contact form submission");

    try {
      createProspect(db, {
        business_name: name,
        owner_name: name,
        phone: phone || null,
        email: email,
        website: null,
        trade_type: trade || null,
        suburb: null,
        state: "NSW",
        source: "website_contact",
        google_rating: null,
        review_count: null,
        notes: null,
        last_contacted_at: null,
        next_followup_at: null,
      });
    } catch (e) { log.warn({ e }, "Failed to persist contact form submission as prospect"); }

    if (env.OWNER_PHONE_NUMBER) {
      try {
        const sms = await sendOwnerSms(db,
          `PickupAI enquiry from website:\nName: ${name}\nEmail: ${email}${phone ? `\nPhone: ${phone}` : ""}${trade ? `\nTrade: ${trade}` : ""}`,
        );
        if (sms.status === "skipped") {
          log.warn({ reason: sms.reason }, "Contact form SMS skipped");
        }
      } catch (e) { log.warn({ e }, "Contact form SMS notification failed"); }
    }
    res.json({ ok: true });
  });

  // ── Option A simulation routing (in-memory, no DB slot used) ─────────────
  // Maps demo pool number → { tenantId, expiresAt }
  // Set when a simulation call is placed; cleared when the call completes.
  const simulationRoutingMap = new Map<string, { tenantId: string; expiresAt: number }>();
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of simulationRoutingMap) {
      if (entry.expiresAt < now) simulationRoutingMap.delete(key);
    }
  }, 5 * 60 * 1000).unref();

  // ── Live audio streaming for demo calls (SSE) ──────────────────────────────
  // Audio chunks from the AI are emitted on "audio:<tenantId>" events.
  // When the call ends, "end:<tenantId>" is emitted to close the SSE stream.
  const demoAudioEmitter = new EventEmitter();
  demoAudioEmitter.setMaxListeners(100);

  // ═══════════════════════════════════════════════════════════════════════════
  // TWILIO WEBHOOKS
  // ═══════════════════════════════════════════════════════════════════════════

  app.post("/twilio/voice/incoming", twilioVerify, (req, res) => {
    const callSid = getCallSid(req);
    const from = req.body?.From ?? null;
    const to = req.body?.To ?? null;

    // Priority order for tenant resolution:
    // 1. simulationRoutingMap (Option A — in-memory, no DB slot)
    // 2. demo_sessions DB table (Option B — user called the demo number themselves)
    // 3. tenants.twilio_number lookup
    // 4. fallback tenant
    const simEntry = typeof to === "string" ? simulationRoutingMap.get(to) : undefined;
    const simValid = simEntry && simEntry.expiresAt > Date.now();
    const simTenantRow = simValid ? getTenantById(db, simEntry!.tenantId) : null;

    const demoTenant = (!simTenantRow && typeof to === "string") ? getDemoTenantByNumber(db, to) : null;
    const tenantByNumber = (!simTenantRow && !demoTenant && typeof to === "string") ? getTenantByNumber(db, to) : null;
    const tenant: TenantRow = simTenantRow ?? demoTenant ?? tenantByNumber ?? buildFallbackTenant();
    const isDemo = !!(simTenantRow || demoTenant);

    if (tenant.tenant_id === "default" && typeof to === "string") {
      log.warn({ to }, "No tenant found for number — using fallback tenant");
      trackEvent("tenant_not_found_fallback", {
        call_id: callSid,
        level: "warn",
        payload: { to }
      });
    }

    const state = getOrInitCallState(callSid);
    state.lead.phone = typeof from === "string" ? from : state.lead.phone;

    if (typeof from === "string" && from.trim()) {
      const history = getLeadHistoryByPhone(db, from.trim(), tenant.tenant_id);
      if (history.length > 0) {
        state.callerHistory = history;
        log.info({ callSid, from, historyCount: history.length }, "returning customer detected");
      }
    }
    state.tenantId = tenant.tenant_id;
    state.tenantOwnerPhone = tenant.owner_phone;
    state.tenantOwnerEmail = tenant.owner_email ?? undefined;
    state.isDemo = isDemo;
    setCallState(callSid, state);

    upsertCall(db, {
      call_id: callSid,
      tenant_id: tenant.tenant_id !== "default" ? tenant.tenant_id : null,
      from_number: typeof from === "string" ? from : null,
      to_number: typeof to === "string" ? to : null,
      started_at: new Date().toISOString(),
      status: "in-progress",
      is_demo: isDemo ? 1 : 0
    });
    trackEvent("call_started", {
      tenant_id: tenant.tenant_id !== "default" ? tenant.tenant_id : null,
      call_id: callSid,
      payload: { from, to, isDemo }
    });

    startCallRecording(callSid).catch((err) => log.warn({ err }, "start recording failed"));

    if (!env.OPENAI_API_KEY) {
      log.warn({ callSid, tenantId: tenant.tenant_id }, "OPENAI_API_KEY not set — serving voicemail fallback");
      trackEvent("ai_unavailable_voicemail_fallback", {
        tenant_id: tenant.tenant_id !== "default" ? tenant.tenant_id : null,
        call_id: callSid,
        level: "warn"
      });
      const recordingCallbackUrl = buildAbsoluteUrl("/twilio/voice/recording");
      const twiml = voicemailFallbackTwiml(tenant.name, recordingCallbackUrl);
      return res.type("text/xml").send(twiml);
    }

    const transferTarget = tenant.owner_phone || env.OWNER_PHONE_NUMBER;
    if (shouldWarmTransferNow() && tenant.enable_warm_transfer && transferTarget) {
      const vr = newVoiceResponse();
      sayFriendly(vr, "Please hold while I connect you.");
      const dial = vr.dial({
        action: buildAbsoluteUrl("/twilio/voice/transfer-fallback"),
        method: "POST",
        timeout: 18
      });
      dial.number(
        {
          statusCallback: buildAbsoluteUrl("/twilio/voice/status"),
          statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
          statusCallbackMethod: "POST"
        },
        transferTarget
      );
      return res.type("text/xml").send(vr.toString());
    }

    const wsUrl = buildAbsoluteUrl("/media-stream").replace(/^https?:\/\//, "wss://");
    const token = crypto.randomUUID();
    streamTokens.set(token, Date.now() + 120_000);
    const twiml = connectStreamTwiml(wsUrl, callSid, token);
    res.type("text/xml").send(twiml);
  });

  app.post("/twilio/voice/transfer-fallback", twilioVerify, (req, res) => {
    const callSid = getCallSid(req);
    const wsUrl = buildAbsoluteUrl("/media-stream").replace(/^https?:\/\//, "wss://");
    const token = crypto.randomUUID();
    streamTokens.set(token, Date.now() + 120_000);
    const twiml = connectStreamTwiml(wsUrl, callSid, token);
    res.type("text/xml").send(twiml);
  });

  app.post("/twilio/voice/status", twilioVerify, (req, res) => {
    const callSid = typeof req.body?.CallSid === "string" ? req.body.CallSid : null;
    const callStatus = typeof req.body?.CallStatus === "string" ? req.body.CallStatus : null;
    const TERMINAL_STATUSES = new Set(["completed", "busy", "no-answer", "canceled", "failed"]);
    if (callSid) {
      const isTerminal = callStatus !== null && TERMINAL_STATUSES.has(callStatus);
      upsertCall(db, {
        call_id: callSid,
        status: callStatus ?? undefined,
        ended_at: isTerminal ? new Date().toISOString() : undefined
      });
      if (isTerminal) {
        const state = getOrInitCallState(callSid);
        const ownerPhone = state.tenantOwnerPhone ?? undefined;
        const ownerEmail = state.tenantOwnerEmail ?? undefined;
        trackEvent("call_ended_status_webhook", {
          call_id: callSid,
          payload: { callStatus, callerIntent: state.callerIntent }
        });
        if (callStatus === "completed") {
          notifyOwnerSmsIfNeeded(callSid, state.callerIntent, ownerPhone, ownerEmail).catch((err) =>
            log.warn({ err }, "owner sms on status failed")
          );
        }
        // Clear Option A simulation routing entry for the TO number (if any)
        const toNumber = typeof req.body?.To === "string" ? req.body.To : null;
        if (toNumber) simulationRoutingMap.delete(toNumber);
        clearCallState(callSid);
      }
    }
    res.sendStatus(200);
  });

  app.post("/twilio/voice/recording", twilioVerify, async (req, res) => {
    const callSid = typeof req.body?.CallSid === "string" ? req.body.CallSid : null;
    const recordingSid = typeof req.body?.RecordingSid === "string" ? req.body.RecordingSid : null;
    const recordingUrl = typeof req.body?.RecordingUrl === "string" ? req.body.RecordingUrl : null;
    if (callSid) {
      upsertCall(db, {
        call_id: callSid,
        recording_sid: recordingSid ?? undefined,
        recording_url: recordingUrl ? `${recordingUrl}.mp3` : undefined
      });
      if (recordingUrl) {
        trackEvent("recording_ready", { call_id: callSid, payload: { recordingSid } });
      } else {
        trackEvent("recording_missing_url", {
          call_id: callSid,
          level: "warn",
          payload: { recordingSid }
        });
      }

      // If no lead exists for this call, this was a voicemail fallback —
      // create a lead so the owner gets notified and it appears in the dashboard.
      const existingLead = getLatestLeadForCall(db, callSid);
      if (!existingLead) {
        const call = db.get<CallRow>("SELECT * FROM calls WHERE call_id = ?", [callSid]);
        if (call) {
          const leadId = newLeadId();
          upsertLead(db, {
            lead_id: leadId,
            tenant_id: call.tenant_id,
            call_id: callSid,
            name: null,
            phone: call.from_number,
            address: null,
            issue_type: "voicemail",
            issue_summary: "Voicemail left - listen to recording",
            urgency_level: "routine",
            preferred_time: null,
            notes: null,
            confidence: null,
            next_action: "Listen to voicemail and call back",
            job_value: null,
            lead_status: "new"
          });
          trackEvent("voicemail_lead_created", { call_id: callSid, tenant_id: call.tenant_id });

          const ownerTenant = call.tenant_id ? getTenantById(db, call.tenant_id) : null;
          notifyOwnerSmsIfNeeded(
            callSid,
            "voicemail",
            ownerTenant?.owner_phone,
            ownerTenant?.owner_email ?? undefined
          ).catch((err) => log.warn({ err }, "voicemail owner SMS failed"));
        }
      }
    }
    res.sendStatus(200);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ADMIN API  (protected by x-admin-token header)
  // ═══════════════════════════════════════════════════════════════════════════

  app.get("/admin/tenants", adminGuard, (_req, res) => {
    const tenants = listTenants(db).map(({ password_hash, session_token, ...t }) => t);
    res.json({ tenants });
  });

  app.post("/admin/tenants", adminGuard, (req, res) => {
    const { name, trade_type, ai_name, twilio_number, owner_phone, owner_email, password,
            business_hours_start, business_hours_end, timezone, enable_warm_transfer,
            service_area } = req.body ?? {};

    if (!name || !twilio_number || !owner_phone) {
      return res.status(400).json({ error: "name, twilio_number, and owner_phone are required" });
    }

    try {
      const tenant = createTenant(db, {
        name, trade_type: trade_type ?? "tradie", ai_name, twilio_number,
        owner_phone, owner_email, password, business_hours_start,
        business_hours_end, timezone,
        enable_warm_transfer: enable_warm_transfer ? 1 : 0,
        service_area: service_area ?? undefined
      });
      const { password_hash, session_token, ...safe } = tenant;
      res.status(201).json({ tenant: safe });
    } catch (err: any) {
      // Unique constraint on twilio_number
      if (err?.message?.includes("UNIQUE")) {
        return res.status(409).json({ error: "twilio_number already registered" });
      }
      log.error({ err }, "create tenant failed");
      res.status(500).json({ error: "internal error" });
    }
  });

  app.get("/admin/tenants/:id", adminGuard, (req, res) => {
    const tenant = getTenantById(db, req.params.id);
    if (!tenant) return res.status(404).json({ error: "not found" });
    const { password_hash, session_token, ...safe } = tenant;
    res.json({ tenant: safe });
  });

  app.patch("/admin/tenants/:id", adminGuard, (req, res) => {
    const tenant = getTenantById(db, req.params.id);
    if (!tenant) return res.status(404).json({ error: "not found" });
    const ALLOWED_FIELDS = new Set([
      "name", "trade_type", "ai_name", "twilio_number", "owner_phone", "owner_email",
      "business_hours_start", "business_hours_end", "timezone", "enable_warm_transfer",
      "service_area", "custom_instructions", "vacation_mode", "vacation_message",
      "active", "payment_status", "trial_ends_at"
    ]);
    const sanitized: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(req.body ?? {})) {
      if (ALLOWED_FIELDS.has(k)) sanitized[k] = v;
    }
    updateTenant(db, req.params.id, sanitized);
    const updated = getTenantById(db, req.params.id)!;
    const { password_hash, session_token, ...safe } = updated;
    res.json({ tenant: safe });
  });

  app.delete("/admin/tenants/:id", adminGuard, (req, res) => {
    const tenant = getTenantById(db, req.params.id);
    if (!tenant) return res.status(404).json({ error: "not found" });
    deleteTenant(db, req.params.id);
    res.json({ ok: true });
  });

  // ── System config (runtime-editable, no restart needed) ──────────────────
  //
  // Supported keys:
  //   sms_numbers          – comma-separated mobile numbers for outgoing SMS
  //                          (overrides TWILIO_SMS_NUMBERS env var)
  //   default_voice_number – number used as "from" for demo simulation calls
  //                          (overrides TWILIO_DEFAULT_VOICE_NUMBER env var)
  //   demo_caller_number   – Twilio number used for Option A demo calls

  const ADMIN_CONFIG_ALLOWED_KEYS = new Set(["sms_numbers", "default_voice_number", "demo_caller_number"]);

  app.get("/api/admin/config", adminGuard, (_req, res) => {
    const rows = listSystemConfig(db).filter(c => !c.key.startsWith("pw_reset:"));
    res.json({ config: rows });
  });

  app.put("/api/admin/config/:key", adminGuard, (req, res) => {
    const { key } = req.params;
    if (!ADMIN_CONFIG_ALLOWED_KEYS.has(key)) {
      return res.status(400).json({ error: `Unknown config key "${key}". Allowed: ${[...ADMIN_CONFIG_ALLOWED_KEYS].join(", ")}` });
    }
    const { value } = req.body ?? {};
    if (typeof value !== "string" || !value.trim()) {
      return res.status(400).json({ error: "value is required and must be a non-empty string" });
    }
    setSystemConfig(db, key, value.trim());
    res.json({ ok: true, key, value: value.trim() });
  });

  // ── Demo sessions (admin JSON API) ───────────────────────────────────────

  app.get("/api/admin/demo-sessions", adminGuard, (_req, res) => {
    const sessions = listDemoSessions(db);
    res.json({ sessions, count: sessions.length });
  });

  app.delete("/api/admin/demo-sessions", adminGuard, (_req, res) => {
    clearDemoSessions(db);
    res.json({ ok: true, message: "All demo sessions cleared" });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ADMIN HTML PANEL  (/admin/*)
  // ═══════════════════════════════════════════════════════════════════════════

  // Login page
  app.get("/admin/login", (req, res) => {
    if (!env.ADMIN_TOKEN) return res.redirect("/admin");
    const cookies = parseCookies(req);
    const st = cookies.admin_session;
    if (st && adminSessions.has(st) && adminSessions.get(st)! > Date.now()) return res.redirect("/admin");
    res.send(adminLoginPage());
  });

  app.post("/admin/login", express.urlencoded({ extended: false }), rateLimit({ maxRequests: 5, windowMs: 60_000, message: "Too many login attempts. Please wait a minute." }), (req, res) => {
    const { token } = req.body ?? {};
    if (!env.ADMIN_TOKEN) {
      return res.send(adminLoginPage("Admin access is not configured. Set the ADMIN_TOKEN environment variable."));
    }
    if (typeof token === "string" && token && safeTokenCompare(token, env.ADMIN_TOKEN)) {
      const sessionToken = crypto.randomUUID();
      adminSessions.set(sessionToken, Date.now() + ADMIN_SESSION_TTL_MS);
      res.setHeader("Set-Cookie", `admin_session=${sessionToken}; HttpOnly; Secure; Path=/admin; SameSite=Strict; Max-Age=86400`);
      return res.redirect("/admin");
    }
    res.send(adminLoginPage("Invalid token — try again."));
  });

  app.post("/admin/logout", (req, res) => {
    const cookies = parseCookies(req);
    if (cookies.admin_session) adminSessions.delete(cookies.admin_session);
    res.setHeader("Set-Cookie", "admin_session=; HttpOnly; Secure; Path=/admin; SameSite=Strict; Max-Age=0");
    res.redirect("/admin/login");
  });

  // Overview
  app.get("/admin", adminHtmlAuth, (_req, res) => {
    const stats = getOverviewStats(db);
    const recent = listTenantsWithStats(db).slice(0, 10);
    const foundingCount = getFoundingCustomerCount(db);
    res.send(adminOverviewPage(stats, recent, foundingCount));
  });

  app.get("/admin/funnel", adminHtmlAuth, (req, res) => {
    const daysRaw = typeof req.query.days === "string" ? Number(req.query.days) : 7;
    const days = Number.isFinite(daysRaw) ? Math.max(1, Math.min(30, Math.floor(daysRaw))) : 7;
    const rows = getDailyFunnelStats(db, days);
    res.send(adminFunnelPage(rows, days));
  });

  // Users list
  app.get("/admin/users", adminHtmlAuth, (_req, res) => {
    const tenants = listTenantsWithStats(db);
    res.send(adminUsersPage(tenants));
  });

  // User detail (GET)
  app.get("/admin/users/:id", adminHtmlAuth, (req, res) => {
    const detail = getAdminTenantDetail(db, req.params.id);
    if (!detail) return res.status(404).send("User not found");
    const flash = (req.query.flash as string | undefined) ?? undefined;
    res.send(adminUserDetailPage(detail, env.PUBLIC_BASE_URL, flash));
  });

  // User edit (POST)
  app.post("/admin/users/:id", adminHtmlAuth, express.urlencoded({ extended: false }), (req, res) => {
    const tenant = getTenantById(db, req.params.id);
    if (!tenant) return res.status(404).send("User not found");
    const b = req.body ?? {};
    updateTenant(db, req.params.id, {
      name: b.name || tenant.name,
      trade_type: b.trade_type || tenant.trade_type,
      ai_name: b.ai_name || tenant.ai_name,
      twilio_number: b.twilio_number || tenant.twilio_number,
      owner_phone: b.owner_phone || tenant.owner_phone,
      owner_email: b.owner_email || null,
      business_hours_start: b.business_hours_start || tenant.business_hours_start,
      business_hours_end: b.business_hours_end || tenant.business_hours_end,
      timezone: b.timezone || tenant.timezone,
      enable_warm_transfer: b.enable_warm_transfer ? 1 : 0,
      service_area: b.service_area || null,
      active: b.active ? 1 : 0,
      payment_status: b.payment_status || "none",
      trial_ends_at: b.trial_ends_at || null,
    });
    res.redirect(`/admin/users/${req.params.id}?flash=✓ Changes saved`);
  });

  // Provision Twilio number + optionally notify owner by SMS
  app.post("/admin/users/:id/provision-number", adminHtmlAuth, express.urlencoded({ extended: false }), async (req, res) => {
    const tenant = getTenantById(db, req.params.id);
    if (!tenant) return res.status(404).send("User not found");

    const b = req.body ?? {};
    const newNumber: string = (b.twilio_number ?? "").trim();

    if (!newNumber.startsWith("+") || newNumber.length < 10) {
      return res.redirect(`/admin/users/${req.params.id}?flash=⚠ Invalid number format — must start with + (e.g. +61280000000)`);
    }

    // Update twilio_number
    const patch: Record<string, any> = { twilio_number: newNumber };
    if (b.mark_active) patch.payment_status = "active";
    updateTenant(db, req.params.id, patch);

    // Reload fresh tenant after update
    const updated = getTenantById(db, req.params.id)!;

    if (!b.send_sms) {
      return res.redirect(`/admin/users/${req.params.id}?flash=✓ Number ${newNumber} assigned (SMS not sent)`);
    }

    // Send setup SMS to owner
    try {
      const twilioClient = (await import("twilio")).default;
      const client = twilioClient(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
      const smsFrom = env.TWILIO_SMS_NUMBERS[0] ?? env.TWILIO_DEFAULT_VOICE_NUMBER;
      const smsBody = buildProvisionSms(updated.name, newNumber, env.PUBLIC_BASE_URL);
      await client.messages.create({ from: smsFrom, to: updated.owner_phone, body: smsBody });
      log.info({ tenantId: req.params.id, number: newNumber }, "provision-number SMS sent");
      res.redirect(
        `/admin/users/${req.params.id}?flash=✓ Number ${formatAuPhone(newNumber)} assigned & setup SMS sent to ${formatAuPhone(updated.owner_phone)}`
      );
    } catch (err: any) {
      log.error({ err }, "provision-number SMS failed");
      res.redirect(
        `/admin/users/${req.params.id}?flash=⚠ Number assigned but SMS notification failed. Check server logs for details.`
      );
    }
  });

  // Reset password → generate temp password, save hash, SMS it
  app.post("/admin/users/:id/reset-password", adminHtmlAuth, async (req, res) => {
    const tenant = getTenantById(db, req.params.id);
    if (!tenant) return res.status(404).send("User not found");
    const tempPw = generateTempPassword();
    updateTenant(db, req.params.id, { password: tempPw, session_token: null } as any);
    try {
      const twilioClient = (await import("twilio")).default;
      const client = twilioClient(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
      const smsFrom = env.TWILIO_SMS_NUMBERS[0] ?? env.TWILIO_DEFAULT_VOICE_NUMBER;
      await client.messages.create({
        from: smsFrom,
        to: tenant.owner_phone,
        body: `PickupAI: Your temporary password is: ${tempPw}\nLogin at ${env.PUBLIC_BASE_URL}/dashboard/login`
      });
      res.redirect(`/admin/users/${req.params.id}?flash=✓ Temp password sent by SMS to ${formatAuPhone(tenant.owner_phone)}`);
    } catch (err: any) {
      log.error({ err }, "admin reset-password SMS failed");
      res.redirect(`/admin/users/${req.params.id}?flash=⚠ Password reset in DB but SMS notification failed. Check server logs for details.`);
    }
  });

  // Toggle active
  app.post("/admin/users/:id/toggle-active", adminHtmlAuth, (req, res) => {
    const tenant = getTenantById(db, req.params.id);
    if (!tenant) return res.status(404).send("User not found");
    updateTenant(db, req.params.id, { active: tenant.active ? 0 : 1 });
    const msg = tenant.active ? "Account deactivated" : "Account reactivated";
    res.redirect(`/admin/users/${req.params.id}?flash=✓ ${msg}`);
  });

  // Delete tenant
  app.post("/admin/users/:id/delete", adminHtmlAuth, (req, res) => {
    const tenant = getTenantById(db, req.params.id);
    if (!tenant) return res.status(404).send("User not found");
    deleteTenant(db, req.params.id);
    res.redirect("/admin/users?flash=✓ Account deleted");
  });

  // Export leads CSV for a tenant (admin)
  app.get("/admin/users/:id/leads.csv", adminHtmlAuth, (req, res) => {
    const tenant = getTenantById(db, req.params.id);
    if (!tenant) return res.status(404).send("User not found");
    const leads = listLeadsForTenant(db, req.params.id, { limit: 1000 });
    const header = "Date,Caller Name,Phone,Address,Issue Type,Issue Summary,Urgency,Status\n";
    const rows = leads.map(l =>
      [l.created_at, l.name, l.phone, l.address, l.issue_type, l.issue_summary, l.urgency_level, l.lead_status]
        .map(v => `"${csvSafe(String(v ?? "")).replace(/"/g, '""')}"`)
        .join(",")
    ).join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${tenant.name.replace(/\W+/g, "_")}_leads.csv"`);
    res.send(header + rows);
  });

  // Demo sessions (HTML)
  app.get("/admin/demo-sessions", adminHtmlAuth, (req, res) => {
    const sessions = listDemoSessions(db);
    const poolNumbers = env.DEMO_POOL_NUMBERS ? env.DEMO_POOL_NUMBERS.split(",").map(n => n.trim()).filter(Boolean) : [];
    const flash = (req.query.flash as string | undefined) ?? undefined;
    res.send(adminDemoSessionsPage(sessions, poolNumbers, flash));
  });

  app.post("/admin/demo-sessions/clear", adminHtmlAuth, (_req, res) => {
    clearDemoSessions(db);
    res.redirect("/admin/demo-sessions?flash=✓ All demo sessions cleared");
  });

  // Config (HTML)
  // ── Admin Prospects (marketing lead management) ──────────────────────────

  app.get("/admin/prospects", adminHtmlAuth, (req, res) => {
    const flash = req.query.flash as string | undefined;
    const filters = {
      status: (req.query.status as string) || undefined,
      trade_type: (req.query.trade_type as string) || undefined,
      suburb: (req.query.suburb as string) || undefined
    };
    const prospects = listProspects(db, filters);
    const stats = getProspectStats(db);
    res.send(adminProspectsPage(prospects, stats, filters, flash));
  });

  app.get("/admin/prospects/import-form", adminHtmlAuth, (req, res) => {
    res.send(adminProspectImportPage(req.query.flash as string | undefined));
  });

  app.get("/admin/prospects/bulk-sms-form", adminHtmlAuth, (req, res) => {
    const flash = req.query.flash as string | undefined;
    const filters = {
      status: (req.query.status as string) || undefined,
      trade_type: (req.query.trade_type as string) || undefined
    };
    const allProspects = listProspects(db, filters);
    const sendable = allProspects.filter(p =>
      p.phone && p.status !== "do_not_contact" && p.status !== "not_interested"
    );
    res.send(adminBulkSmsPage(sendable.length, filters, flash));
  });

  app.post("/admin/prospects/import", adminHtmlAuth, express.urlencoded({ extended: false, limit: "5mb" }), (req, res) => {
    const csvText = req.body?.csv_text?.trim();
    if (!csvText) return res.redirect("/admin/prospects/import-form?flash=⚠ No CSV data provided");

    const lines = csvText.split("\n").map((l: string) => l.trim()).filter(Boolean);
    if (lines.length < 2) return res.redirect("/admin/prospects/import-form?flash=⚠ CSV must have a header row and at least one data row");

    const headers = lines[0].split(",").map((h: string) => h.trim().toLowerCase().replace(/"/g, ""));
    const rows: Array<any> = [];
    for (let i = 1; i < lines.length; i++) {
      const vals = lines[i].split(",").map((v: string) => v.trim().replace(/^"|"$/g, ""));
      const row: Record<string, string> = {};
      headers.forEach((h: string, idx: number) => { row[h] = vals[idx] ?? ""; });
      if (!row.business_name) continue;
      rows.push({
        business_name: row.business_name,
        owner_name: row.owner_name || null,
        phone: row.phone || null,
        email: row.email || null,
        website: row.website || null,
        trade_type: row.trade_type || null,
        suburb: row.suburb || null,
        state: row.state || "NSW",
        source: row.source || "csv_import",
        google_rating: row.google_rating ? parseFloat(row.google_rating) : null,
        review_count: row.review_count ? parseInt(row.review_count) : null,
        notes: null,
        last_contacted_at: null,
        next_followup_at: null
      });
    }

    const result = importProspects(db, rows);
    res.redirect(`/admin/prospects?flash=✓ Imported ${result.imported} prospects (${result.skipped} duplicates skipped)`);
  });

  app.post("/admin/prospects/bulk-sms", adminHtmlAuth, express.urlencoded({ extended: false }), async (req, res) => {
    const message = req.body?.message?.trim();
    const statusFilter = req.body?.status || undefined;
    const tradeFilter = req.body?.trade_type || undefined;
    if (!message) return res.redirect("/admin/prospects/bulk-sms-form?flash=⚠ Message is required");

    const all = listProspects(db, { status: statusFilter, trade_type: tradeFilter });
    const targets = all.filter(p =>
      p.phone && p.status !== "do_not_contact" && p.status !== "not_interested"
    );

    let sent = 0;
    let failed = 0;
    const failureReasons: string[] = [];
    for (const p of targets) {
      const body = message
        .replace(/\{name\}/gi, p.business_name)
        + (message.toLowerCase().includes("stop") ? "" : "\nReply STOP to opt out");
      try {
        const sms = await sendOwnerSms(db, body, p.phone!);
        if (sms.status === "sent") {
          createOutreachLog(db, { prospect_id: p.prospect_id, channel: "sms", message: body, status: "sent" });
          updateProspect(db, p.prospect_id, { status: p.status === "new" ? "contacted" : p.status, last_contacted_at: new Date().toISOString() });
          sent++;
          // Rate limiting: 1 SMS per second
          await new Promise(r => setTimeout(r, 1000));
        } else {
          createOutreachLog(db, {
            prospect_id: p.prospect_id,
            channel: "sms",
            message: body,
            status: `skipped:${sms.reason}`
          });
          failed++;
          failureReasons.push(`${p.phone}:${sms.reason}`);
        }
      } catch (e: any) {
        createOutreachLog(db, { prospect_id: p.prospect_id, channel: "sms", message: body, status: "failed" });
        failed++;
        failureReasons.push(`${p.phone}:error`);
        log.warn({ e, phone: p.phone }, "Bulk SMS failed for prospect");
      }
    }
    const failSummary = failureReasons.length
      ? ` (${failureReasons.slice(0, 3).join(", ")}${failureReasons.length > 3 ? ", ..." : ""})`
      : "";
    res.redirect(`/admin/prospects?flash=✓ Bulk SMS complete: ${sent} sent, ${failed} failed${failSummary}`);
  });

  app.get("/admin/prospects/:id", adminHtmlAuth, (req, res) => {
    const p = getProspectById(db, req.params.id);
    if (!p) return res.redirect("/admin/prospects?flash=⚠ Prospect not found");
    const flash = req.query.flash as string | undefined;
    const outreachLog = listOutreachForProspect(db, p.prospect_id);
    res.send(adminProspectDetailPage(p, outreachLog, flash));
  });

  app.post("/admin/prospects/:id", adminHtmlAuth, express.urlencoded({ extended: false }), (req, res) => {
    const { business_name, owner_name, phone, email, website, trade_type, suburb, status, notes } = req.body ?? {};
    updateProspect(db, req.params.id, { business_name, owner_name, phone, email, website, trade_type, suburb, status, notes });
    res.redirect(`/admin/prospects/${req.params.id}?flash=✓ Prospect updated`);
  });

  app.post("/admin/prospects/:id/sms", adminHtmlAuth, express.urlencoded({ extended: false }), async (req, res) => {
    const p = getProspectById(db, req.params.id);
    if (!p || !p.phone) return res.redirect(`/admin/prospects/${req.params.id}?flash=⚠ No phone number`);
    const message = req.body?.message?.trim();
    if (!message) return res.redirect(`/admin/prospects/${req.params.id}?flash=⚠ Message is required`);

    try {
      const sms = await sendOwnerSms(db, message, p.phone);
      if (sms.status === "sent") {
        createOutreachLog(db, { prospect_id: p.prospect_id, channel: "sms", message, status: "sent" });
        updateProspect(db, p.prospect_id, { last_contacted_at: new Date().toISOString() });
        if (p.status === "new") updateProspect(db, p.prospect_id, { status: "contacted" });
        res.redirect(`/admin/prospects/${p.prospect_id}?flash=✓ SMS sent`);
      } else {
        createOutreachLog(db, { prospect_id: p.prospect_id, channel: "sms", message, status: `skipped:${sms.reason}` });
        res.redirect(`/admin/prospects/${p.prospect_id}?flash=⚠ SMS skipped (${sms.reason})`);
      }
    } catch (e) {
      createOutreachLog(db, { prospect_id: p.prospect_id, channel: "sms", message, status: "failed" });
      res.redirect(`/admin/prospects/${p.prospect_id}?flash=⚠ SMS failed — check Twilio`);
    }
  });

  app.post("/admin/prospects/:id/delete", adminHtmlAuth, (req, res) => {
    deleteProspect(db, req.params.id);
    res.redirect("/admin/prospects?flash=✓ Prospect deleted");
  });

  // ── Admin Chat Logs ─────────────────────────────────────────────────────

  app.get("/admin/chat-logs", adminHtmlAuth, (req, res) => {
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const search = typeof req.query.search === "string" ? req.query.search : undefined;
    const perPage = 50;
    const logs = listChatLogs(db, { limit: perPage, offset: (page - 1) * perPage, search });
    const total = countChatLogs(db);
    const flash = (req.query.flash as string | undefined) ?? undefined;
    res.send(adminChatLogsPage(logs, total, page, search, flash));
  });

  // ── Admin Config ────────────────────────────────────────────────────────

  app.get("/admin/config", adminHtmlAuth, (req, res) => {
    const configs = listSystemConfig(db).filter(c => !c.key.startsWith("pw_reset:"));
    const flash = (req.query.flash as string | undefined) ?? undefined;
    res.send(adminConfigPage(configs, flash));
  });

  app.post("/admin/config/:key", adminHtmlAuth, express.urlencoded({ extended: false }), (req, res) => {
    const key = req.params.key === "__new__" ? req.body?.key?.trim() : req.params.key;
    const value = req.body?.value?.trim();
    if (!key || !value) return res.redirect("/admin/config?flash=⚠ Key and value are required");
    if (!ADMIN_CONFIG_ALLOWED_KEYS.has(key)) {
      return res.redirect(`/admin/config?flash=${encodeURIComponent(`⚠ Unknown config key "${key}". Allowed: ${[...ADMIN_CONFIG_ALLOWED_KEYS].join(", ")}`)}`);
    }
    setSystemConfig(db, key, value);
    res.redirect(`/admin/config?flash=${encodeURIComponent(`✓ Config "${key}" updated`)}`);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // OWNER DASHBOARD
  // ═══════════════════════════════════════════════════════════════════════════

  app.get("/dashboard/login", (req, res) => {
    const cookies = parseCookies(req);
    const existing = cookies.dash_session ? getTenantBySessionToken(db, cookies.dash_session) : null;
    if (existing) {
      if (existing.payment_status === "pending" || existing.twilio_number.startsWith("+PENDING")) {
        return res.redirect("/dashboard/welcome");
      }
      return res.redirect("/dashboard/leads");
    }
    const flash = typeof req.query.flash === "string" ? req.query.flash : undefined;
    res.send(loginPage(undefined, flash));
  });

  app.post("/dashboard/login", express.urlencoded({ extended: false }), rateLimit({ maxRequests: 10, windowMs: 60_000, message: "Too many login attempts. Please wait a minute and try again." }), (req, res) => {
    const { email, password } = req.body ?? {};
    if (!email || !password) return res.send(loginPage("Email and password are required."));
    const tenant = tenantLogin(db, email as string, password as string);
    if (!tenant || !tenant.session_token) {
      return res.send(loginPage("Invalid email or password."));
    }
    setSessionCookie(res, tenant.session_token);
    const destination = (isPendingNumber(tenant.twilio_number) || tenant.payment_status === "pending")
      ? "/dashboard/welcome" : "/dashboard/leads";
    res.redirect(destination);
  });

  app.post("/dashboard/logout", express.urlencoded({ extended: false }), (req, res) => {
    const cookies = parseCookies(req);
    const token = cookies.dash_session;
    if (token) {
      const tenant = getTenantBySessionToken(db, token);
      if (tenant) tenantLogout(db, tenant.tenant_id);
    }
    clearSessionCookie(res);
    res.redirect("/dashboard/login");
  });

  // ── Self-service password reset (step 1: request code via SMS) ─────────────
  app.get("/dashboard/forgot-password", (req, res) => {
    const flash = typeof req.query.flash === "string" ? req.query.flash : undefined;
    res.send(forgotPasswordPage(flash));
  });

  app.post(
    "/dashboard/forgot-password",
    express.urlencoded({ extended: false }),
    rateLimit({ maxRequests: 3, windowMs: 5 * 60_000, message: "Too many reset requests. Please wait 5 minutes." }),
    async (req, res) => {
      const { email } = req.body ?? {};
      if (!email) return res.redirect("/dashboard/forgot-password?flash=⚠ Email is required");
      const tenants = listTenants(db);
      const tenant = tenants.find((t) => t.owner_email?.toLowerCase() === (email as string).toLowerCase());
      // Always show success to avoid email enumeration
      const successMsg = "If that email is registered, a 6-digit code has been sent by SMS to the phone on file.";
      if (!tenant) return res.redirect(`/dashboard/forgot-password?flash=${encodeURIComponent(successMsg)}`);
      const code = createPasswordResetToken(db, tenant.tenant_id);
      try {
        await sendOwnerSms(
          db,
          `PickupAI password reset: Your 6-digit code is ${code}. Valid for 15 minutes. If you didn't request this, ignore this message.`,
          tenant.owner_phone
        );
      } catch (e) {
        log.warn({ e }, "password reset SMS failed");
      }
      res.redirect(`/dashboard/reset-password?email=${encodeURIComponent(email)}&flash=${encodeURIComponent(successMsg)}`);
    }
  );

  // Step 2: enter code + new password
  app.get("/dashboard/reset-password", (req, res) => {
    const email = typeof req.query.email === "string" ? req.query.email : "";
    const flash = typeof req.query.flash === "string" ? req.query.flash : undefined;
    res.send(resetPasswordPage(email, flash, "success"));
  });

  app.post(
    "/dashboard/reset-password",
    express.urlencoded({ extended: false }),
    rateLimit({ maxRequests: 10, windowMs: 15 * 60_000, message: "Too many attempts. Please wait." }),
    (req, res) => {
      const { email, code, password, confirm_password } = req.body ?? {};
      if (!email || !code || !password) {
        return res.send(resetPasswordPage(email ?? "", "All fields are required."));
      }
      if (password !== confirm_password) {
        return res.send(resetPasswordPage(email, "Passwords do not match."));
      }
      if (typeof password === "string" && password.length < 8) {
        return res.send(resetPasswordPage(email, "Password must be at least 8 characters."));
      }
      const tenants = listTenants(db);
      const tenant = tenants.find((t) => t.owner_email?.toLowerCase() === (email as string).toLowerCase());
      if (!tenant) {
        return res.send(resetPasswordPage(email, "Invalid reset request."));
      }
      const valid = verifyPasswordResetToken(db, tenant.tenant_id, code as string);
      if (!valid) {
        return res.send(resetPasswordPage(email, "Invalid or expired code. Please request a new one."));
      }
      updateTenant(db, tenant.tenant_id, { password: password as string, session_token: null });
      trackEvent("password_reset_completed", { tenant_id: tenant.tenant_id });
      res.redirect("/dashboard/login?flash=" + encodeURIComponent("✓ Password updated. Please sign in with your new password."));
    }
  );

  app.get("/dashboard/signup", (req, res) => {
    const cookies = parseCookies(req);
    const existing = cookies.dash_session ? getTenantBySessionToken(db, cookies.dash_session) : null;
    if (existing) {
      if (existing.payment_status === "demo" || existing.payment_status === "pending" || existing.twilio_number.startsWith("+PENDING")) {
        return res.redirect("/dashboard/welcome");
      }
      return res.redirect("/dashboard/leads");
    }
    res.send(signupPage());
  });

  app.post("/dashboard/signup", express.urlencoded({ extended: false }), rateLimit({ maxRequests: 5, windowMs: 60_000, message: "Too many signup attempts. Please wait a minute." }), async (req, res) => {
    const { name, trade_type, ai_name, owner_phone, email, password, service_area } = req.body ?? {};
    const prefill = { name, trade_type, ai_name, owner_phone, email, service_area };

    if (!name || !trade_type || !owner_phone || !email || !password) {
      trackEvent("signup_validation_failed", { payload: { reason: "missing_required_fields" } });
      return res.send(signupPage("All required fields must be filled in.", prefill));
    }
    if (!req.body.terms_accepted) {
      trackEvent("signup_validation_failed", { payload: { reason: "terms_not_accepted" } });
      return res.send(signupPage("You must accept the Terms of Service to create an account.", prefill));
    }
    if (typeof password === "string" && password.length < 8) {
      trackEvent("signup_validation_failed", { payload: { reason: "password_too_short" } });
      return res.send(signupPage("Password must be at least 8 characters.", prefill));
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      trackEvent("signup_validation_failed", { payload: { reason: "invalid_email" } });
      return res.send(signupPage("Please enter a valid email address.", prefill));
    }
    const VALID_TRADE_TYPES = new Set(["plumber","electrician","roofer","handyman","painter","carpenter","tiler","builder","other"]);
    if (!VALID_TRADE_TYPES.has(trade_type)) {
      trackEvent("signup_validation_failed", { payload: { reason: "invalid_trade_type" } });
      return res.send(signupPage("Please select a valid trade type.", prefill));
    }
    const phoneClean = (owner_phone as string).replace(/[\s\-()]/g, "");
    if (!/^(\+?61\d{9}|0[2-9]\d{8})$/.test(phoneClean)) {
      trackEvent("signup_validation_failed", { payload: { reason: "invalid_phone" } });
      return res.send(signupPage("Please enter a valid Australian phone number (e.g. 0412345678 or +61412345678).", prefill));
    }

    // Check if email already in use
    const existing = listTenants(db).find(t => t.owner_email?.toLowerCase() === (email as string).toLowerCase());
    if (existing) {
      trackEvent("signup_validation_failed", { payload: { reason: "duplicate_email" } });
      return res.send(signupPage("An account with that email already exists. Please sign in.", prefill));
    }

    // No number purchase at signup — user tries the demo first.
    // A real Twilio number is provisioned only after Stripe checkout succeeds.
    const twilioNumber = `+PENDING_${Math.floor(100000 + Math.random() * 900000)}`;

    const serviceArea = (req.body.service_area as string)?.trim() || null;
    const tenant = createTenant(db, {
      name: name as string,
      trade_type: trade_type as string,
      ai_name: ai_name || "Olivia",
      twilio_number: twilioNumber,
      owner_phone: owner_phone as string,
      owner_email: email as string,
      password: password as string,
      service_area: serviceArea ?? undefined,
    });
    trackEvent("signup_completed", {
      tenant_id: tenant.tenant_id,
      payload: { trade_type, hasStripeConfig: !!env.STRIPE_SECRET_KEY && !!env.STRIPE_PRICE_ID }
    });

    // Start in "demo" state — user explores demos before committing to payment
    updateTenant(db, tenant.tenant_id, { payment_status: "demo" });

    try {
      const welcomeBody = `Welcome to PickupAI, ${name}! Try your personalised AI receptionist demo now: ${env.PUBLIC_BASE_URL}/dashboard/welcome\n\nYou'll hear how your AI answers calls and see the SMS alerts you'd get. No commitment yet!`;
      const sms = await sendOwnerSms(db, welcomeBody, owner_phone as string);
      if (sms.status === "skipped") log.warn({ reason: sms.reason }, "Welcome SMS skipped");
    } catch (e) { log.warn({ e }, "Welcome SMS failed"); }

    if (env.OWNER_PHONE_NUMBER) {
      try {
        const sms = await sendOwnerSms(db,
          `PickupAI: New signup (demo) - ${name} (${trade_type}, ${formatAuPhone(owner_phone as string)}). Admin: ${env.PUBLIC_BASE_URL}/admin/users/${tenant.tenant_id}`
        );
        if (sms.status === "skipped") log.warn({ reason: sms.reason }, "Founder signup notification SMS skipped");
      } catch (e) { log.warn({ e }, "Founder signup notification SMS failed"); }
    }

    const loggedIn = tenantLogin(db, email as string, password as string);
    if (loggedIn?.session_token) {
      setSessionCookie(res, loggedIn.session_token);
    }

    // Auto-trigger personalised demo audio generation in background
    if (env.OPENAI_API_KEY) {
      demoGenStatus.set(tenant.tenant_id, "generating");
      (async () => {
        try {
          await generatePersonalisedDemoAudio(tenant);
          demoGenStatus.set(tenant.tenant_id, "ready");
          const script = DEMO_SCRIPTS[tenant.trade_type] ?? FALLBACK_SCRIPT;
          const sample = script.sms(tenant.name);
          const smsBody = [
            `NEW JOB (URGENT):`,
            `Name: ${sample.name}`,
            `Phone: ${sample.phone}`,
            `Address: ${sample.address}`,
            `Details: ${sample.issue}`,
            `Next: Call back ASAP`,
            ``,
            `⬆️ THIS IS A DEMO — here's what you'd get when your AI takes a call for ${tenant.name}.`,
          ].join("\n");
          try {
            await sendOwnerSms(db, smsBody, owner_phone as string);
            trackEvent("demo_sms_sent", { tenant_id: tenant.tenant_id });
          } catch (smsErr) {
            log.warn({ err: smsErr }, "Demo SMS after auto-generation failed");
          }
          trackEvent("demo_audio_generation_completed", { tenant_id: tenant.tenant_id });
        } catch (err) {
          demoGenStatus.set(tenant.tenant_id, "error");
          demoGenErrors.set(tenant.tenant_id, (err as Error)?.message ?? String(err));
          log.error({ err, tenantId: tenant.tenant_id }, "Auto-triggered demo audio generation failed");
          trackEvent("demo_audio_generation_failed", { tenant_id: tenant.tenant_id, level: "error", payload: { message: (err as Error)?.message } });
        }
      })();
    }

    res.redirect("/dashboard/welcome");
  });

  app.get("/dashboard/setup-guide", dashAuth, (_req, res) => {
    res.redirect("/dashboard/welcome");
  });

  app.get("/dashboard/number-status", dashAuth, (req, res) => {
    const tenant: TenantRow = (req as any).dashTenant;
    const ready = !isPendingNumber(tenant.twilio_number);
    res.json({ ready, number: ready ? formatAuPhone(tenant.twilio_number) : null });
  });

  // ── Welcome / demo routes ─────────────────────────────────────────────────

  app.get("/dashboard/welcome", dashAuth, (req, res) => {
    const tenant: TenantRow = (req as any).dashTenant;
    const poolNumbers = env.DEMO_POOL_NUMBERS
      ? env.DEMO_POOL_NUMBERS.split(",").map((n) => n.trim()).filter(Boolean)
      : [];
    const session = poolNumbers.length ? getActiveDemoSession(db, tenant.tenant_id) : null;
    const audioReady = isDemoAudioReady(tenant.tenant_id);
    const audioGenerating = !audioReady && demoGenStatus.get(tenant.tenant_id) === "generating";
    const audioError = !audioReady && demoGenStatus.get(tenant.tenant_id) === "error";
    const qError = typeof req.query.error === "string" ? req.query.error : undefined;
    res.send(welcomePage(tenant, {
      demoNumber: session?.demo_number ?? null,
      demoAudioReady: audioReady,
      demoAudioGenerating: audioGenerating,
      demoAudioError: audioError,
      hasDemoPool: poolNumbers.length > 0,
      demoNumberExpiresAt: session?.expires_at ?? undefined,
      error: qError,
    }));
  });

  app.post("/dashboard/request-demo", dashAuth, express.urlencoded({ extended: false }), (req, res) => {
    const tenant: TenantRow = (req as any).dashTenant;
    trackEvent("demo_requested", { tenant_id: tenant.tenant_id });
    const poolNumbers = env.DEMO_POOL_NUMBERS
      ? env.DEMO_POOL_NUMBERS.split(",").map((n) => n.trim()).filter(Boolean)
      : [];

    const audioReady2 = isDemoAudioReady(tenant.tenant_id);
    const audioGen2 = !audioReady2 && demoGenStatus.get(tenant.tenant_id) === "generating";
    const audioErr2 = !audioReady2 && demoGenStatus.get(tenant.tenant_id) === "error";
    const hasPool2 = poolNumbers.length > 0;

    if (poolNumbers.length === 0) {
      trackEvent("demo_unavailable_not_configured", { tenant_id: tenant.tenant_id, level: "warn" });
      return res.send(welcomePage(tenant, {
        error: "Demo numbers are not configured yet. Please contact support to enable instant demos, or try Option A hands-free demo.",
        demoAudioReady: audioReady2, demoAudioGenerating: audioGen2, demoAudioError: audioErr2, hasDemoPool: hasPool2,
      }));
    }

    const claimed = claimDemoNumber(db, tenant.tenant_id, poolNumbers);
    if (!claimed) {
      const nextExpiry = listDemoSessions(db)
        .map((s) => new Date(s.expires_at).getTime())
        .filter((t) => Number.isFinite(t) && t > Date.now())
        .sort((a, b) => a - b)[0];
      const waitMinutes = nextExpiry ? Math.max(1, Math.ceil((nextExpiry - Date.now()) / 60000)) : null;
      const suffix = waitMinutes ? ` Estimated wait: ~${waitMinutes} min.` : "";
      trackEvent("demo_slot_busy", {
        tenant_id: tenant.tenant_id,
        level: "warn",
        payload: { waitMinutes }
      });
      return res.send(welcomePage(tenant, {
        error: `All demo slots are currently busy.${suffix} You can still run Option A hands-free demo right now.`,
        demoAudioReady: audioReady2, demoAudioGenerating: audioGen2, demoAudioError: audioErr2, hasDemoPool: hasPool2,
      }));
    }
    trackEvent("demo_slot_assigned", {
      tenant_id: tenant.tenant_id,
      payload: { demoNumber: claimed }
    });

    const session = getActiveDemoSession(db, tenant.tenant_id);
    res.send(welcomePage(tenant, {
      demoNumber: claimed,
      demoAudioReady: audioReady2, demoAudioGenerating: audioGen2, demoAudioError: audioErr2, hasDemoPool: hasPool2,
      demoNumberExpiresAt: session?.expires_at ?? undefined,
    }));
  });

  app.post("/dashboard/simulate-demo-call", dashAuth, express.urlencoded({ extended: false }), async (req, res) => {
    const tenant: TenantRow = (req as any).dashTenant;
    trackEvent("simulate_demo_requested", { tenant_id: tenant.tenant_id });
    const poolNumbers = env.DEMO_POOL_NUMBERS
      ? env.DEMO_POOL_NUMBERS.split(",").map((n) => n.trim()).filter(Boolean)
      : [];

    const audioReady3 = isDemoAudioReady(tenant.tenant_id);
    const audioGen3 = !audioReady3 && demoGenStatus.get(tenant.tenant_id) === "generating";
    const audioErr3 = !audioReady3 && demoGenStatus.get(tenant.tenant_id) === "error";
    const hasPool3 = poolNumbers.length > 0;

    if (poolNumbers.length === 0) {
      trackEvent("simulate_demo_unavailable_not_configured", { tenant_id: tenant.tenant_id, level: "warn" });
      return res.send(welcomePage(tenant, {
        error: "Demo simulation is temporarily unavailable because demo numbers are not configured yet. Please contact support.",
        demoAudioReady: audioReady3, demoAudioGenerating: audioGen3, demoAudioError: audioErr3, hasDemoPool: hasPool3,
      }));
    }

    const demoTarget = poolNumbers[0];
    const demoCallerFrom =
      getSystemConfig(db, "demo_caller_number") ??
      env.TWILIO_SMS_NUMBERS[0];

    simulationRoutingMap.set(demoTarget, {
      tenantId: tenant.tenant_id,
      expiresAt: Date.now() + 15 * 60 * 1000
    });

    try {
      const { twilioClient } = await import("./twilio/client.js");

      if (env.DEMO_POOL_NUMBER_SID) {
        await twilioClient.incomingPhoneNumbers(env.DEMO_POOL_NUMBER_SID).update({
          voiceUrl: `${env.PUBLIC_BASE_URL}/twilio/voice/incoming`,
          voiceMethod: "POST"
        }).catch((err: any) => log.warn({ err }, "Could not update demo number webhook"));
      }

      const callerScriptUrl =
        `${env.PUBLIC_BASE_URL}/twilio/demo/caller-script` +
        `?trade_type=${encodeURIComponent(tenant.trade_type)}` +
        `&business_name=${encodeURIComponent(tenant.name)}`;
      await twilioClient.calls.create({
        to: demoTarget,
        from: demoCallerFrom,
        url: callerScriptUrl,
        statusCallback: `${env.PUBLIC_BASE_URL}/twilio/voice/status`,
        statusCallbackMethod: "POST",
      });
      trackEvent("simulate_demo_started", {
        tenant_id: tenant.tenant_id,
        payload: { demoTarget, from: demoCallerFrom }
      });
    } catch (err) {
      log.error({ err }, "Failed to place simulated demo call");
      simulationRoutingMap.delete(demoTarget);
      trackEvent("simulate_demo_failed", {
        tenant_id: tenant.tenant_id,
        level: "error",
        payload: { demoTarget, message: (err as Error)?.message ?? String(err) }
      });
      return res.send(welcomePage(tenant, {
        error: "Could not place the demo call. Please try again or call the number yourself.",
        demoAudioReady: audioReady3, demoAudioGenerating: audioGen3, demoAudioError: audioErr3, hasDemoPool: hasPool3,
      }));
    }

    const simSession = getActiveDemoSession(db, tenant.tenant_id);
    res.send(welcomePage(tenant, {
      simulationStarted: true,
      demoNumber: simSession?.demo_number ?? null,
      demoAudioReady: audioReady3, demoAudioGenerating: audioGen3, demoAudioError: audioErr3, hasDemoPool: hasPool3,
      demoNumberExpiresAt: simSession?.expires_at ?? undefined,
    }));
  });

  // ── Personalised demo audio generation ──────────────────────────────────────

  const DEMO_AUDIO_DIR = path.resolve(__dirname, "../data/demo-audio");
  fs.mkdirSync(DEMO_AUDIO_DIR, { recursive: true });

  type DemoGenStatus = "generating" | "ready" | "error";
  const demoGenStatus = new Map<string, DemoGenStatus>();
  const demoGenErrors = new Map<string, string>();

  function getDemoAudioPath(tenantId: string): string {
    return path.join(DEMO_AUDIO_DIR, `${tenantId}.mp3`);
  }

  function isDemoAudioReady(tenantId: string): boolean {
    return fs.existsSync(getDemoAudioPath(tenantId));
  }

  type TtsVoice = "nova" | "onyx" | "shimmer" | "sage" | "alloy" | "echo" | "fable" | "ash" | "coral";
  const VALID_TTS_VOICES = new Set<string>(["nova", "onyx", "shimmer", "sage", "alloy", "echo", "fable", "ash", "coral"]);
  interface ScriptLine { speaker: "ai" | "customer"; text: string; }

  const DEMO_SCRIPTS: Record<string, {
    customerVoice: TtsVoice;
    scenario: (biz: string, aiName: string, area: string | null) => ScriptLine[];
    sms: (biz: string) => { name: string; phone: string; address: string; issue: string };
  }> = {
    plumber: {
      customerVoice: "onyx",
      scenario: (biz, aiName, area) => [
        { speaker: "ai",       text: `G'day! Thanks for calling ${biz}, this is ${aiName} — how can I help you today?` },
        { speaker: "customer", text: "Hi yeah, look I've got a burst pipe under my kitchen sink and there's water going everywhere." },
        { speaker: "ai",       text: `Oh no, that sounds really urgent — you've definitely called the right place. Let me get your details sorted straight away. Can I grab your name first?` },
        { speaker: "customer", text: "Yeah, it's Mark." },
        { speaker: "ai",       text: "Thanks Mark. Whereabouts are you located? Suburb and postcode would be great." },
        { speaker: "customer", text: "I'm in Parramatta, 2150." },
        { speaker: "ai",       text: `Got ya, Parramatta 2150.${area ? "" : ""} And what's the best number to reach you on — is it the one you're calling from?` },
        { speaker: "customer", text: "Yeah that's fine, same number." },
        { speaker: "ai",       text: `Perfect. I've flagged this as urgent. Just so you know, I'm an AI assistant for ${biz}, so I can't book someone in directly, but the team will give you a ring back as soon as possible — likely within the hour. Is there anything else you'd like to pass on?` },
        { speaker: "customer", text: "No, just please hurry — there's water all over the floor." },
        { speaker: "ai",       text: "No dramas at all Mark, I've got you down as urgent. Someone from the team will be in touch real soon. Cheers, take care!" },
      ],
      sms: (biz) => ({ name: "Mark Thompson", phone: "0412 345 678", address: "52 Smith Street, Parramatta NSW 2150", issue: "Burst pipe under the kitchen sink, water going everywhere. Needs urgent repair today." }),
    },
    electrician: {
      customerVoice: "onyx",
      scenario: (biz, aiName) => [
        { speaker: "ai",       text: `Hi there, thanks for calling ${biz}! ${aiName} speaking — how can I help?` },
        { speaker: "customer", text: "Hi, I've got a complete power outage in my home. All the breakers look fine but nothing's working." },
        { speaker: "ai",       text: "That definitely needs looking at — let's get your details taken care of. Can I grab your name?" },
        { speaker: "customer", text: "It's James." },
        { speaker: "ai",       text: "Thanks James. And what suburb are you in? Postcode as well if you've got it." },
        { speaker: "customer", text: "Chatswood, 2067." },
        { speaker: "ai",       text: "Chatswood 2067, got that. And what's the best number to reach you on?" },
        { speaker: "customer", text: "This number is fine." },
        { speaker: "ai",       text: `Perfect. I've flagged this as urgent for the ${biz} team. Just so you know, I'm an AI receptionist, so I can't send someone out directly — but I've got all your details and someone will call you back as a priority. Safety tip: avoid touching the switchboard until a licensed electrician checks it. Anything else?` },
        { speaker: "customer", text: "No that's it, thanks." },
        { speaker: "ai",       text: "No worries James, the team will be in touch real soon. Take care!" },
      ],
      sms: (biz) => ({ name: "James Wilson", phone: "0423 456 789", address: "14 Oak Avenue, Chatswood NSW 2067", issue: "Complete power outage — all breakers look fine but nothing's working. Needs same-day inspection." }),
    },
    roofer: {
      customerVoice: "shimmer",
      scenario: (biz, aiName) => [
        { speaker: "ai",       text: `G'day, ${biz} — ${aiName} here, how can I help?` },
        { speaker: "customer", text: "Hi, I've got a pretty bad roof leak. It rained last night and water was coming through my ceiling." },
        { speaker: "ai",       text: "Oh no, that's definitely something we'd want to look at quickly. Let me grab your details. Can I start with your name?" },
        { speaker: "customer", text: "Sarah Mitchell." },
        { speaker: "ai",       text: "Thanks Sarah. What suburb are you in?" },
        { speaker: "customer", text: "Blacktown, 2148." },
        { speaker: "ai",       text: "Blacktown 2148. And what's the best number to call you back on?" },
        { speaker: "customer", text: "0434 567 890." },
        { speaker: "ai",       text: `Got it. I've flagged this as urgent for the ${biz} team. I'm an AI receptionist, so I can't arrange an inspection right now — but someone will give you a call back as soon as possible. In the meantime, if you can put a bucket under the drip, that'll help minimise damage. Anything else?` },
        { speaker: "customer", text: "No, that's all — thanks." },
        { speaker: "ai",       text: "No worries Sarah, someone will be in touch soon. Take care!" },
      ],
      sms: (biz) => ({ name: "Sarah Mitchell", phone: "0434 567 890", address: "7 Maple Drive, Blacktown NSW 2148", issue: "Roof leaking badly after rain, water coming through bedroom ceiling." }),
    },
    handyman: {
      customerVoice: "onyx",
      scenario: (biz, aiName) => [
        { speaker: "ai",       text: `Hi there, ${biz} — ${aiName} speaking, how can I help you today?` },
        { speaker: "customer", text: "Hi, I've got a few odd jobs. A leaky tap, a broken fence panel, and a door that won't close properly." },
        { speaker: "ai",       text: "No worries, sounds like the kind of thing we can sort out! Let me take your details. Can I grab your name?" },
        { speaker: "customer", text: "David Miller." },
        { speaker: "ai",       text: "Thanks David. What suburb are you in?" },
        { speaker: "customer", text: "Penrith, 2750." },
        { speaker: "ai",       text: "Penrith 2750, got it. And what's the best number for a callback?" },
        { speaker: "customer", text: "This one is fine." },
        { speaker: "ai",       text: `Great. I've noted down all three jobs — leaky tap, fence panel, and the door. I'm an AI receptionist for ${biz}, so I'll pass this straight to the team and they'll call you back to arrange a time. Anything else?` },
        { speaker: "customer", text: "No, that covers it. Thanks." },
        { speaker: "ai",       text: "Beauty, someone will be in touch soon. Have a great day David!" },
      ],
      sms: (biz) => ({ name: "David Miller", phone: "0445 678 901", address: "21 Park Street, Penrith NSW 2750", issue: "Multiple jobs: leaky tap, broken fence panel, and a door that won't close properly." }),
    },
    painter: {
      customerVoice: "shimmer" as TtsVoice,
      scenario: (biz: string, aiName: string) => [
        { speaker: "ai" as const,       text: `Hi there, thanks for calling ${biz}! ${aiName} speaking — how can I help?` },
        { speaker: "customer" as const, text: "Hi, I'm looking to get my whole interior repainted. Four bedrooms plus the living area and hallway." },
        { speaker: "ai" as const,       text: "Lovely — sounds like a nice refresh! Let me take your details so we can get back to you with a quote. Can I grab your name?" },
        { speaker: "customer" as const, text: "It's Emma Brown." },
        { speaker: "ai" as const,       text: "Thanks Emma. What suburb are you in?" },
        { speaker: "customer" as const, text: "Cronulla, 2230." },
        { speaker: "ai" as const,       text: "Cronulla 2230, got it. And what's the best number to reach you on?" },
        { speaker: "customer" as const, text: "0456 789 012." },
        { speaker: "ai" as const,       text: `Perfect. I've noted down all the rooms — four bedrooms, living area, and hallway. I'm an AI receptionist for ${biz}, so I can't give you a price right now, but one of the team will call you back to chat through colours, finishes, and arrange a time to quote. Anything else?` },
        { speaker: "customer" as const, text: "No, that covers it. Thanks." },
        { speaker: "ai" as const,       text: "Beauty, someone will be in touch soon. Have a great day Emma!" },
      ],
      sms: (biz: string) => ({ name: "Emma Brown", phone: "0456 789 012", address: "88 Beach Road, Cronulla NSW 2230", issue: "Full interior repaint — 4 bedrooms plus living area and hallway. Requesting a quote." }),
    },
    carpenter: {
      customerVoice: "onyx" as TtsVoice,
      scenario: (biz: string, aiName: string) => [
        { speaker: "ai" as const,       text: `G'day, ${biz} — ${aiName} here, how can I help?` },
        { speaker: "customer" as const, text: "Hi, I need some custom kitchen cabinets built and installed. I'm renovating my kitchen." },
        { speaker: "ai" as const,       text: "Oh nice — a kitchen reno! Let me get your details so the team can follow up. Can I start with your name?" },
        { speaker: "customer" as const, text: "Tom Anderson." },
        { speaker: "ai" as const,       text: "Thanks Tom. What suburb are you in?" },
        { speaker: "customer" as const, text: "Cronulla, 2230." },
        { speaker: "ai" as const,       text: "Cronulla 2230. And what's the best number for a callback?" },
        { speaker: "customer" as const, text: "This one is fine." },
        { speaker: "ai" as const,       text: `Great. I've noted down custom kitchen cabinets — build and install. I'm an AI receptionist for ${biz}, so I'll pass this to the team and they'll give you a call to discuss measurements and materials. Anything else you'd like to add?` },
        { speaker: "customer" as const, text: "Yeah, I'm after a Shaker-style design if that helps." },
        { speaker: "ai" as const,       text: "Shaker-style — got it, I've added that. Someone will be in touch soon. Cheers Tom!" },
      ],
      sms: (biz: string) => ({ name: "Tom Anderson", phone: "0467 890 123", address: "33 Beach Road, Cronulla NSW 2230", issue: "Custom kitchen cabinets — build and install, Shaker-style design, part of kitchen renovation." }),
    },
    tiler: {
      customerVoice: "shimmer" as TtsVoice,
      scenario: (biz: string, aiName: string) => [
        { speaker: "ai" as const,       text: `Hi there, ${biz} — ${aiName} speaking, how can I help you today?` },
        { speaker: "customer" as const, text: "Hi, I need my bathroom retiled. It's about eight square metres. Some tiles have cracked and I want to redo the whole lot." },
        { speaker: "ai" as const,       text: "No worries, we can definitely help with that. Let me grab your details. Can I get your name?" },
        { speaker: "customer" as const, text: "Rachel Green." },
        { speaker: "ai" as const,       text: "Thanks Rachel. What suburb are you in?" },
        { speaker: "customer" as const, text: "Liverpool, 2170." },
        { speaker: "ai" as const,       text: "Liverpool 2170, got it. And the best number to reach you?" },
        { speaker: "customer" as const, text: "0478 901 234." },
        { speaker: "ai" as const,       text: `Perfect. I've got bathroom retile, about eight square metres. I'm an AI receptionist for ${biz}, so I can't quote right now — but the team will call you back to discuss tile options and arrange a time. Anything else?` },
        { speaker: "customer" as const, text: "I've already picked out tiles from Beaumont Tiles, just need someone to do the work." },
        { speaker: "ai" as const,       text: "Great, I've noted that down — tiles already sourced. Someone will be in touch soon. Cheers Rachel!" },
      ],
      sms: (biz: string) => ({ name: "Rachel Green", phone: "0478 901 234", address: "15 Harbour Street, Liverpool NSW 2170", issue: "Bathroom retile — about 8 sqm. Tiles already sourced from Beaumont Tiles, needs labour only." }),
    },
    builder: {
      customerVoice: "onyx" as TtsVoice,
      scenario: (biz: string, aiName: string) => [
        { speaker: "ai" as const,       text: `G'day! Thanks for calling ${biz}, this is ${aiName} — how can I help you today?` },
        { speaker: "customer" as const, text: "Hi, I'm looking to get a granny flat built out the back. About 40 square metres, with a kitchenette and bathroom." },
        { speaker: "ai" as const,       text: "That's a great project! Let me take your details so the team can get back to you. Can I grab your name?" },
        { speaker: "customer" as const, text: "It's Steve Collins." },
        { speaker: "ai" as const,       text: "Thanks Steve. What suburb are you in?" },
        { speaker: "customer" as const, text: "Castle Hill, 2154." },
        { speaker: "ai" as const,       text: "Castle Hill 2154. And what's the best number to reach you on?" },
        { speaker: "customer" as const, text: "0489 012 345." },
        { speaker: "ai" as const,       text: `Perfect. I've noted a 40-square-metre granny flat with kitchenette and bathroom. I'm an AI receptionist for ${biz}, so I can't discuss pricing or council requirements right now — but the team will call you back to go through the details and arrange a site visit. Anything else?` },
        { speaker: "customer" as const, text: "Yeah, I'd want it to be a separate dwelling with its own entrance." },
        { speaker: "ai" as const,       text: "Got it — separate entrance, own dwelling. Someone from the team will be in touch real soon. Cheers Steve!" },
      ],
      sms: (biz: string) => ({ name: "Steve Collins", phone: "0489 012 345", address: "42 George Street, Castle Hill NSW 2154", issue: "Granny flat build — 40sqm studio with kitchenette, bathroom, and separate entrance." }),
    },
    other: {
      customerVoice: "onyx" as TtsVoice,
      scenario: (biz: string, aiName: string) => [
        { speaker: "ai" as const,       text: `Hi there, thanks for calling ${biz}! ${aiName} speaking — how can I help?` },
        { speaker: "customer" as const, text: "Hi, I need some work done at my property. I've got a couple of things that need fixing up." },
        { speaker: "ai" as const,       text: "No worries at all — let me take your details so the team can follow up. Can I grab your name?" },
        { speaker: "customer" as const, text: "It's Chris Taylor." },
        { speaker: "ai" as const,       text: "Thanks Chris. What suburb are you in?" },
        { speaker: "customer" as const, text: "Parramatta, 2150." },
        { speaker: "ai" as const,       text: "Parramatta 2150, got it. And what's the best number to reach you on?" },
        { speaker: "customer" as const, text: "This number is fine." },
        { speaker: "ai" as const,       text: `Perfect. I'm an AI receptionist for ${biz}, so I can't discuss the details right now — but I've got your info and the team will give you a call back to chat through what you need. Anything else you'd like to add?` },
        { speaker: "customer" as const, text: "Just that I'm flexible on timing — any day next week works." },
        { speaker: "ai" as const,       text: "Noted — flexible next week. Someone will be in touch soon. Cheers Chris!" },
      ],
      sms: (biz: string) => ({ name: "Chris Taylor", phone: "0490 123 456", address: "10 Station Street, Parramatta NSW 2150", issue: "Multiple items needing attention at property. Flexible on timing — available any day next week." }),
    },
  };
  const FALLBACK_SCRIPT = DEMO_SCRIPTS.plumber;

  async function ttsChunk(text: string, voice: TtsVoice): Promise<Buffer> {
    const res = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: "tts-1", voice, input: text, response_format: "mp3", speed: 1.0 }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`TTS API error ${res.status}: ${body}`);
    }
    return Buffer.from(await res.arrayBuffer());
  }

  async function generatePersonalisedDemoAudio(tenant: TenantRow): Promise<void> {
    const script = DEMO_SCRIPTS[tenant.trade_type] ?? FALLBACK_SCRIPT;
    const aiName = tenant.ai_name || "Olivia";
    const bizName = tenant.name;
    const area = (tenant as any).service_area ?? null;
    const lines = script.scenario(bizName, aiName, area);

    const rawVoice = env.OPENAI_TTS_VOICE || env.OPENAI_VOICE || "nova";
    const aiVoice: TtsVoice = VALID_TTS_VOICES.has(rawVoice) ? (rawVoice as TtsVoice) : "nova";
    if (!VALID_TTS_VOICES.has(rawVoice)) {
      log.warn({ configured: rawVoice, fallback: "nova" }, "TTS voice is not valid for tts-1 model, falling back to nova");
    }
    const chunks: Buffer[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const voice = line.speaker === "ai" ? aiVoice : script.customerVoice;
      chunks.push(await ttsChunk(line.text, voice));

      if (i < lines.length - 1) {
        const nextSpeaker = lines[i + 1].speaker;
        chunks.push(createSilenceMP3(getSpeakerChangeDelay(line.speaker, nextSpeaker)));
      }
    }

    const combined = Buffer.concat(chunks);
    const outPath = getDemoAudioPath(tenant.tenant_id);
    fs.writeFileSync(outPath, combined);
    log.info({ tenantId: tenant.tenant_id, sizeKb: Math.round(combined.length / 1024) }, "Personalised demo audio generated");
  }

  // Kick off demo audio generation + send SMS when done
  app.post("/dashboard/generate-demo-audio", dashAuth, rateLimit({ maxRequests: 3, windowMs: 5 * 60_000, message: "Please wait a few minutes before generating another demo." }), async (req, res) => {
    const tenant: TenantRow = (req as any).dashTenant;

    if (isDemoAudioReady(tenant.tenant_id)) {
      return res.redirect("/dashboard/welcome");
    }
    if (demoGenStatus.get(tenant.tenant_id) === "generating") {
      return res.redirect("/dashboard/welcome");
    }
    if (!env.OPENAI_API_KEY) {
      trackEvent("demo_audio_no_api_key", { tenant_id: tenant.tenant_id, level: "error" });
      return res.send(welcomePage(tenant, { error: "Demo audio generation is temporarily unavailable. Please try again later or contact support." }));
    }

    trackEvent("demo_audio_generation_started", { tenant_id: tenant.tenant_id });
    demoGenStatus.set(tenant.tenant_id, "generating");

    // Run generation in background — don't block the response
    (async () => {
      try {
        await generatePersonalisedDemoAudio(tenant);
        demoGenStatus.set(tenant.tenant_id, "ready");

        // Send sample SMS after audio generation completes
        const script = DEMO_SCRIPTS[tenant.trade_type] ?? FALLBACK_SCRIPT;
        const sample = script.sms(tenant.name);
        const smsBody = [
          `NEW JOB (URGENT):`,
          `Name: ${sample.name}`,
          `Phone: ${sample.phone}`,
          `Address: ${sample.address}`,
          `Details: ${sample.issue}`,
          `Next: Call back ASAP`,
          ``,
          `⬆️ THIS IS A DEMO — here's what you'd get when your AI takes a call for ${tenant.name}.`,
        ].join("\n");
        try {
          await sendOwnerSms(db, smsBody, tenant.owner_phone);
          trackEvent("demo_sms_sent", { tenant_id: tenant.tenant_id });
        } catch (smsErr) {
          log.warn({ err: smsErr }, "Demo SMS after audio generation failed");
        }

        trackEvent("demo_audio_generation_completed", { tenant_id: tenant.tenant_id });
      } catch (err) {
        demoGenStatus.set(tenant.tenant_id, "error");
        demoGenErrors.set(tenant.tenant_id, (err as Error)?.message ?? String(err));
        log.error({ err, tenantId: tenant.tenant_id }, "Demo audio generation failed");
        trackEvent("demo_audio_generation_failed", { tenant_id: tenant.tenant_id, level: "error", payload: { message: (err as Error)?.message } });
      }
    })();

    res.redirect("/dashboard/welcome");
  });

  // Poll for demo audio generation status
  app.get("/dashboard/demo-audio-status", dashAuth, (req, res) => {
    const tenant: TenantRow = (req as any).dashTenant;
    if (isDemoAudioReady(tenant.tenant_id)) {
      return res.json({ status: "ready" });
    }
    const status = demoGenStatus.get(tenant.tenant_id) ?? "none";
    const errorDetail = status === "error" ? (demoGenErrors.get(tenant.tenant_id) ?? null) : null;
    res.json({ status, error: errorDetail });
  });

  // Serve the generated personalised demo audio
  app.get("/dashboard/demo-audio.mp3", dashAuth, (req, res) => {
    const tenant: TenantRow = (req as any).dashTenant;
    const audioPath = getDemoAudioPath(tenant.tenant_id);
    if (!fs.existsSync(audioPath)) {
      return res.status(404).send("Demo audio not yet generated");
    }
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.sendFile(audioPath);
  });

  app.get("/dashboard/demo-status", dashAuth, (req, res) => {
    const tenant: TenantRow = (req as any).dashTenant;
    // Find most recent call for this tenant with a recording
    const recentCalls = db.all<{ call_id: string; recording_url: string | null }>(
      `SELECT call_id, recording_url FROM calls
       WHERE tenant_id = ? AND recording_url IS NOT NULL
       ORDER BY started_at DESC LIMIT 1`,
      [tenant.tenant_id]
    );
    const latest = recentCalls?.[0] ?? null;
    if (latest?.recording_url) {
      // Return a proxy URL so the browser can play it without Twilio credentials
      const proxyUrl = `/dashboard/recording-proxy?url=${encodeURIComponent(latest.recording_url)}`;
      trackEvent("demo_recording_ready", { tenant_id: tenant.tenant_id, call_id: latest.call_id });
      res.json({ status: "ready", recordingUrl: proxyUrl });
    } else {
      res.json({ status: "pending", recordingUrl: null });
    }
  });

  // Proxy Twilio recording audio — Twilio requires HTTP Basic Auth which browsers can't supply.
  app.get("/dashboard/recording-proxy", dashAuth, async (req, res) => {
    const tenant: TenantRow = (req as any).dashTenant;
    const rawUrl = typeof req.query.url === "string" ? req.query.url : "";
    if (
      !rawUrl.startsWith("https://api.twilio.com/") ||
      !rawUrl.includes(`/Accounts/${env.TWILIO_ACCOUNT_SID}/`)
    ) {
      return res.status(400).send("Invalid recording URL");
    }
    const ownsRecording = db.get<{ call_id: string }>(
      `SELECT call_id FROM calls WHERE recording_url = ? AND tenant_id = ?`,
      [rawUrl, tenant.tenant_id]
    );
    if (!ownsRecording) {
      return res.status(403).send("Access denied");
    }
    try {
      const creds = Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString("base64");
      const upstream = await fetch(rawUrl, { headers: { Authorization: `Basic ${creds}` } });
      if (!upstream.ok) {
        return res.status(upstream.status).send("Recording not available");
      }
      res.setHeader("Content-Type", upstream.headers.get("content-type") ?? "audio/mpeg");
      res.setHeader("Cache-Control", "private, max-age=3600");
      const buf = await upstream.arrayBuffer();
      res.send(Buffer.from(buf));
    } catch (err) {
      log.warn({ err }, "recording-proxy fetch failed");
      res.status(502).send("Could not fetch recording");
    }
  });

  // SSE endpoint — streams live AI audio chunks to the dashboard browser.
  // The client connects immediately after clicking "Generate Demo Call" and
  // hears the AI receptionist's responses in real-time (PCMU → μ-law decoded
  // to PCM by the browser's AudioContext).
  app.get("/dashboard/demo-audio-stream", dashAuth, (req, res) => {
    const tenant: TenantRow = (req as any).dashTenant;
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no"); // disable nginx buffering if present
    res.flushHeaders();

    // Send keepalive comments every 20 s so the connection doesn't time out.
    const keepAlive = setInterval(() => res.write(": ka\n\n"), 20_000);

    const audioHandler = (chunk: string) => {
      res.write(`data: ${chunk}\n\n`);
    };
    const endHandler = () => {
      res.write("event: end\ndata: done\n\n");
      clearInterval(keepAlive);
      res.end();
    };

    demoAudioEmitter.on(`audio:${tenant.tenant_id}`, audioHandler);
    demoAudioEmitter.once(`end:${tenant.tenant_id}`, endHandler);

    req.on("close", () => {
      clearInterval(keepAlive);
      demoAudioEmitter.off(`audio:${tenant.tenant_id}`, audioHandler);
      demoAudioEmitter.off(`end:${tenant.tenant_id}`, endHandler);
    });
  });

  // Scripted "caller" TwiML for simulated demo calls — Twilio requests this URL.
  const DEMO_CALLER_SCRIPTS: Record<string, string> = {
    plumber: "Hi there, I've got a burst pipe under my kitchen sink, water's going everywhere. Can someone come out today? My address is 52 Smith Street Parramatta.",
    electrician: "Hi, I've got a complete power outage in my home. All the breakers look fine but nothing's working. I'm at 14 Oak Avenue Chatswood.",
    roofer: "G'day, I've got a pretty bad roof leak — it rained last night and water was coming through my ceiling. I'm at 7 Maple Drive Blacktown.",
    painter: "Hi, I'm looking to get my entire interior repainted — four bedrooms plus living area. Can someone come for a quote? I'm in Penrith.",
    carpenter: "Hi, I need some custom kitchen cabinets built and installed. I'm renovating my kitchen at 33 Beach Road Cronulla.",
    tiler: "Hi, I need my bathroom retiled — it's about 8 square metres. Some tiles have cracked and I want to redo the whole lot. I'm in Liverpool.",
    handyman: "Hi, I've got a few odd jobs around the house — a leaky tap, a broken fence panel, and a door that won't close properly. I'm at 21 Park Street Penrith.",
  };
  const DEFAULT_DEMO_SCRIPT =
    "Hi, I need some help with a job at my property. Can you take my details and have someone call me back?";

  app.post("/twilio/demo/caller-script", twilioVerify, (req, res) => {
    const tradeType = typeof req.query.trade_type === "string" ? req.query.trade_type : "";
    const rawName = typeof req.query.business_name === "string" ? req.query.business_name : "";
    const businessName = rawName.replace(/[<>&"']/g, "");
    const script = DEMO_CALLER_SCRIPTS[tradeType] ?? DEFAULT_DEMO_SCRIPT;
    const closing = businessName
      ? `Thanks, I'll wait to hear back from ${businessName}. Bye.`
      : "That sounds great, thanks.";
    const vr = newVoiceResponse();
    vr.pause({ length: 4 });
    vr.say({ voice: "Polly.Matthew" }, script);
    vr.pause({ length: 25 });
    vr.say({ voice: "Polly.Matthew" }, "James Wilson.");
    vr.pause({ length: 12 });
    vr.say({ voice: "Polly.Matthew" }, closing);
    vr.pause({ length: 10 });
    vr.hangup();
    res.type("text/xml").send(vr.toString());
  });

  app.get("/dashboard", dashAuth, (req, res) => {
    const tenant: TenantRow = (req as any).dashTenant;
    const destination = (tenant.payment_status === "demo" || isPendingNumber(tenant.twilio_number) || tenant.payment_status === "pending")
      ? "/dashboard/welcome" : "/dashboard/leads";
    res.redirect(destination);
  });

  // Upgrade / trial-expired page (no trialGuard — it IS the gate)
  app.get("/dashboard/upgrade", dashAuth, (req, res) => {
    const tenant: TenantRow = (req as any).dashTenant;
    const reason = typeof req.query.reason === "string" ? req.query.reason : undefined;
    res.send(upgradePage(tenant, !!env.STRIPE_SECRET_KEY, reason));
  });

  // Stripe Checkout — create session and redirect to Stripe's hosted page
  // Used from the upgrade page button and the signup flow auto-submit form
  const createStripeCheckoutSession = async (req: Request, res: Response) => {
    const tenant: TenantRow = (req as any).dashTenant;
    const stripe = getStripe();
    log.info({ hasStripe: !!stripe, hasPriceId: !!env.STRIPE_PRICE_ID, paymentStatus: tenant.payment_status }, "Checkout session requested");
    if (!stripe || !env.STRIPE_PRICE_ID) {
      if (tenant.payment_status === "demo" || tenant.payment_status === "pending") {
        const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
        updateTenant(db, tenant.tenant_id, { payment_status: "trial", trial_ends_at: trialEndsAt });
        log.info({ tenantId: tenant.tenant_id }, "Stripe not configured — auto-granting trial (dev mode)");
      }
      return res.redirect("/dashboard/welcome");
    }
    const cancelUrl = tenant.payment_status === "demo"
      ? `${env.PUBLIC_BASE_URL}/dashboard/welcome`
      : `${env.PUBLIC_BASE_URL}/dashboard/upgrade`;
    try {
      const checkoutParams: Record<string, any> = {
        mode: "subscription",
        customer_email: tenant.owner_email ?? undefined,
        line_items: [{ price: env.STRIPE_PRICE_ID, quantity: 1 }],
        success_url: `${env.PUBLIC_BASE_URL}/dashboard/stripe-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: cancelUrl,
        metadata: { tenant_id: tenant.tenant_id },
        subscription_data: {
          trial_period_days: 14,
          metadata: { tenant_id: tenant.tenant_id }
        },
      };
      if (env.STRIPE_FOUNDING_COUPON_ID) {
        checkoutParams.discounts = [{ coupon: env.STRIPE_FOUNDING_COUPON_ID }];
      } else {
        checkoutParams.allow_promotion_codes = true;
      }
      const session = await stripe.checkout.sessions.create(checkoutParams);
      res.redirect(303, session.url!);
    } catch (err: any) {
      log.error({ err }, "Stripe checkout session creation failed");
      const errMsg = encodeURIComponent(err?.message ?? "Stripe checkout failed. Please try again.");
      if (tenant.payment_status === "demo") {
        return res.redirect(`/dashboard/welcome?error=${errMsg}`);
      }
      res.redirect(`/dashboard/upgrade?reason=stripe_error&detail=${errMsg}`);
    }
  };

  app.post("/dashboard/create-checkout-session", dashAuth, rateLimit({ maxRequests: 5, windowMs: 5 * 60_000, message: "Too many checkout requests. Please wait a few minutes." }), createStripeCheckoutSession);

  // Stripe success redirect — card collected, 14-day trial has begun.
  // This is also where we provision the real Twilio number (deferred from signup).
  app.get("/dashboard/stripe-success", dashAuth, async (req, res) => {
    const tenant: TenantRow = (req as any).dashTenant;
    const stripe = getStripe();
    const sessionId = req.query.session_id as string | undefined;
    if (!stripe || !sessionId) return res.redirect("/dashboard/welcome");

    try {
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      if (session.metadata?.tenant_id !== tenant.tenant_id) {
        log.warn({ expected: tenant.tenant_id, got: session.metadata?.tenant_id }, "Stripe success tenant_id mismatch — ignoring");
        return res.redirect("/dashboard/welcome");
      }
      if (session.status === "complete" || session.payment_status === "paid" || session.payment_status === "no_payment_required") {
        // Update payment status (idempotent — the webhook may have done this already).
        let statusJustUpdated = false;
        if (tenant.payment_status === "demo" || tenant.payment_status === "pending") {
          const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
          updateTenant(db, tenant.tenant_id, {
            payment_status: "trial",
            trial_ends_at: trialEndsAt,
            stripe_customer_id: session.customer as string
          });
          statusJustUpdated = true;
          log.info({ tenantId: tenant.tenant_id }, "Stripe checkout complete — 14-day trial started");
        }

        // Provision a real Twilio AU landline number.  Runs independently of the
        // payment-status update above so it works even when the webhook fires
        // before this browser redirect (which would leave payment_status = "trial"
        // and cause the old code to skip provisioning entirely).
        let twilioNumber: string | null = null;
        if (isPendingNumber(tenant.twilio_number)) {
          try {
            const { twilioClient } = await import("./twilio/client.js");
            let chosenNumber: string | null = null;

            const nsw = await twilioClient.availablePhoneNumbers("AU").local.list({ contains: "+612*", limit: 1 });
            chosenNumber = nsw[0]?.phoneNumber ?? null;

            if (!chosenNumber) {
              const vic = await twilioClient.availablePhoneNumbers("AU").local.list({ contains: "+613*", limit: 1 });
              chosenNumber = vic[0]?.phoneNumber ?? null;
            }

            if (!chosenNumber) {
              const anyLocal = await twilioClient.availablePhoneNumbers("AU").local.list({ limit: 1 });
              chosenNumber = anyLocal[0]?.phoneNumber ?? null;
            }

            if (!chosenNumber) {
              log.warn({ tenantId: tenant.tenant_id }, "No AU landline numbers available — trying mobile");
              const mobile = await twilioClient.availablePhoneNumbers("AU").mobile.list({ limit: 1 });
              chosenNumber = mobile[0]?.phoneNumber ?? null;
            }

            if (chosenNumber) {
              const purchased = await twilioClient.incomingPhoneNumbers.create({
                phoneNumber: chosenNumber,
                voiceUrl: `${env.PUBLIC_BASE_URL}/twilio/voice/incoming`,
                voiceMethod: "POST",
                statusCallback: `${env.PUBLIC_BASE_URL}/twilio/voice/status`,
                statusCallbackMethod: "POST",
                friendlyName: `PickupAI – ${tenant.name}`,
              });
              twilioNumber = purchased.phoneNumber;
              updateTenant(db, tenant.tenant_id, { twilio_number: twilioNumber });
              log.info({ number: twilioNumber, tenantId: tenant.tenant_id }, "Provisioned Twilio number after Stripe checkout");
            } else {
              log.warn({ tenantId: tenant.tenant_id }, "No AU numbers available after checkout — staying PENDING");
            }
          } catch (provisionErr: any) {
            log.warn({ err: provisionErr, tenantId: tenant.tenant_id }, "Twilio provisioning failed after checkout — staying PENDING");
          }
        } else {
          twilioNumber = tenant.twilio_number;
        }

        // Send welcome SMS + founder notification on first visit (not on page refresh).
        if (statusJustUpdated || twilioNumber) {
          const fwdCode = twilioNumber ? generateForwardingCode(twilioNumber) : null;
          try {
            const body = twilioNumber
              ? `Your 14-day free trial has started, ${tenant.name}! Your AI receptionist number: ${formatAuPhone(twilioNumber)}\n\nTo activate, open your phone dialler and type:\n${fwdCode}\nThen press Call. That's it - you're live!\n\nNeed help? Reply to this text.`
              : `Your 14-day free trial has started, ${tenant.name}! We're setting up your number - you'll get an SMS with your activation code shortly.\n\nIn the meantime, check your dashboard: ${env.PUBLIC_BASE_URL}/dashboard/welcome`;
            const sms = await sendOwnerSms(db, body, tenant.owner_phone);
            if (sms.status === "skipped") log.warn({ reason: sms.reason }, "Post-checkout welcome SMS skipped");
          } catch (e) { log.warn({ e }, "Post-checkout welcome SMS failed"); }

          if (env.OWNER_PHONE_NUMBER) {
            try {
              const sms = await sendOwnerSms(db,
                `PickupAI: New trial started (card on file) - ${tenant.name} (${formatAuPhone(tenant.owner_phone)})${twilioNumber ? ` Number: ${formatAuPhone(twilioNumber)}` : " (number pending)"}. Admin: ${env.PUBLIC_BASE_URL}/admin/users/${tenant.tenant_id}`
              );
              if (sms.status === "skipped") log.warn({ reason: sms.reason }, "founder trial notification SMS skipped");
            } catch (e) { log.warn({ e }, "founder trial notification SMS failed"); }
          }
        } else {
          log.info({ tenantId: tenant.tenant_id, currentStatus: tenant.payment_status }, "stripe-success: already provisioned — skipping notifications (idempotent)");
        }
      }
    } catch (err: any) {
      log.error({ err }, "Stripe session retrieval failed");
    }

    if (env.GA_MEASUREMENT_ID && sessionId) {
      const gaSnip = gaHeadSnippet(env.GA_MEASUREMENT_ID);
      res.type("html").send(`<!DOCTYPE html><html><head><meta charset="UTF-8"/>${gaSnip}
<script>
gtag('event','purchase',{transaction_id:${JSON.stringify(sessionId)},currency:'AUD',value:149,items:[{item_name:'PickupAI Subscription',price:149,quantity:1}]});
setTimeout(function(){window.location.href='/dashboard/welcome';},500);
</script></head><body><p>Redirecting…</p></body></html>`);
    } else {
      res.redirect("/dashboard/welcome");
    }
  });

  // Stripe Customer Billing Portal — lets users cancel / update card themselves
  app.post("/dashboard/billing-portal", dashAuth, async (req, res) => {
    const tenant: TenantRow = (req as any).dashTenant;
    const stripe = getStripe();
    if (!stripe || !tenant.stripe_customer_id) {
      return res.redirect("/dashboard/settings?flash=" + encodeURIComponent("⚠ No active subscription found"));
    }
    try {
      const session = await stripe.billingPortal.sessions.create({
        customer: tenant.stripe_customer_id,
        return_url: `${env.PUBLIC_BASE_URL}/dashboard/settings`
      });
      res.redirect(303, session.url);
    } catch (err: any) {
      log.error({ err }, "Stripe billing portal session creation failed");
      res.redirect("/dashboard/settings?flash=" + encodeURIComponent("⚠ Could not open billing portal. Please try again."));
    }
  });

  // User self-service settings
  app.get("/dashboard/settings", dashAuth, (req, res) => {
    const tenant: TenantRow = (req as any).dashTenant;
    const flash = (req.query.flash as string | undefined) ?? undefined;
    res.send(settingsPage(tenant, flash));
  });

  app.post("/dashboard/settings", dashAuth, express.urlencoded({ extended: false }), (req, res) => {
    const tenant: TenantRow = (req as any).dashTenant;
    const b = req.body ?? {};
    if (!b.name || !b.owner_phone) {
      return res.send(settingsPage(tenant, "Business name and phone are required."));
    }
    const settingsPhoneClean = (b.owner_phone as string).replace(/[\s\-()]/g, "");
    if (!/^(\+?61\d{9}|0[2-9]\d{8})$/.test(settingsPhoneClean)) {
      return res.send(settingsPage(tenant, "Please enter a valid Australian phone number (e.g. 0412345678 or +61412345678)."));
    }
    const SETTINGS_VALID_TRADES = new Set(["plumber","electrician","roofer","handyman","painter","carpenter","tiler","builder","other"]);
    if (b.trade_type && !SETTINGS_VALID_TRADES.has(b.trade_type)) {
      return res.send(settingsPage(tenant, "Please select a valid trade type."));
    }
    updateTenant(db, tenant.tenant_id, {
      name: b.name,
      trade_type: b.trade_type || tenant.trade_type,
      ai_name: b.ai_name || tenant.ai_name,
      owner_phone: b.owner_phone,
      service_area: b.service_area || null,
      custom_instructions: b.custom_instructions || null,
      enable_warm_transfer: b.enable_warm_transfer ? 1 : 0,
      vacation_mode: b.vacation_mode ? 1 : 0,
      vacation_message: b.vacation_message || null,
      business_hours_start: b.business_hours_start || tenant.business_hours_start,
      business_hours_end: b.business_hours_end || tenant.business_hours_end,
    });
    res.redirect("/dashboard/settings?flash=✓ Settings saved");
  });

  app.get("/dashboard/leads/export.csv", dashAuth, trialGuard, (req, res) => {
    const tenant: TenantRow = (req as any).dashTenant;
    const urgency = typeof req.query.urgency === "string" ? req.query.urgency : undefined;
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const search = typeof req.query.search === "string" ? req.query.search : undefined;
    const leads = listLeadsForTenant(db, tenant.tenant_id, { urgency, status, search, limit: 10000 });
    const csv = leadsToCSV(leads);
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="jobs-${Date.now()}.csv"`);
    res.send(csv);
  });

  app.get("/dashboard/stats", dashAuth, trialGuard, (req, res) => {
    const tenant: TenantRow = (req as any).dashTenant;
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const monthAgo = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const callsThisWeek = db.get<{ c: number }>(
      "SELECT COUNT(*) as c FROM calls WHERE tenant_id = ? AND started_at >= ?", [tenant.tenant_id, weekAgo]
    )?.c ?? 0;
    const callsThisMonth = db.get<{ c: number }>(
      "SELECT COUNT(*) as c FROM calls WHERE tenant_id = ? AND started_at >= ?", [tenant.tenant_id, monthAgo]
    )?.c ?? 0;
    const leadsThisWeek = db.get<{ c: number }>(
      "SELECT COUNT(*) as c FROM leads WHERE tenant_id = ? AND created_at >= ?", [tenant.tenant_id, weekAgo]
    )?.c ?? 0;
    const leadsThisMonth = db.get<{ c: number }>(
      "SELECT COUNT(*) as c FROM leads WHERE tenant_id = ? AND created_at >= ?", [tenant.tenant_id, monthAgo]
    )?.c ?? 0;
    const totalCalls = db.get<{ c: number }>(
      "SELECT COUNT(*) as c FROM calls WHERE tenant_id = ?", [tenant.tenant_id]
    )?.c ?? 0;
    const totalLeads = db.get<{ c: number }>(
      "SELECT COUNT(*) as c FROM leads WHERE tenant_id = ?", [tenant.tenant_id]
    )?.c ?? 0;
    const totalJobValue = db.get<{ s: number | null }>(
      "SELECT SUM(job_value) as s FROM leads WHERE tenant_id = ? AND job_value IS NOT NULL", [tenant.tenant_id]
    )?.s ?? 0;

    const tz = tenant.timezone || "Australia/Sydney";
    const fmtShort = (d: Date) => d.toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: tz });
    const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const weekLabel = `${fmtShort(weekStart)} – ${fmtShort(now)}`;
    const monthLabel = `${fmtShort(monthStart)} – ${fmtShort(now)}`;

    res.send(statsPage(tenant, {
      callsThisWeek, callsThisMonth, leadsThisWeek, leadsThisMonth,
      totalCalls, totalLeads, totalJobValue, weekLabel, monthLabel
    }));
  });

  app.get("/dashboard/leads", dashAuth, trialGuard, (req, res) => {
    const tenant: TenantRow = (req as any).dashTenant;
    const urgency = typeof req.query.urgency === "string" && req.query.urgency ? req.query.urgency : undefined;
    const status = typeof req.query.status === "string" && req.query.status ? req.query.status : undefined;
    const search = typeof req.query.search === "string" && req.query.search ? req.query.search : undefined;
    const leads = listLeadsForTenant(db, tenant.tenant_id, { urgency, status, search });
    const stats = getTenantLeadStats(db, tenant.tenant_id);
    res.send(leadsPage(tenant, leads, { urgency, status, search }, stats));
  });

  app.get("/dashboard/leads/:id", dashAuth, trialGuard, (req, res) => {
    const tenant: TenantRow = (req as any).dashTenant;
    const lead = getLeadWithCall(db, req.params.id, tenant.tenant_id);
    if (!lead) return res.status(404).send("Job not found");
    const flash = typeof req.query.flash === "string" ? req.query.flash : undefined;

    // Check for duplicate jobs from the same caller in the last 7 days
    let duplicateWarning: string | undefined;
    const callerPhone = lead.phone || lead.from_number;
    if (callerPhone) {
      const dupes = db.all<{ lead_id: string; created_at: string }>(
        `SELECT l.lead_id, l.created_at FROM leads l
         JOIN calls c ON l.call_id = c.call_id
         WHERE c.from_number = ? AND l.tenant_id = ? AND l.lead_id != ? AND l.created_at >= ?
         ORDER BY l.created_at DESC LIMIT 5`,
        [callerPhone, tenant.tenant_id, req.params.id,
         new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()]
      );
      if (dupes.length > 0) {
        duplicateWarning = `This caller has ${dupes.length} other job(s) in the past 7 days. <a href="/dashboard/leads?search=${encodeURIComponent(callerPhone)}">View all →</a>`;
      }
    }

    res.send(leadDetailPage(tenant, lead, flash, duplicateWarning));
  });

  app.post("/dashboard/leads/:id/status", dashAuth, trialGuard,
    express.urlencoded({ extended: false }),
    (req, res) => {
      const tenant: TenantRow = (req as any).dashTenant;
      const lead = getLeadWithCall(db, req.params.id, tenant.tenant_id);
      if (!lead) return res.status(404).send("Job not found");
      const newStatus = req.body?.status;
      const allowed = ["new", "handled", "booked", "called_back"];
      if (!allowed.includes(newStatus)) return res.status(400).send("Invalid status");
      updateLeadStatus(db, req.params.id, newStatus);
      res.redirect(`/dashboard/leads/${req.params.id}?flash=Status+updated`);
    }
  );

  // Update job value (ROI tracking)
  app.post("/dashboard/leads/:id/job-value", dashAuth, trialGuard,
    express.urlencoded({ extended: false }),
    (req, res) => {
      const tenant: TenantRow = (req as any).dashTenant;
      const lead = getLeadWithCall(db, req.params.id, tenant.tenant_id);
      if (!lead) return res.status(404).send("Job not found");
      const rawValue = req.body?.job_value;
      const jobValue = rawValue ? parseFloat(rawValue) : null;
      if (jobValue !== null && (!Number.isFinite(jobValue) || jobValue < 0)) {
        return res.redirect(`/dashboard/leads/${req.params.id}?flash=Invalid+job+value`);
      }
      db.run("UPDATE leads SET job_value = ? WHERE lead_id = ? AND tenant_id = ?", [jobValue, req.params.id, tenant.tenant_id]);
      trackEvent("job_value_updated", {
        tenant_id: tenant.tenant_id,
        call_id: lead.call_id,
        payload: { job_value: jobValue }
      });
      res.redirect(`/dashboard/leads/${req.params.id}?flash=Job+value+saved`);
    }
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // DEBUG routes (admin-only)
  // ═══════════════════════════════════════════════════════════════════════════

  app.use("/debug", adminGuard);

  app.get("/debug/calls/:callId", (req, res) => {
    const lead = getLatestLeadForCall(db, req.params.callId);
    res.json({ lead });
  });

  app.get("/debug/notifications/:callId", (req, res) => {
    const notifications = listNotificationsForCall(db, req.params.callId);
    res.json({ notifications });
  });

  app.get("/debug/analytics", (req, res) => {
    const tenantId = typeof req.query.tenant_id === "string" ? req.query.tenant_id : undefined;
    const callId = typeof req.query.call_id === "string" ? req.query.call_id : undefined;
    const limit = typeof req.query.limit === "string" ? Number(req.query.limit) : undefined;
    const events = listAnalyticsEvents(db, { tenant_id: tenantId, call_id: callId, limit });
    res.json({ events });
  });

  app.get("/debug/tenants", (req, res) => {
    const tenants = listTenants(db).map(({ password_hash, session_token, ...t }) => t);
    res.json({ tenants });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Onboarding nudge SMS scheduler
  // Sends reminders to tenants who signed up but haven't activated call forwarding.
  // ═══════════════════════════════════════════════════════════════════════════

  const HOUR = 60 * 60 * 1000;
  const DAY = 24 * HOUR;

  const nudgeMessages = [
    {
      minAge: 1 * HOUR,
      maxAge: 2 * HOUR,
      configKey: "nudge_1h",
      message: (t: TenantRow) => {
        const code = !t.twilio_number.startsWith("+PENDING")
          ? `\n\nJust dial this from your phone:\n${generateForwardingCode(t.twilio_number)}\nThen press Call.`
          : "";
        return `Hey ${t.name} - did you get a chance to set up call forwarding?${code}\n\nOnce it's on, every missed call gets answered automatically and you'll get a text with the details. Takes 2 minutes!\n\nQuestions? Just reply to this text.`;
      }
    },
    {
      minAge: 1 * DAY,
      maxAge: 1.5 * DAY,
      configKey: "nudge_24h",
      message: (t: TenantRow) =>
        `Your AI receptionist is ready and waiting, ${t.name}! You're 2 minutes away from never missing a call again.\n\nSet up guide: ${env.PUBLIC_BASE_URL}/dashboard/welcome\n\nNeed a hand? Reply here or call us.`
    },
    {
      minAge: 3 * DAY,
      maxAge: 3.5 * DAY,
      configKey: "nudge_72h",
      message: (t: TenantRow) =>
        `Hi ${t.name} - you've been on your free trial for 3 days but your AI receptionist isn't active yet. Every missed call is a potential job lost!\n\nWant us to help you set it up? Just reply "HELP" and we'll sort it out for you.`
    }
  ];

  async function runOnboardingNudges() {
    for (const nudge of nudgeMessages) {
      try {
        const tenants = getTenantsNeedingNudge(db, nudge.minAge, nudge.maxAge);
        for (const t of tenants) {
          const sentKey = `${nudge.configKey}:${t.tenant_id}`;
          if (getSystemConfig(db, sentKey)) continue;
          try {
            const smsResult = await sendOwnerSms(db, nudge.message(t), t.owner_phone);
            if (smsResult.status === "sent") {
              setSystemConfig(db, sentKey, new Date().toISOString());
              trackEvent("onboarding_nudge_sent", { tenant_id: t.tenant_id, payload: { nudge: nudge.configKey } });
              log.info({ tenantId: t.tenant_id, nudge: nudge.configKey }, "Onboarding nudge SMS sent");
            } else {
              log.warn({ tenantId: t.tenant_id, nudge: nudge.configKey, reason: smsResult.reason }, "Onboarding nudge SMS skipped — will retry");
            }
          } catch (e) {
            log.warn({ e, tenantId: t.tenant_id }, "Onboarding nudge SMS failed");
          }
        }
      } catch (e) {
        log.warn({ e }, "Onboarding nudge check failed");
      }
    }
  }

  setInterval(runOnboardingNudges, 30 * 60 * 1000).unref();
  setTimeout(runOnboardingNudges, 60_000).unref();

  // ═══════════════════════════════════════════════════════════════════════════
  // HTTP server + WebSocket server (Twilio Media Streams)
  // ═══════════════════════════════════════════════════════════════════════════

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: "/media-stream" });

  wss.on("connection", (twilioWs, _req) => {
    log.info("Twilio media stream WebSocket connected");

    let callSid: string | null = null;
    let session: RealtimeSession | null = null;

    twilioWs.on("message", (raw) => {
      const msg = raw.toString();

      if (!session) {
        let data: any;
        try { data = JSON.parse(msg); } catch { return; }

        if (data.event === "start") {
          const streamToken = data.start?.customParameters?.streamToken ?? null;
          if (!streamToken || !streamTokens.has(streamToken)) {
            log.warn("media-stream connection rejected: invalid or missing stream token");
            twilioWs.close();
            return;
          }
          streamTokens.delete(streamToken);

          callSid =
            data.start?.customParameters?.callSid ??
            data.start?.callSid ??
            null;

          if (!callSid) {
            log.warn("media-stream start event missing callSid");
            twilioWs.close();
            return;
          }

          const state = getOrInitCallState(callSid);
          const fromNumber = state.lead.phone ?? null;
          const tenantId = state.tenantId ?? null;
          const ownerPhone: string | undefined = state.tenantOwnerPhone ?? undefined;
          const ownerEmail: string | undefined = state.tenantOwnerEmail ?? undefined;
          const isDemo: boolean = state.isDemo === true;

          // Resolve the tenant for this call
          const tenant: TenantRow =
            (tenantId ? getTenantById(db, tenantId) : null) ?? buildFallbackTenant();

          if (!env.OPENAI_API_KEY) {
            log.warn({ callSid }, "OPENAI_API_KEY not set — redirecting media-stream call to voicemail");
            trackEvent("ai_unavailable_voicemail_redirect", {
              tenant_id: tenant.tenant_id !== "default" ? tenant.tenant_id : null,
              call_id: callSid,
              level: "warn"
            });
            const recordingCallbackUrl = buildAbsoluteUrl("/twilio/voice/recording");
            const twiml = voicemailFallbackTwiml(tenant.name, recordingCallbackUrl);
            import("./twilio/client.js").then(({ twilioClient }) => {
              twilioClient.calls(callSid!).update({ twiml }).catch((err: any) =>
                log.error({ err, callSid }, "failed to redirect call to voicemail (no API key)")
              );
            });
            twilioWs.close();
            return;
          }

          session = new RealtimeSession({
            twilioWs,
            callSid,
            fromNumber,
            callerHistory: state.callerHistory,
            tenant,
            isDemo,
            callbacks: {
              onLeadUpdate: (patch) => {
                const s = getOrInitCallState(callSid!);
                for (const [k, v] of Object.entries(patch)) {
                  if (v !== null && v !== undefined && v !== "") {
                    (s.lead as any)[k] = v;
                  }
                }
                if (patch.caller_intent) s.callerIntent = patch.caller_intent;
                setCallState(callSid!, s);

                upsertLead(db, {
                  lead_id: callSid!,
                  tenant_id: tenant.tenant_id !== "default" ? tenant.tenant_id : null,
                  call_id: callSid!,
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
                  job_value: s.lead.job_value ?? null
                });

                if (env.STORE_FULL_TRANSCRIPT) {
                  appendTranscript(db, callSid!, `[lead] ${JSON.stringify(patch)}`);
                }

                log.info({ callSid, patch }, "lead updated");
              },

              onEndCall: (reason) => {
                const s = getOrInitCallState(callSid!);
                upsertCall(db, {
                  call_id: callSid!,
                  status: "completed",
                  ended_at: new Date().toISOString()
                });

                if (!getLatestLeadForCall(db, callSid!)) {
                  upsertLead(db, {
                    lead_id: callSid!,
                    tenant_id: tenant.tenant_id !== "default" ? tenant.tenant_id : null,
                    call_id: callSid!,
                    name: s.lead.name ?? null,
                    phone: s.lead.phone ?? fromNumber ?? null,
                    address: null,
                    issue_type: null,
                    issue_summary: "Call ended without details - check recording",
                    urgency_level: null,
                    preferred_time: null,
                    notes: null,
                    confidence: null,
                    next_action: null,
                    job_value: null,
                    property_type: null,
                    caller_sentiment: null,
                    lead_status: "new"
                  });
                  log.info({ callSid }, "created fallback lead — save_lead was never called");
                }

                notifyOwnerSmsIfNeeded(callSid!, s.callerIntent, ownerPhone, ownerEmail).catch((err) =>
                  log.warn({ err }, "owner sms on end_call failed")
                );

                // Send confirmation SMS to caller if we captured their number
                // Skip for noise intents (wrong number, spam, silent, abusive)
                const callerPhone = s.lead.phone ?? null;
                const shouldConfirmCaller = callerPhone
                  && callerPhone.trim()
                  && !callerPhone.startsWith("+PENDING_")
                  && !isDemo
                  && s.callerIntent
                  && !NO_SMS_INTENTS.has(s.callerIntent);
                if (shouldConfirmCaller && callerPhone) {
                  const callerSmsBody = buildCallerConfirmationSms({
                    businessName: tenant.name,
                    callerName: s.lead.name,
                    issueType: s.lead.issue_type,
                    issueSummary: s.lead.issue_summary,
                    urgencyLevel: s.lead.urgency_level,
                    businessHoursStart: tenant.business_hours_start,
                    businessHoursEnd: tenant.business_hours_end,
                    timezone: tenant.timezone,
                    vacationMode: !!tenant.vacation_mode,
                    tradeType: tenant.trade_type
                  });
                  sendOwnerSms(db, callerSmsBody, callerPhone)
                    .catch((err) => log.warn({ err }, "caller confirmation SMS failed"));
                }

                trackEvent("call_ended_ai_end_call", {
                  tenant_id: tenant.tenant_id !== "default" ? tenant.tenant_id : null,
                  call_id: callSid!,
                  payload: { reason, callerIntent: s.callerIntent }
                });
                log.info({ callSid, reason }, "AI requested end_call");

                // Signal the SSE stream to close (demo calls only).
                if (isDemo) {
                  setTimeout(() => demoAudioEmitter.emit(`end:${tenant.tenant_id}`), 1500);
                }

                import("./twilio/client.js").then(({ twilioClient }) => {
                  twilioClient.calls(callSid!).update({ status: "completed" }).catch((err: any) =>
                    log.warn({ err }, "failed to hang up call via REST")
                  );
                });
              },

              onError: (err) => {
                log.error({ callSid, err }, "RealtimeSession error");
                trackEvent("realtime_session_error", {
                  tenant_id: tenant.tenant_id !== "default" ? tenant.tenant_id : null,
                  call_id: callSid!,
                  level: "error",
                  payload: { message: err?.message ?? String(err) }
                });
              },

              onFallbackToVoicemail: () => {
                log.warn({ callSid }, "AI unavailable — redirecting call to voicemail");
                trackEvent("ai_failure_voicemail_redirect", {
                  tenant_id: tenant.tenant_id !== "default" ? tenant.tenant_id : null,
                  call_id: callSid!,
                  level: "warn"
                });
                const recordingCallbackUrl = buildAbsoluteUrl("/twilio/voice/recording");
                const twiml = voicemailFallbackTwiml(tenant.name, recordingCallbackUrl);
                import("./twilio/client.js").then(({ twilioClient }) => {
                  twilioClient.calls(callSid!).update({ twiml }).catch((err: any) =>
                    log.error({ err, callSid }, "failed to redirect call to voicemail")
                  );
                });
              },

              onLifecycleEvent: (event, payload) => {
                const isWarning = event === "end_call_missing_timeout" || event === "end_call_fallback_timeout";
                if (isWarning) {
                  log.warn({ callSid, event, ...payload }, "realtime session lifecycle warning");
                } else {
                  log.info({ callSid, event, ...payload }, "realtime session lifecycle event");
                }
                trackEvent(event, {
                  tenant_id: tenant.tenant_id !== "default" ? tenant.tenant_id : null,
                  call_id: callSid!,
                  level: isWarning ? "warn" : "info",
                  payload
                });
                if (env.STORE_FULL_TRANSCRIPT) {
                  appendTranscript(db, callSid!, `[event] ${event} ${JSON.stringify(payload ?? {})}`);
                }
              },

              // Live-stream AI audio to the dashboard browser for demo calls.
              onAudioChunk: isDemo ? (chunk: string) => {
                demoAudioEmitter.emit(`audio:${tenant.tenant_id}`, chunk);
              } : undefined,

              // Live-stream caller audio (Polly's voice) so the browser hears
              // both sides of the conversation.
              onCallerAudioChunk: isDemo ? (chunk: string) => {
                demoAudioEmitter.emit(`audio:${tenant.tenant_id}`, chunk);
              } : undefined,
            }
          });

          session.handleTwilioMessage(msg);
        }
        return;
      }

      session.handleTwilioMessage(msg);
    });

    twilioWs.on("close", () => {
      log.info({ callSid }, "Twilio WebSocket closed");
      session?.cleanup();
    });

    twilioWs.on("error", (err) => {
      log.warn({ callSid, err }, "Twilio WebSocket error");
      session?.cleanup();
    });
  });

  server.listen(env.PORT, () => {
    log.info({ port: env.PORT }, "server listening");
  });
}

main().catch((err) => {
  log.error({ err }, "fatal");
  process.exit(1);
});
