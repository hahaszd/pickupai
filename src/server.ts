import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import type { NextFunction, Request, Response } from "express";
import { WebSocketServer } from "ws";
import pino from "pino";
import pinoHttp from "pino-http";

import { env } from "./env.js";
import { openDb } from "./db/db.js";
import {
  appendTranscript,
  claimDemoNumber,
  createNotification,
  createTenant,
  deleteTenant,
  getActiveDemoSession,
  getLatestLeadForCall,
  getLeadHistoryByPhone,
  getLeadWithCall,
  getNotificationStatus,
  getTenantById,
  getTenantByNumber,
  getTenantBySessionToken,
  getDemoTenantByNumber,
  listLeadsForTenant,
  listNotificationsForCall,
  listTenants,
  markNotification,
  tenantLogin,
  tenantLogout,
  updateLeadStatus,
  updateTenant,
  upsertCall,
  upsertLead
} from "./db/repo.js";
import type { TenantRow } from "./db/repo.js";
import { twilioValidateMiddleware } from "./twilio/verify.js";
import { buildAbsoluteUrl, getCallSid, shouldWarmTransferNow } from "./twilio/flow.js";
import { newVoiceResponse, connectStreamTwiml, sayFriendly } from "./twilio/twiml.js";
import { getOrInitCallState, setCallState, clearCallState } from "./twilio/state.js";
import { startCallRecording } from "./twilio/recording.js";
import { formatOwnerSms, NO_SMS_INTENTS, sendOwnerSms } from "./twilio/sms.js";
import { createCrmExporters, exportLeadToCrm } from "./crm/index.js";
import { RealtimeSession } from "./realtime/session.js";
import { loginPage, signupPage, setupGuidePage, welcomePage, leadsPage, leadDetailPage } from "./dashboard/pages.js";

const log = pino({ level: "info" });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, "../public");

// ─── Cookie helpers (no extra deps needed) ───────────────────────────────────

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
    `dash_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/dashboard; Max-Age=${60 * 60 * 24 * 30}`
  );
}

function clearSessionCookie(res: Response) {
  res.setHeader("Set-Cookie", "dash_session=; HttpOnly; Path=/dashboard; Max-Age=0");
}

// ─── CSV export helper ────────────────────────────────────────────────────────

function leadsToCSV(leads: any[]): string {
  const headers = ["name", "phone", "address", "issue_type", "issue_summary", "urgency_level", "preferred_time", "lead_status", "next_action", "created_at"];
  const rows = leads.map((l) =>
    headers.map((h) => `"${String(l[h] ?? "").replace(/"/g, '""')}"`).join(",")
  );
  return [headers.join(","), ...rows].join("\n");
}

// ─── Seed default tenant from env vars ───────────────────────────────────────

function seedDefaultTenant(db: any) {
  const existing = listTenants(db);
  if (existing.length > 0) return;
  if (!env.TWILIO_VOICE_NUMBER) return;

  log.info("No tenants found — seeding default tenant from env vars");
  try {
    createTenant(db, {
      name: "My Tradie Business",
      trade_type: "tradie",
      ai_name: "Olivia",
      twilio_number: env.TWILIO_VOICE_NUMBER,
      owner_phone: env.OWNER_PHONE_NUMBER || "",
      owner_email: env.SEED_EMAIL ?? "owner@example.com",
      password: env.SEED_PASSWORD ?? "changeme123"
    });
    log.info(
      { number: env.TWILIO_VOICE_NUMBER, email: env.SEED_EMAIL ?? "owner@example.com" },
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
    twilio_number: env.TWILIO_VOICE_NUMBER ?? "",
    owner_phone: env.OWNER_PHONE_NUMBER ?? "",
    owner_email: null,
    password_hash: null,
    session_token: null,
    business_hours_start: env.BUSINESS_HOURS_START,
    business_hours_end: env.BUSINESS_HOURS_END,
    timezone: env.BUSINESS_TIMEZONE,
    enable_warm_transfer: env.ENABLE_WARM_TRANSFER ? 1 : 0,
    service_area: null,
    active: 1,
    created_at: new Date().toISOString()
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const db = await openDb(env.SQLITE_PATH);
  seedDefaultTenant(db);

  const app = express();
  const crmExporters = createCrmExporters();

  if (crmExporters.length > 0) {
    log.info({ destinations: crmExporters.map((e) => e.destination) }, "crm exporters enabled");
  }

  // ── Notification helper ───────────────────────────────────────────────────

  async function notifyOwnerSmsIfNeeded(
    callId: string,
    callerIntent?: string | null,
    ownerPhone?: string
  ) {
    if (callerIntent && NO_SMS_INTENTS.has(callerIntent)) {
      log.info({ callId, callerIntent }, "skipping owner SMS for non-actionable call type");
      return;
    }
    const existing = getNotificationStatus(db, callId, "sms");
    if (existing?.status === "sent") return;
    const lead = getLatestLeadForCall(db, callId);
    if (!lead) return;

    exportLeadToCrm(crmExporters, lead)
      .then((results) => {
        const errors = results.filter((r) => !r.ok);
        if (errors.length) log.warn({ errors }, "crm export errors");
      })
      .catch((err) => log.warn({ err }, "crm export failed"));

    const id = createNotification(db, callId, "sms");
    try {
      const body = formatOwnerSms({ lead, callId, callerIntent });
      await sendOwnerSms(body, ownerPhone);
      markNotification(db, id, { status: "sent" });
    } catch (err: any) {
      markNotification(db, id, { status: "error", error: err?.message ?? String(err) });
    }
  }

  // ── Middleware ────────────────────────────────────────────────────────────

  app.use(
    express.urlencoded({
      extended: false,
      verify: (req, _res, buf) => { (req as any).rawBody = buf.toString("utf8"); }
    })
  );
  app.use(express.json());
  app.use(pinoHttp({ logger: log }));

  // Serve landing page from /public
  app.use(express.static(PUBLIC_DIR));

  const twilioVerify = twilioValidateMiddleware({
    authToken: env.TWILIO_AUTH_TOKEN,
    enabled: env.TWILIO_VALIDATE_SIGNATURE,
    publicBaseUrl: env.PUBLIC_BASE_URL
  });

  // ── Admin guard ───────────────────────────────────────────────────────────

  const adminGuard = (req: Request, res: Response, next: NextFunction) => {
    if (!env.ADMIN_TOKEN) return next();
    const token = req.header("x-admin-token") ?? req.query.token;
    if (token && token === env.ADMIN_TOKEN) return next();
    return res.status(401).json({ error: "unauthorized" });
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

  // ── Health ────────────────────────────────────────────────────────────────

  app.get("/health", (_req, res) => res.json({ ok: true, mode: "realtime", multiTenant: true }));

  // ═══════════════════════════════════════════════════════════════════════════
  // TWILIO WEBHOOKS
  // ═══════════════════════════════════════════════════════════════════════════

  app.post("/twilio/voice/incoming", twilioVerify, (req, res) => {
    const callSid = getCallSid(req);
    const from = req.body?.From ?? null;
    const to = req.body?.To ?? null;

    // Look up tenant by the dialled (To) number; fall back to demo pool, then fallback.
    const tenantByNumber = typeof to === "string" ? getTenantByNumber(db, to) : null;
    const demoTenant = tenantByNumber ? null : (typeof to === "string" ? getDemoTenantByNumber(db, to) : null);
    const tenant: TenantRow = tenantByNumber ?? demoTenant ?? buildFallbackTenant();
    const isDemo = !!demoTenant;

    if (tenant.tenant_id === "default" && typeof to === "string") {
      log.warn({ to }, "No tenant found for number — using fallback tenant");
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
    // Store tenant context in call state for media-stream handler
    (state as any).tenantId = tenant.tenant_id;
    (state as any).tenantOwnerPhone = tenant.owner_phone;
    (state as any).isDemo = isDemo;
    setCallState(callSid, state);

    upsertCall(db, {
      call_id: callSid,
      tenant_id: tenant.tenant_id !== "default" ? tenant.tenant_id : null,
      from_number: typeof from === "string" ? from : null,
      to_number: typeof to === "string" ? to : null,
      started_at: new Date().toISOString(),
      status: "in-progress"
    });

    startCallRecording(callSid).catch((err) => log.warn({ err }, "start recording failed"));

    if (shouldWarmTransferNow() && tenant.enable_warm_transfer) {
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
        tenant.owner_phone || env.OWNER_PHONE_NUMBER
      );
      return res.type("text/xml").send(vr.toString());
    }

    const wsUrl = buildAbsoluteUrl("/media-stream").replace(/^https?:\/\//, "wss://");
    const twiml = connectStreamTwiml(wsUrl, callSid);
    res.type("text/xml").send(twiml);
  });

  app.post("/twilio/voice/transfer-fallback", twilioVerify, (req, res) => {
    const callSid = getCallSid(req);
    const wsUrl = buildAbsoluteUrl("/media-stream").replace(/^https?:\/\//, "wss://");
    const twiml = connectStreamTwiml(wsUrl, callSid);
    res.type("text/xml").send(twiml);
  });

  app.post("/twilio/voice/status", twilioVerify, (req, res) => {
    const callSid = typeof req.body?.CallSid === "string" ? req.body.CallSid : null;
    const callStatus = typeof req.body?.CallStatus === "string" ? req.body.CallStatus : null;
    if (callSid) {
      upsertCall(db, {
        call_id: callSid,
        status: callStatus ?? undefined,
        ended_at: callStatus === "completed" ? new Date().toISOString() : undefined
      });
      if (callStatus === "completed") {
        const state = getOrInitCallState(callSid);
        const ownerPhone = (state as any).tenantOwnerPhone ?? undefined;
        notifyOwnerSmsIfNeeded(callSid, state.callerIntent, ownerPhone).catch((err) =>
          log.warn({ err }, "owner sms on status failed")
        );
        clearCallState(callSid);
      }
    }
    res.sendStatus(200);
  });

  app.post("/twilio/voice/recording", twilioVerify, (req, res) => {
    const callSid = typeof req.body?.CallSid === "string" ? req.body.CallSid : null;
    const recordingSid = typeof req.body?.RecordingSid === "string" ? req.body.RecordingSid : null;
    const recordingUrl = typeof req.body?.RecordingUrl === "string" ? req.body.RecordingUrl : null;
    if (callSid) {
      upsertCall(db, {
        call_id: callSid,
        recording_sid: recordingSid ?? undefined,
        recording_url: recordingUrl ? `${recordingUrl}.mp3` : undefined
      });
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
    updateTenant(db, req.params.id, req.body ?? {});
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

  // ═══════════════════════════════════════════════════════════════════════════
  // OWNER DASHBOARD
  // ═══════════════════════════════════════════════════════════════════════════

  app.get("/dashboard/login", (req, res) => {
    const cookies = parseCookies(req);
    if (cookies.dash_session && getTenantBySessionToken(db, cookies.dash_session)) {
      return res.redirect("/dashboard/leads");
    }
    res.send(loginPage());
  });

  app.post("/dashboard/login", express.urlencoded({ extended: false }), (req, res) => {
    const { email, password } = req.body ?? {};
    if (!email || !password) return res.send(loginPage("Email and password are required."));
    const tenant = tenantLogin(db, email as string, password as string);
    if (!tenant || !tenant.session_token) {
      return res.send(loginPage("Invalid email or password."));
    }
    setSessionCookie(res, tenant.session_token);
    res.redirect("/dashboard/leads");
  });

  app.get("/dashboard/logout", (req, res) => {
    const cookies = parseCookies(req);
    const token = cookies.dash_session;
    if (token) {
      const tenant = getTenantBySessionToken(db, token);
      if (tenant) tenantLogout(db, tenant.tenant_id);
    }
    clearSessionCookie(res);
    res.redirect("/dashboard/login");
  });

  app.get("/dashboard/signup", (req, res) => {
    const cookies = parseCookies(req);
    if (cookies.dash_session && getTenantBySessionToken(db, cookies.dash_session)) {
      return res.redirect("/dashboard/leads");
    }
    res.send(signupPage());
  });

  app.post("/dashboard/signup", express.urlencoded({ extended: false }), (req, res) => {
    const { name, trade_type, ai_name, owner_phone, email, password } = req.body ?? {};
    const prefill = { name, trade_type, ai_name, owner_phone, email };

    if (!name || !trade_type || !owner_phone || !email || !password) {
      return res.send(signupPage("All required fields must be filled in.", prefill));
    }
    if (typeof password === "string" && password.length < 8) {
      return res.send(signupPage("Password must be at least 8 characters.", prefill));
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.send(signupPage("Please enter a valid email address.", prefill));
    }

    // Check if email already in use
    const existing = listTenants(db).find(t => t.owner_email?.toLowerCase() === (email as string).toLowerCase());
    if (existing) {
      return res.send(signupPage("An account with that email already exists. Please sign in.", prefill));
    }

    const pendingNumber = `+PENDING_${Math.floor(100000 + Math.random() * 900000)}`;
    const tenant = createTenant(db, {
      name: name as string,
      trade_type: trade_type as string,
      ai_name: ai_name || "Olivia",
      twilio_number: pendingNumber,
      owner_phone: owner_phone as string,
      owner_email: email as string,
      password: password as string,
    });

    const loggedIn = tenantLogin(db, email as string, password as string);
    if (loggedIn?.session_token) {
      setSessionCookie(res, loggedIn.session_token);
    }

    res.redirect("/dashboard/welcome");
  });

  app.get("/dashboard/setup-guide", dashAuth, (req, res) => {
    const tenant: TenantRow = (req as any).dashTenant;
    res.send(setupGuidePage(tenant));
  });

  // ── Welcome / demo routes ─────────────────────────────────────────────────

  app.get("/dashboard/welcome", dashAuth, (req, res) => {
    const tenant: TenantRow = (req as any).dashTenant;
    const poolNumbers = env.DEMO_POOL_NUMBERS
      ? env.DEMO_POOL_NUMBERS.split(",").map((n) => n.trim()).filter(Boolean)
      : [];
    const session = poolNumbers.length ? getActiveDemoSession(db, tenant.tenant_id) : null;
    res.send(welcomePage(tenant, {
      demoNumber: session?.demo_number ?? null,
      demoExpiresAt: session?.expires_at ?? null,
    }));
  });

  app.post("/dashboard/request-demo", dashAuth, express.urlencoded({ extended: false }), (req, res) => {
    const tenant: TenantRow = (req as any).dashTenant;
    const poolNumbers = env.DEMO_POOL_NUMBERS
      ? env.DEMO_POOL_NUMBERS.split(",").map((n) => n.trim()).filter(Boolean)
      : [];

    if (poolNumbers.length === 0) {
      return res.send(welcomePage(tenant, { error: "Demo numbers are not configured yet. Please contact support." }));
    }

    const claimed = claimDemoNumber(db, tenant.tenant_id, poolNumbers);
    if (!claimed) {
      return res.send(welcomePage(tenant, { error: "All demo slots are busy right now — please try again in a few minutes." }));
    }

    const session = getActiveDemoSession(db, tenant.tenant_id);
    res.send(welcomePage(tenant, {
      demoNumber: claimed,
      demoExpiresAt: session?.expires_at ?? null,
    }));
  });

  app.post("/dashboard/simulate-demo-call", dashAuth, express.urlencoded({ extended: false }), async (req, res) => {
    const tenant: TenantRow = (req as any).dashTenant;
    const poolNumbers = env.DEMO_POOL_NUMBERS
      ? env.DEMO_POOL_NUMBERS.split(",").map((n) => n.trim()).filter(Boolean)
      : [];

    if (poolNumbers.length === 0) {
      return res.send(welcomePage(tenant, { error: "Demo numbers are not configured yet. Please contact support." }));
    }

    const claimed = claimDemoNumber(db, tenant.tenant_id, poolNumbers);
    if (!claimed) {
      return res.send(welcomePage(tenant, { error: "All demo slots are busy right now — please try again in a few minutes." }));
    }

    try {
      const { twilioClient } = await import("./twilio/client.js");
      const callerScriptUrl = `${env.PUBLIC_BASE_URL}/twilio/demo/caller-script?trade_type=${encodeURIComponent(tenant.trade_type)}`;
      await twilioClient.calls.create({
        to: claimed,
        from: env.TWILIO_VOICE_NUMBER,
        url: callerScriptUrl,
        statusCallback: `${env.PUBLIC_BASE_URL}/twilio/voice/status`,
        statusCallbackMethod: "POST",
      });
    } catch (err) {
      log.error({ err }, "Failed to place simulated demo call");
      return res.send(welcomePage(tenant, { error: "Could not place the demo call. Please try again or call the number yourself." }));
    }

    const session = getActiveDemoSession(db, tenant.tenant_id);
    res.send(welcomePage(tenant, {
      demoNumber: claimed,
      demoExpiresAt: session?.expires_at ?? null,
      simulationStarted: true,
    }));
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
      res.json({ status: "ready", recordingUrl: latest.recording_url });
    } else {
      res.json({ status: "pending", recordingUrl: null });
    }
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

  app.post("/twilio/demo/caller-script", (req, res) => {
    const tradeType = typeof req.query.trade_type === "string" ? req.query.trade_type : "";
    const script = DEMO_CALLER_SCRIPTS[tradeType] ?? DEFAULT_DEMO_SCRIPT;
    const vr = newVoiceResponse();
    vr.pause({ length: 4 });
    vr.say({ voice: "Polly.Matthew" }, script);
    vr.pause({ length: 25 });
    vr.say({ voice: "Polly.Matthew" }, "James Wilson.");
    vr.pause({ length: 12 });
    vr.say({ voice: "Polly.Matthew" }, "That sounds great, thanks.");
    vr.pause({ length: 10 });
    vr.hangup();
    res.type("text/xml").send(vr.toString());
  });

  app.get("/dashboard", dashAuth, (_req, res) => res.redirect("/dashboard/leads"));

  app.get("/dashboard/leads/export.csv", dashAuth, (req, res) => {
    const tenant: TenantRow = (req as any).dashTenant;
    const urgency = typeof req.query.urgency === "string" ? req.query.urgency : undefined;
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const leads = listLeadsForTenant(db, tenant.tenant_id, { urgency, status, limit: 10000 });
    const csv = leadsToCSV(leads);
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="leads-${Date.now()}.csv"`);
    res.send(csv);
  });

  app.get("/dashboard/leads", dashAuth, (req, res) => {
    const tenant: TenantRow = (req as any).dashTenant;
    const urgency = typeof req.query.urgency === "string" && req.query.urgency ? req.query.urgency : undefined;
    const status = typeof req.query.status === "string" && req.query.status ? req.query.status : undefined;
    const leads = listLeadsForTenant(db, tenant.tenant_id, { urgency, status });
    res.send(leadsPage(tenant, leads, { urgency, status }));
  });

  app.get("/dashboard/leads/:id", dashAuth, (req, res) => {
    const tenant: TenantRow = (req as any).dashTenant;
    const lead = getLeadWithCall(db, req.params.id, tenant.tenant_id);
    if (!lead) return res.status(404).send("Lead not found");
    const flash = typeof req.query.flash === "string" ? req.query.flash : undefined;
    res.send(leadDetailPage(tenant, lead, flash));
  });

  app.post("/dashboard/leads/:id/status", dashAuth,
    express.urlencoded({ extended: false }),
    (req, res) => {
      const tenant: TenantRow = (req as any).dashTenant;
      const lead = getLeadWithCall(db, req.params.id, tenant.tenant_id);
      if (!lead) return res.status(404).send("Lead not found");
      const newStatus = req.body?.status;
      const allowed = ["new", "handled", "booked", "called_back"];
      if (!allowed.includes(newStatus)) return res.status(400).send("Invalid status");
      updateLeadStatus(db, req.params.id, newStatus);
      res.redirect(`/dashboard/leads/${req.params.id}?flash=Status+updated`);
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

  app.get("/debug/tenants", (req, res) => {
    const tenants = listTenants(db).map(({ password_hash, session_token, ...t }) => t);
    res.json({ tenants });
  });

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
          const tenantId = (state as any).tenantId ?? null;
          const ownerPhone: string | undefined = (state as any).tenantOwnerPhone ?? undefined;
          const isDemo: boolean = (state as any).isDemo === true;

          // Resolve the tenant for this call
          const tenant: TenantRow =
            (tenantId ? getTenantById(db, tenantId) : null) ?? buildFallbackTenant();

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
                  lead_status: null
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
                notifyOwnerSmsIfNeeded(callSid!, s.callerIntent, ownerPhone).catch((err) =>
                  log.warn({ err }, "owner sms on end_call failed")
                );
                log.info({ callSid, reason }, "AI requested end_call");

                import("./twilio/client.js").then(({ twilioClient }) => {
                  twilioClient.calls(callSid!).update({ status: "completed" }).catch((err: any) =>
                    log.warn({ err }, "failed to hang up call via REST")
                  );
                });
              },

              onError: (err) => {
                log.error({ callSid, err }, "RealtimeSession error");
              }
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
