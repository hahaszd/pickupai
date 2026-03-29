import { randomUUID, timingSafeEqual, randomInt } from "node:crypto";
import { pbkdf2Sync, randomBytes } from "node:crypto";
import type { Db } from "./db.js";

// ─── Row types ───────────────────────────────────────────────────────────────

export type TenantRow = {
  tenant_id: string;
  name: string;
  trade_type: string;
  ai_name: string;
  twilio_number: string;
  owner_phone: string;
  owner_email: string | null;
  password_hash: string | null;
  session_token: string | null;
  business_hours_start: string;
  business_hours_end: string;
  timezone: string;
  enable_warm_transfer: number;
  service_area: string | null;
  custom_instructions: string | null;
  vacation_mode: number;
  vacation_message: string | null;
  active: number;
  created_at: string;
  last_login_at: string | null;
  payment_status: string | null;
  trial_ends_at: string | null;
  stripe_customer_id: string | null;
};

export type CallRow = {
  call_id: string;
  tenant_id: string | null;
  from_number: string | null;
  to_number: string | null;
  started_at: string | null;
  ended_at: string | null;
  status: string | null;
  recording_url: string | null;
  recording_sid: string | null;
  transcript: string | null;
  is_demo: number;
};

export type LeadRow = {
  lead_id: string;
  tenant_id: string | null;
  call_id: string;
  name: string | null;
  phone: string | null;
  address: string | null;
  issue_type: string | null;
  issue_summary: string | null;
  urgency_level: string | null;
  preferred_time: string | null;
  notes: string | null;
  confidence: number | null;
  next_action: string | null;
  lead_status: string | null;
  job_value: number | null;
  property_type: string | null;
  caller_sentiment: string | null;
  created_at: string;
};

// ─── Password helpers ─────────────────────────────────────────────────────────

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = pbkdf2Sync(password, salt, 100_000, 64, "sha512").toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const check = pbkdf2Sync(password, salt, 100_000, 64, "sha512").toString("hex");
  if (check.length !== hash.length) return false;
  return timingSafeEqual(Buffer.from(check, "hex"), Buffer.from(hash, "hex"));
}

// ─── Tenant CRUD ──────────────────────────────────────────────────────────────

export function createTenant(
  db: Db,
  data: {
    name: string;
    trade_type: string;
    ai_name?: string;
    twilio_number: string;
    owner_phone: string;
    owner_email?: string;
    password?: string;
    business_hours_start?: string;
    business_hours_end?: string;
    timezone?: string;
    enable_warm_transfer?: number;
    service_area?: string;
  }
): TenantRow {
  const tenant_id = randomUUID();
  const password_hash = data.password ? hashPassword(data.password) : null;
  const now = new Date().toISOString();

  db.run(
    `INSERT INTO tenants (
      tenant_id, name, trade_type, ai_name, twilio_number, owner_phone, owner_email,
      password_hash, business_hours_start, business_hours_end, timezone,
      enable_warm_transfer, service_area, active, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
    [
      tenant_id,
      data.name,
      data.trade_type,
      data.ai_name ?? "Olivia",
      data.twilio_number,
      data.owner_phone,
      data.owner_email ?? null,
      password_hash,
      data.business_hours_start ?? "08:00",
      data.business_hours_end ?? "17:00",
      data.timezone ?? "Australia/Sydney",
      data.enable_warm_transfer ?? 0,
      data.service_area ?? null,
      now
    ]
  );

  return db.get<TenantRow>("SELECT * FROM tenants WHERE tenant_id = ?", [tenant_id])!;
}

const TENANT_UPDATABLE_COLUMNS = new Set([
  "name", "trade_type", "ai_name", "twilio_number", "owner_phone", "owner_email",
  "password_hash", "session_token", "business_hours_start", "business_hours_end",
  "timezone", "enable_warm_transfer", "service_area", "custom_instructions",
  "vacation_mode", "vacation_message", "active", "last_login_at",
  "payment_status", "trial_ends_at", "stripe_customer_id"
]);

export function updateTenant(
  db: Db,
  tenantId: string,
  patch: Partial<Omit<TenantRow, "tenant_id" | "created_at">> & { password?: string }
) {
  const { password, ...rest } = patch as any;
  if (password) rest.password_hash = hashPassword(password);
  const keys = Object.keys(rest).filter((k) => rest[k] !== undefined && TENANT_UPDATABLE_COLUMNS.has(k));
  if (keys.length === 0) return;
  const setClause = keys.map((k) => `${k} = ?`).join(", ");
  const params = [...keys.map((k) => rest[k]), tenantId];
  db.run(`UPDATE tenants SET ${setClause} WHERE tenant_id = ?`, params);
}

export function deleteTenant(db: Db, tenantId: string) {
  db.run("UPDATE calls SET tenant_id = NULL WHERE tenant_id = ?", [tenantId]);
  db.run("UPDATE leads SET tenant_id = NULL WHERE tenant_id = ?", [tenantId]);
  db.run("DELETE FROM tenants WHERE tenant_id = ?", [tenantId]);
}

export function getTenantById(db: Db, tenantId: string): TenantRow | null {
  return db.get<TenantRow>("SELECT * FROM tenants WHERE tenant_id = ?", [tenantId]) ?? null;
}

export function getTenantByNumber(db: Db, number: string): TenantRow | null {
  return (
    db.get<TenantRow>(
      "SELECT * FROM tenants WHERE twilio_number = ? AND active = 1",
      [number]
    ) ?? null
  );
}

export function getTenantBySessionToken(db: Db, token: string): TenantRow | null {
  return (
    db.get<TenantRow>(
      "SELECT * FROM tenants WHERE session_token = ? AND active = 1",
      [token]
    ) ?? null
  );
}

export function listTenants(db: Db): TenantRow[] {
  return db.all<TenantRow>("SELECT * FROM tenants ORDER BY created_at DESC");
}

export function tenantLogin(db: Db, email: string, password: string): TenantRow | null {
  const tenant = db.get<TenantRow>(
    "SELECT * FROM tenants WHERE owner_email = ? AND active = 1",
    [email]
  );
  if (!tenant || !tenant.password_hash) return null;
  if (!verifyPassword(password, tenant.password_hash)) return null;

  const token = randomUUID();
  const now = new Date().toISOString();
  db.run(
    "UPDATE tenants SET session_token = ?, last_login_at = ? WHERE tenant_id = ?",
    [token, now, tenant.tenant_id]
  );
  return { ...tenant, session_token: token, last_login_at: now };
}

export function tenantLogout(db: Db, tenantId: string) {
  db.run("UPDATE tenants SET session_token = NULL WHERE tenant_id = ?", [tenantId]);
}

// ─── Call CRUD ────────────────────────────────────────────────────────────────

const CALL_UPDATABLE_COLUMNS = new Set([
  "tenant_id", "from_number", "to_number", "started_at", "ended_at",
  "status", "recording_url", "recording_sid", "transcript", "is_demo"
]);

export function upsertCall(
  db: Db,
  row: Pick<CallRow, "call_id"> & Partial<Omit<CallRow, "call_id">>
) {
  const existing = db.get<{ call_id: string }>("SELECT call_id FROM calls WHERE call_id = ?", [
    row.call_id
  ]);

  const patchKeys = Object.keys(row).filter((k) => k !== "call_id" && (row as any)[k] !== undefined && CALL_UPDATABLE_COLUMNS.has(k));
  if (existing) {
    if (patchKeys.length === 0) return;
    const setClause = patchKeys.map((k) => `${k} = ?`).join(", ");
    const params = patchKeys.map((k) => (row as any)[k]);
    params.push(row.call_id);
    db.run(`UPDATE calls SET ${setClause} WHERE call_id = ?`, params);
    return;
  }

  db.run(
    `INSERT INTO calls (call_id, tenant_id, from_number, to_number, started_at, ended_at, status, recording_url, recording_sid, transcript, is_demo)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      row.call_id,
      row.tenant_id ?? null,
      row.from_number ?? null,
      row.to_number ?? null,
      row.started_at ?? new Date().toISOString(),
      row.ended_at ?? null,
      row.status ?? null,
      row.recording_url ?? null,
      row.recording_sid ?? null,
      row.transcript ?? "",
      row.is_demo ?? 0
    ]
  );
}

export function appendTranscript(db: Db, callId: string, text: string) {
  db.run(
    `UPDATE calls
     SET transcript = COALESCE(transcript,'') || CASE WHEN COALESCE(transcript,'')='' THEN '' ELSE '\n' END || ?
     WHERE call_id = ?`,
    [text, callId]
  );
}

// ─── Lead CRUD ────────────────────────────────────────────────────────────────

export function upsertLead(
  db: Db,
  lead: Omit<LeadRow, "created_at" | "lead_status" | "job_value" | "property_type" | "caller_sentiment"> & {
    created_at?: string;
    lead_status?: string | null;
    job_value?: number | string | null;
    property_type?: string | null;
    caller_sentiment?: string | null;
  }
) {
  const created_at = lead.created_at ?? new Date().toISOString();
  const existing = db.get<{ lead_id: string }>("SELECT lead_id FROM leads WHERE lead_id = ?", [
    lead.lead_id
  ]);

  if (existing) {
    const allFields: Array<[string, unknown]> = [
      ["tenant_id", lead.tenant_id],
      ["name", lead.name],
      ["phone", lead.phone],
      ["address", lead.address],
      ["issue_type", lead.issue_type],
      ["issue_summary", lead.issue_summary],
      ["urgency_level", lead.urgency_level],
      ["preferred_time", lead.preferred_time],
      ["notes", lead.notes],
      ["confidence", lead.confidence],
      ["next_action", lead.next_action],
      ["lead_status", lead.lead_status],
      ["job_value", lead.job_value],
      ["property_type", lead.property_type],
      ["caller_sentiment", lead.caller_sentiment],
    ];
    const updatableFields = allFields.filter(([, v]) => v !== undefined);
    if (updatableFields.length === 0) return;
    const setClause = updatableFields.map(([k]) => `${k}=?`).join(", ");
    const params = [...updatableFields.map(([, v]) => v ?? null), lead.lead_id];
    db.run(`UPDATE leads SET ${setClause} WHERE lead_id=?`, params);
    return;
  }

  db.run(
    `INSERT INTO leads (
      lead_id, tenant_id, call_id, name, phone, address, issue_type, issue_summary,
      urgency_level, preferred_time, notes, confidence, next_action, lead_status,
      job_value, property_type, caller_sentiment, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      lead.lead_id,
      lead.tenant_id ?? null,
      lead.call_id,
      lead.name ?? null,
      lead.phone ?? null,
      lead.address ?? null,
      lead.issue_type ?? null,
      lead.issue_summary ?? null,
      lead.urgency_level ?? null,
      lead.preferred_time ?? null,
      lead.notes ?? null,
      lead.confidence ?? null,
      lead.next_action ?? null,
      lead.lead_status ?? "new",
      lead.job_value ?? null,
      lead.property_type ?? null,
      lead.caller_sentiment ?? null,
      created_at
    ]
  );
}

export function updateLeadStatus(db: Db, leadId: string, status: string) {
  db.run("UPDATE leads SET lead_status = ? WHERE lead_id = ?", [status, leadId]);
}

// ─── Lead queries ─────────────────────────────────────────────────────────────

export function listLeadsForTenant(
  db: Db,
  tenantId: string,
  opts: { limit?: number; urgency?: string; status?: string; search?: string } = {}
): (LeadRow & { recording_url: string | null })[] {
  const conditions = ["l.tenant_id = ?"];
  const params: any[] = [tenantId];

  if (opts.urgency) {
    conditions.push("l.urgency_level = ?");
    params.push(opts.urgency);
  }
  if (opts.status) {
    conditions.push("l.lead_status = ?");
    params.push(opts.status);
  }
  if (opts.search) {
    conditions.push("(LOWER(l.name) LIKE LOWER(?) ESCAPE '\\' OR LOWER(l.phone) LIKE LOWER(?) ESCAPE '\\' OR LOWER(l.issue_summary) LIKE LOWER(?) ESCAPE '\\' OR LOWER(l.address) LIKE LOWER(?) ESCAPE '\\')");
    const s = `%${escapeLike(opts.search)}%`;
    params.push(s, s, s, s);
  }

  params.push(opts.limit ?? 100);

  return db.all<LeadRow & { recording_url: string | null }>(
    `SELECT l.*, c.recording_url
     FROM leads l
     LEFT JOIN calls c ON l.call_id = c.call_id
     WHERE ${conditions.join(" AND ")}
     ORDER BY
       CASE l.urgency_level WHEN 'emergency' THEN 0 WHEN 'urgent' THEN 1 ELSE 2 END,
       l.created_at DESC
     LIMIT ?`,
    params
  );
}

export function getLeadWithCall(
  db: Db,
  leadId: string,
  tenantId: string
): (LeadRow & { recording_url: string | null; transcript: string | null; from_number: string | null }) | null {
  return (
    db.get<LeadRow & { recording_url: string | null; transcript: string | null; from_number: string | null }>(
      `SELECT l.*, c.recording_url, c.transcript, c.from_number
       FROM leads l
       LEFT JOIN calls c ON l.call_id = c.call_id
       WHERE l.lead_id = ? AND l.tenant_id = ?`,
      [leadId, tenantId]
    ) ?? null
  );
}

// ─── Notification helpers ─────────────────────────────────────────────────────

export function createNotification(db: Db, callId: string, channel: string) {
  const id = randomUUID();
  db.run(
    `INSERT OR IGNORE INTO notifications (id, call_id, channel, sent_at, status, error)
     VALUES (?, ?, ?, NULL, 'pending', NULL)`,
    [id, callId, channel]
  );
  const row = db.get<{ id: string }>("SELECT id FROM notifications WHERE call_id=? AND channel=?", [
    callId,
    channel
  ]);
  return row?.id ?? id;
}

export function markNotification(
  db: Db,
  id: string,
  patch: { status: string; error?: string | null; sent_at?: string | null }
) {
  db.run(`UPDATE notifications SET status=?, error=?, sent_at=? WHERE id=?`, [
    patch.status,
    patch.error ?? null,
    patch.sent_at ?? new Date().toISOString(),
    id
  ]);
}

export function getLatestLeadForCall(db: Db, callId: string): LeadRow | null {
  return (
    db.get<LeadRow>("SELECT * FROM leads WHERE call_id = ? ORDER BY created_at DESC LIMIT 1", [
      callId
    ]) ?? null
  );
}

export function getNotificationStatus(db: Db, callId: string, channel: string) {
  return db.get<{ status: string | null; sent_at: string | null }>(
    "SELECT status, sent_at FROM notifications WHERE call_id=? AND channel=?",
    [callId, channel]
  );
}

export function listNotificationsForCall(
  db: Db,
  callId: string
) {
  return db.all<{ id: string; channel: string; status: string | null; sent_at: string | null; error: string | null }>(
    "SELECT id, channel, status, sent_at, error FROM notifications WHERE call_id=? ORDER BY sent_at DESC",
    [callId]
  );
}

export function getLeadHistoryByPhone(db: Db, phone: string, tenantId?: string, limit = 3): LeadRow[] {
  if (tenantId) {
    return db.all<LeadRow>(
      `SELECT l.* FROM leads l
       JOIN calls c ON l.call_id = c.call_id
       WHERE c.from_number = ? AND l.tenant_id = ? AND l.issue_summary IS NOT NULL
       ORDER BY l.created_at DESC LIMIT ?`,
      [phone, tenantId, limit]
    );
  }
  return db.all<LeadRow>(
    `SELECT l.* FROM leads l
     JOIN calls c ON l.call_id = c.call_id
     WHERE c.from_number = ? AND l.issue_summary IS NOT NULL
     ORDER BY l.created_at DESC LIMIT ?`,
    [phone, limit]
  );
}

export function escapeLike(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

export function getLeadHistoryByName(db: Db, name: string, tenantId?: string, limit = 5): LeadRow[] {
  if (tenantId) {
    return db.all<LeadRow>(
      `SELECT * FROM leads
       WHERE LOWER(name) LIKE LOWER(?) ESCAPE '\\' AND tenant_id = ? AND issue_summary IS NOT NULL
       ORDER BY created_at DESC LIMIT ?`,
      [`%${escapeLike(name)}%`, tenantId, limit]
    );
  }
  return db.all<LeadRow>(
    `SELECT * FROM leads
     WHERE LOWER(name) LIKE LOWER(?) ESCAPE '\\' AND issue_summary IS NOT NULL
     ORDER BY created_at DESC LIMIT ?`,
    [`%${escapeLike(name)}%`, limit]
  );
}

export function newLeadId() {
  return randomUUID();
}

/**
 * Find leads from the same caller (by phone) within the last N days for a tenant.
 * Used for duplicate detection in the admin and dashboard.
 */
export function findDuplicateLeads(
  db: Db,
  phone: string,
  tenantId: string,
  withinDays = 7
): LeadRow[] {
  const since = new Date(Date.now() - withinDays * 24 * 60 * 60 * 1000).toISOString();
  return db.all<LeadRow>(
    `SELECT l.* FROM leads l
     JOIN calls c ON l.call_id = c.call_id
     WHERE c.from_number = ? AND l.tenant_id = ? AND l.created_at >= ?
     ORDER BY l.created_at DESC`,
    [phone, tenantId, since]
  );
}

/** Get per-tenant lead statistics for the dashboard analytics section. */
export type TenantLeadStats = {
  total: number;
  this_week: number;
  emergency: number;
  urgent: number;
  routine: number;
  new_status: number;
  handled: number;
  booked: number;
  called_back: number;
};

export function getTenantLeadStats(db: Db, tenantId: string): TenantLeadStats {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const totals = db.get<{ total: number; emergency: number; urgent: number; routine: number }>(
    `SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN urgency_level='emergency' THEN 1 ELSE 0 END) AS emergency,
      SUM(CASE WHEN urgency_level='urgent' THEN 1 ELSE 0 END) AS urgent,
      SUM(CASE WHEN urgency_level='routine' OR urgency_level IS NULL THEN 1 ELSE 0 END) AS routine
    FROM leads WHERE tenant_id = ?`,
    [tenantId]
  ) ?? { total: 0, emergency: 0, urgent: 0, routine: 0 };

  const weekCount = db.get<{ n: number }>(
    "SELECT COUNT(*) AS n FROM leads WHERE tenant_id = ? AND created_at >= ?",
    [tenantId, weekAgo]
  )?.n ?? 0;

  const statusCounts = db.all<{ lead_status: string; n: number }>(
    "SELECT COALESCE(lead_status,'new') AS lead_status, COUNT(*) AS n FROM leads WHERE tenant_id = ? GROUP BY lead_status",
    [tenantId]
  );
  const statusMap = new Map(statusCounts.map(r => [r.lead_status, r.n]));

  return {
    total: totals.total,
    this_week: weekCount,
    emergency: totals.emergency,
    urgent: totals.urgent,
    routine: totals.routine,
    new_status: statusMap.get("new") ?? 0,
    handled: statusMap.get("handled") ?? 0,
    booked: statusMap.get("booked") ?? 0,
    called_back: statusMap.get("called_back") ?? 0
  };
}

// ─── Admin stats ──────────────────────────────────────────────────────────────

export type TenantWithStats = Omit<TenantRow, "password_hash" | "session_token"> & {
  lead_count: number;
  call_count: number;
  sms_count: number;
};

export function listTenantsWithStats(db: Db): TenantWithStats[] {
  return db.all<TenantWithStats>(`
    SELECT
      t.tenant_id, t.name, t.trade_type, t.ai_name, t.twilio_number, t.owner_phone,
      t.owner_email, t.business_hours_start, t.business_hours_end, t.timezone,
      t.enable_warm_transfer, t.service_area, t.active, t.created_at,
      t.last_login_at, t.payment_status, t.trial_ends_at,
      COUNT(DISTINCT l.lead_id) AS lead_count,
      COUNT(DISTINCT c.call_id) AS call_count,
      COUNT(DISTINCT CASE WHEN n.channel='sms' AND n.status='sent' THEN n.id END) AS sms_count
    FROM tenants t
    LEFT JOIN leads l ON l.tenant_id = t.tenant_id
    LEFT JOIN calls c ON c.tenant_id = t.tenant_id
    LEFT JOIN notifications n ON n.call_id = c.call_id
    GROUP BY t.tenant_id
    ORDER BY t.created_at DESC
  `, []);
}

export type OverviewStats = {
  total_tenants: number;
  pending_setup: number;
  on_trial: number;
  active_paying: number;
  calls_today: number;
  leads_today: number;
  sms_today: number;
};

export type DailyFunnelStats = {
  day: string;
  calls_started: number;
  leads_captured: number;
  complete_captures: number;
  sms_total: number;
  sms_sent: number;
  demos_started: number;
  demo_recordings_ready: number;
};

export function getDailyFunnelStats(db: Db, days = 7): DailyFunnelStats[] {
  const safeDays = Math.max(1, Math.min(90, Math.floor(days)));
  const sinceIso = new Date(Date.now() - (safeDays - 1) * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const callsByDay = db.all<{ day: string; n: number }>(
    `SELECT substr(started_at,1,10) AS day, COUNT(*) AS n
     FROM calls
     WHERE started_at IS NOT NULL AND substr(started_at,1,10) >= ?
     GROUP BY day`,
    [sinceIso]
  );
  const leadsByDay = db.all<{ day: string; n: number }>(
    `SELECT substr(created_at,1,10) AS day, COUNT(*) AS n
     FROM leads
     WHERE created_at IS NOT NULL AND substr(created_at,1,10) >= ?
     GROUP BY day`,
    [sinceIso]
  );
  const completeByDay = db.all<{ day: string; n: number }>(
    `SELECT substr(created_at,1,10) AS day, COUNT(*) AS n
     FROM leads
     WHERE created_at IS NOT NULL
       AND substr(created_at,1,10) >= ?
       AND COALESCE(TRIM(name), '') <> ''
       AND COALESCE(TRIM(phone), '') <> ''
       AND COALESCE(TRIM(issue_summary), '') <> ''
       AND COALESCE(TRIM(urgency_level), '') <> ''
     GROUP BY day`,
    [sinceIso]
  );
  const smsByDay = db.all<{ day: string; total: number; sent: number }>(
    `SELECT substr(COALESCE(sent_at,''),1,10) AS day,
            COUNT(*) AS total,
            SUM(CASE WHEN status='sent' THEN 1 ELSE 0 END) AS sent
     FROM notifications
     WHERE channel='sms'
       AND sent_at IS NOT NULL
       AND substr(sent_at,1,10) >= ?
     GROUP BY day`,
    [sinceIso]
  );
  const demosStartedByDay = db.all<{ day: string; n: number }>(
    `SELECT substr(created_at,1,10) AS day, COUNT(*) AS n
     FROM analytics_events
     WHERE event_name='simulate_demo_started'
       AND created_at IS NOT NULL
       AND substr(created_at,1,10) >= ?
     GROUP BY day`,
    [sinceIso]
  );
  const demosReadyByDay = db.all<{ day: string; n: number }>(
    `SELECT substr(created_at,1,10) AS day, COUNT(*) AS n
     FROM analytics_events
     WHERE event_name='demo_recording_ready'
       AND created_at IS NOT NULL
       AND substr(created_at,1,10) >= ?
     GROUP BY day`,
    [sinceIso]
  );

  const callsMap = new Map(callsByDay.map((r) => [r.day, r.n]));
  const leadsMap = new Map(leadsByDay.map((r) => [r.day, r.n]));
  const completeMap = new Map(completeByDay.map((r) => [r.day, r.n]));
  const smsMap = new Map(smsByDay.map((r) => [r.day, { total: r.total, sent: Number(r.sent ?? 0) }]));
  const demosStartedMap = new Map(demosStartedByDay.map((r) => [r.day, r.n]));
  const demosReadyMap = new Map(demosReadyByDay.map((r) => [r.day, r.n]));

  const rows: DailyFunnelStats[] = [];
  for (let i = safeDays - 1; i >= 0; i--) {
    const day = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const sms = smsMap.get(day) ?? { total: 0, sent: 0 };
    rows.push({
      day,
      calls_started: callsMap.get(day) ?? 0,
      leads_captured: leadsMap.get(day) ?? 0,
      complete_captures: completeMap.get(day) ?? 0,
      sms_total: sms.total,
      sms_sent: sms.sent,
      demos_started: demosStartedMap.get(day) ?? 0,
      demo_recordings_ready: demosReadyMap.get(day) ?? 0
    });
  }
  return rows;
}

export type AnalyticsEventRow = {
  event_id: string;
  event_name: string;
  tenant_id: string | null;
  call_id: string | null;
  level: string | null;
  payload_json: string | null;
  created_at: string;
};

export function createAnalyticsEvent(
  db: Db,
  data: {
    event_name: string;
    tenant_id?: string | null;
    call_id?: string | null;
    level?: "info" | "warn" | "error";
    payload_json?: string | null;
  }
) {
  const eventId = randomUUID();
  db.run(
    `INSERT INTO analytics_events (event_id, event_name, tenant_id, call_id, level, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      eventId,
      data.event_name,
      data.tenant_id ?? null,
      data.call_id ?? null,
      data.level ?? "info",
      data.payload_json ?? null,
      new Date().toISOString()
    ]
  );
  return eventId;
}

export function listAnalyticsEvents(
  db: Db,
  opts: { tenant_id?: string; call_id?: string; limit?: number } = {}
): AnalyticsEventRow[] {
  const conditions: string[] = [];
  const params: any[] = [];
  if (opts.tenant_id) {
    conditions.push("tenant_id = ?");
    params.push(opts.tenant_id);
  }
  if (opts.call_id) {
    conditions.push("call_id = ?");
    params.push(opts.call_id);
  }
  params.push(opts.limit ?? 200);
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  return db.all<AnalyticsEventRow>(
    `SELECT * FROM analytics_events ${where} ORDER BY created_at DESC LIMIT ?`,
    params
  );
}

export function getOverviewStats(db: Db): OverviewStats {
  const today = new Date().toISOString().slice(0, 10);
  const tenants = db.all<{ twilio_number: string; payment_status: string | null }>(
    "SELECT twilio_number, payment_status FROM tenants WHERE active = 1", []
  );
  const total_tenants = tenants.length;
  const pending_setup = tenants.filter(t => !t.twilio_number || t.twilio_number.startsWith("+PENDING_")).length;
  const on_trial = tenants.filter(t => t.payment_status === "trial").length;
  const active_paying = tenants.filter(t => t.payment_status === "active").length;

  const calls_today = db.get<{ n: number }>(
    "SELECT COUNT(*) AS n FROM calls WHERE started_at >= ?", [today]
  )?.n ?? 0;
  const leads_today = db.get<{ n: number }>(
    "SELECT COUNT(*) AS n FROM leads WHERE created_at >= ?", [today]
  )?.n ?? 0;
  const sms_today = db.get<{ n: number }>(
    "SELECT COUNT(*) AS n FROM notifications WHERE channel='sms' AND status='sent' AND sent_at >= ?", [today]
  )?.n ?? 0;

  return { total_tenants, pending_setup, on_trial, active_paying, calls_today, leads_today, sms_today };
}

export function getFoundingCustomerCount(db: Db): number {
  return db.get<{ n: number }>(
    "SELECT COUNT(*) AS n FROM tenants WHERE payment_status IN ('trial','active','cancelling') AND stripe_customer_id IS NOT NULL"
  )?.n ?? 0;
}

export type TenantDetail = TenantWithStats & {
  recent_leads: (LeadRow & { recording_url: string | null })[];
  recent_calls: CallRow[];
};

export function getAdminTenantDetail(db: Db, tenantId: string): TenantDetail | null {
  const rows = db.all<TenantWithStats>(`
    SELECT
      t.tenant_id, t.name, t.trade_type, t.ai_name, t.twilio_number, t.owner_phone,
      t.owner_email, t.business_hours_start, t.business_hours_end, t.timezone,
      t.enable_warm_transfer, t.service_area, t.active, t.created_at,
      t.last_login_at, t.payment_status, t.trial_ends_at,
      COUNT(DISTINCT l.lead_id) AS lead_count,
      COUNT(DISTINCT c.call_id) AS call_count,
      COUNT(DISTINCT CASE WHEN n.channel='sms' AND n.status='sent' THEN n.id END) AS sms_count
    FROM tenants t
    LEFT JOIN leads l ON l.tenant_id = t.tenant_id
    LEFT JOIN calls c ON c.tenant_id = t.tenant_id
    LEFT JOIN notifications n ON n.call_id = c.call_id
    WHERE t.tenant_id = ?
    GROUP BY t.tenant_id
  `, [tenantId]);
  if (!rows.length) return null;
  const base = rows[0];

  const recent_leads = db.all<LeadRow & { recording_url: string | null }>(
    `SELECT l.*, c.recording_url
     FROM leads l LEFT JOIN calls c ON l.call_id = c.call_id
     WHERE l.tenant_id = ? ORDER BY l.created_at DESC LIMIT 10`,
    [tenantId]
  );
  const recent_calls = db.all<CallRow>(
    "SELECT * FROM calls WHERE tenant_id = ? ORDER BY started_at DESC LIMIT 10",
    [tenantId]
  );

  return { ...base, recent_leads, recent_calls };
}

export function generateTempPassword(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 10; i++) out += chars[randomInt(chars.length)];
  return out;
}

/** Store a password-reset token (6-digit code) valid for 15 minutes. */
export function createPasswordResetToken(db: Db, tenantId: string): string {
  const code = String(randomInt(100000, 1000000));
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  setSystemConfig(db, `pw_reset:${tenantId}`, `${code}:${expiresAt}`);
  return code;
}

/** Verify and consume a password-reset token. Returns true if valid (and clears it). */
export function verifyPasswordResetToken(db: Db, tenantId: string, code: string): boolean {
  const stored = getSystemConfig(db, `pw_reset:${tenantId}`);
  if (!stored) return false;
  const sepIdx = stored.indexOf(":");
  if (sepIdx === -1) return false;
  const storedCode = stored.slice(0, sepIdx);
  const expiresAt = stored.slice(sepIdx + 1);
  if (storedCode.length !== code.length) return false;
  const codeMatch = timingSafeEqual(Buffer.from(storedCode), Buffer.from(code));
  if (!codeMatch) return false;
  if (new Date(expiresAt) < new Date()) return false;
  db.run("DELETE FROM system_config WHERE key = ?", [`pw_reset:${tenantId}`]);
  return true;
}

// ─── Demo sessions ────────────────────────────────────────────────────────────

export type DemoSessionRow = {
  demo_number: string;
  tenant_id: string;
  assigned_at: string;
  expires_at: string;
};

/** Remove expired demo sessions and return tenant via a demo pool number. */
export function getDemoTenantByNumber(db: Db, number: string): TenantRow | null {
  const now = new Date().toISOString();
  db.run("DELETE FROM demo_sessions WHERE expires_at < ?", [now]);
  const row = db.get<{ tenant_id: string }>(
    "SELECT tenant_id FROM demo_sessions WHERE demo_number = ? AND expires_at >= ?",
    [number, now]
  );
  if (!row) return null;
  return db.get<TenantRow>("SELECT * FROM tenants WHERE tenant_id = ?", [row.tenant_id]) ?? null;
}

/**
 * Attempt to claim an available demo number from the pool for the given tenant.
 * Cleans up expired sessions first. Returns the claimed number or null if all busy.
 */
export function claimDemoNumber(
  db: Db,
  tenantId: string,
  poolNumbers: string[]
): string | null {
  const now = new Date().toISOString();
  // Clean expired sessions
  db.run("DELETE FROM demo_sessions WHERE expires_at < ?", [now]);

  // If this tenant already has an active (non-expired) demo session, return that number
  const existing = db.get<DemoSessionRow>(
    "SELECT * FROM demo_sessions WHERE tenant_id = ? AND expires_at >= ?",
    [tenantId, now]
  );
  if (existing) return existing.demo_number;

  // Find a pool number not currently in use
  const inUse = db.all<{ demo_number: string }>(
    "SELECT demo_number FROM demo_sessions",
    []
  ).map((r) => r.demo_number);

  const available = poolNumbers.find((n) => !inUse.includes(n));
  if (!available) return null;

  const assignedAt = now;
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes
  db.run(
    "INSERT INTO demo_sessions (demo_number, tenant_id, assigned_at, expires_at) VALUES (?, ?, ?, ?)",
    [available, tenantId, assignedAt, expiresAt]
  );
  return available;
}

/** Get the active demo session for a tenant (or null if none / expired). */
export function getActiveDemoSession(db: Db, tenantId: string): DemoSessionRow | null {
  const now = new Date().toISOString();
  return db.get<DemoSessionRow>(
    "SELECT * FROM demo_sessions WHERE tenant_id = ? AND expires_at >= ?",
    [tenantId, now]
  ) ?? null;
}

/** List all demo sessions (including expired ones). */
export function listDemoSessions(db: Db): DemoSessionRow[] {
  return db.all<DemoSessionRow>("SELECT * FROM demo_sessions ORDER BY assigned_at DESC", []);
}

/** Delete all demo sessions (useful for admin cleanup of stuck sessions). */
export function clearDemoSessions(db: Db): number {
  const count = db.get<{ cnt: number }>("SELECT COUNT(*) as cnt FROM demo_sessions", [])?.cnt ?? 0;
  db.run("DELETE FROM demo_sessions", []);
  return count;
}

// ─── System config ────────────────────────────────────────────────────────────

export type SystemConfigRow = {
  key: string;
  value: string;
  updated_at: string;
};

/** Read a single config value, returning undefined if the key does not exist. */
export function getSystemConfig(db: Db, key: string): string | undefined {
  return db.get<{ value: string }>(
    "SELECT value FROM system_config WHERE key = ?",
    [key]
  )?.value;
}

/** Upsert a config value. */
export function setSystemConfig(db: Db, key: string, value: string): void {
  db.run(
    `INSERT INTO system_config (key, value, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [key, value, new Date().toISOString()]
  );
}

/** List all config entries. */
export function listSystemConfig(db: Db): SystemConfigRow[] {
  return db.all<SystemConfigRow>("SELECT * FROM system_config ORDER BY key", []);
}

// ─── Prospects (marketing lead management) ───────────────────────────────────

export type ProspectRow = {
  prospect_id: string;
  business_name: string;
  owner_name: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  trade_type: string | null;
  suburb: string | null;
  state: string;
  source: string;
  status: string;
  google_rating: number | null;
  review_count: number | null;
  notes: string | null;
  last_contacted_at: string | null;
  next_followup_at: string | null;
  created_at: string;
};

export type OutreachLogRow = {
  log_id: string;
  prospect_id: string;
  channel: string;
  message: string | null;
  status: string;
  sent_at: string;
};

export function createProspect(
  db: Db,
  data: Omit<ProspectRow, "prospect_id" | "created_at" | "status"> & { status?: string }
): ProspectRow {
  const prospect_id = randomUUID();
  const now = new Date().toISOString();
  db.run(
    `INSERT INTO prospects (
      prospect_id, business_name, owner_name, phone, email, website,
      trade_type, suburb, state, source, status, google_rating, review_count,
      notes, last_contacted_at, next_followup_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      prospect_id, data.business_name, data.owner_name ?? null,
      data.phone ?? null, data.email ?? null, data.website ?? null,
      data.trade_type ?? null, data.suburb ?? null, data.state ?? "NSW",
      data.source ?? "manual", data.status ?? "new",
      data.google_rating ?? null, data.review_count ?? null,
      data.notes ?? null, data.last_contacted_at ?? null,
      data.next_followup_at ?? null, now
    ]
  );
  return db.get<ProspectRow>("SELECT * FROM prospects WHERE prospect_id = ?", [prospect_id])!;
}

const PROSPECT_UPDATABLE_COLUMNS = new Set([
  "business_name", "owner_name", "phone", "email", "website",
  "trade_type", "suburb", "state", "source", "status",
  "google_rating", "review_count", "notes",
  "last_contacted_at", "next_followup_at"
]);

export function updateProspect(
  db: Db,
  prospectId: string,
  patch: Partial<Omit<ProspectRow, "prospect_id" | "created_at">>
) {
  const keys = Object.keys(patch).filter(k => (patch as any)[k] !== undefined && PROSPECT_UPDATABLE_COLUMNS.has(k));
  if (keys.length === 0) return;
  const setClause = keys.map(k => `${k} = ?`).join(", ");
  const params = [...keys.map(k => (patch as any)[k]), prospectId];
  db.run(`UPDATE prospects SET ${setClause} WHERE prospect_id = ?`, params);
}

export function getProspectById(db: Db, id: string): ProspectRow | null {
  return db.get<ProspectRow>("SELECT * FROM prospects WHERE prospect_id = ?", [id]) ?? null;
}

export function listProspects(
  db: Db,
  opts: { status?: string; trade_type?: string; suburb?: string; source?: string; limit?: number } = {}
): ProspectRow[] {
  const conditions: string[] = [];
  const params: any[] = [];

  if (opts.status) { conditions.push("status = ?"); params.push(opts.status); }
  if (opts.trade_type) { conditions.push("trade_type = ?"); params.push(opts.trade_type); }
  if (opts.suburb) { conditions.push("LOWER(suburb) LIKE LOWER(?) ESCAPE '\\'"); params.push(`%${escapeLike(opts.suburb)}%`); }
  if (opts.source) { conditions.push("source = ?"); params.push(opts.source); }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  params.push(opts.limit ?? 500);

  return db.all<ProspectRow>(
    `SELECT * FROM prospects ${where} ORDER BY created_at DESC LIMIT ?`,
    params
  );
}

export function deleteProspect(db: Db, id: string) {
  db.run("DELETE FROM prospects WHERE prospect_id = ?", [id]);
}

export type ProspectStats = {
  total: number;
  new_count: number;
  contacted: number;
  replied: number;
  demo_booked: number;
  trial: number;
  paying: number;
  not_interested: number;
  do_not_contact: number;
};

export function getProspectStats(db: Db): ProspectStats {
  const rows = db.all<{ status: string; cnt: number }>(
    "SELECT status, COUNT(*) AS cnt FROM prospects GROUP BY status", []
  );
  const m = new Map(rows.map(r => [r.status, r.cnt]));
  return {
    total: rows.reduce((s, r) => s + r.cnt, 0),
    new_count: m.get("new") ?? 0,
    contacted: m.get("contacted") ?? 0,
    replied: m.get("replied") ?? 0,
    demo_booked: m.get("demo_booked") ?? 0,
    trial: m.get("trial") ?? 0,
    paying: m.get("paying") ?? 0,
    not_interested: m.get("not_interested") ?? 0,
    do_not_contact: m.get("do_not_contact") ?? 0
  };
}

/** Bulk-insert prospects from CSV rows, skipping duplicates by phone. */
export function importProspects(
  db: Db,
  rows: Array<Omit<ProspectRow, "prospect_id" | "created_at" | "status">>
): { imported: number; skipped: number } {
  let imported = 0;
  let skipped = 0;
  for (const row of rows) {
    if (row.phone) {
      const existing = db.get<{ prospect_id: string }>(
        "SELECT prospect_id FROM prospects WHERE phone = ?", [row.phone]
      );
      if (existing) { skipped++; continue; }
    }
    createProspect(db, row);
    imported++;
  }
  return { imported, skipped };
}

// ─── Outreach log ─────────────────────────────────────────────────────────────

export function createOutreachLog(
  db: Db,
  data: { prospect_id: string; channel: string; message?: string; status?: string }
): OutreachLogRow {
  const log_id = randomUUID();
  const now = new Date().toISOString();
  db.run(
    `INSERT INTO outreach_log (log_id, prospect_id, channel, message, status, sent_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [log_id, data.prospect_id, data.channel, data.message ?? null, data.status ?? "sent", now]
  );
  return { log_id, prospect_id: data.prospect_id, channel: data.channel, message: data.message ?? null, status: data.status ?? "sent", sent_at: now };
}

// ─── Onboarding nudge helpers ─────────────────────────────────────────────────

/**
 * Find tenants who signed up, have a provisioned number, but haven't received
 * any real calls yet. Used for automated onboarding nudge SMS.
 */
export function getTenantsNeedingNudge(
  db: Db,
  minAgeMs: number,
  maxAgeMs: number
): TenantRow[] {
  const oldestCreated = new Date(Date.now() - maxAgeMs).toISOString();
  const newestCreated = new Date(Date.now() - minAgeMs).toISOString();
  return db.all<TenantRow>(
    `SELECT t.* FROM tenants t
     WHERE t.active = 1
       AND t.twilio_number NOT LIKE '+PENDING%'
       AND t.created_at >= ? AND t.created_at <= ?
       AND t.payment_status IN ('trial', 'active')
       AND NOT EXISTS (
         SELECT 1 FROM calls c WHERE c.tenant_id = t.tenant_id AND c.status IS NOT NULL AND c.is_demo = 0
       )`,
    [oldestCreated, newestCreated]
  );
}

/** Check if a tenant has received any real (non-demo) calls. */
export function tenantHasCalls(db: Db, tenantId: string): boolean {
  const row = db.get<{ n: number }>(
    "SELECT COUNT(*) AS n FROM calls WHERE tenant_id = ? AND status IS NOT NULL AND is_demo = 0",
    [tenantId]
  );
  return (row?.n ?? 0) > 0;
}

/** Count total real (non-demo) calls for a tenant. */
export function getTenantCallCount(db: Db, tenantId: string): number {
  return db.get<{ n: number }>(
    "SELECT COUNT(*) AS n FROM calls WHERE tenant_id = ? AND status IS NOT NULL AND is_demo = 0",
    [tenantId]
  )?.n ?? 0;
}

export function listOutreachForProspect(db: Db, prospectId: string): OutreachLogRow[] {
  return db.all<OutreachLogRow>(
    "SELECT * FROM outreach_log WHERE prospect_id = ? ORDER BY sent_at DESC",
    [prospectId]
  );
}
