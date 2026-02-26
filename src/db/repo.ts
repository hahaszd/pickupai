import { randomUUID } from "node:crypto";
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
  active: number;
  created_at: string;
  last_login_at: string | null;
  payment_status: string | null;
  trial_ends_at: string | null;
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
  return check === hash;
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

export function updateTenant(
  db: Db,
  tenantId: string,
  patch: Partial<Omit<TenantRow, "tenant_id" | "created_at">> & { password?: string }
) {
  const { password, ...rest } = patch as any;
  if (password) rest.password_hash = hashPassword(password);
  const keys = Object.keys(rest).filter((k) => rest[k] !== undefined);
  if (keys.length === 0) return;
  const setClause = keys.map((k) => `${k} = ?`).join(", ");
  const params = [...keys.map((k) => rest[k]), tenantId];
  db.run(`UPDATE tenants SET ${setClause} WHERE tenant_id = ?`, params);
}

export function deleteTenant(db: Db, tenantId: string) {
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

export function upsertCall(
  db: Db,
  row: Pick<CallRow, "call_id"> & Partial<Omit<CallRow, "call_id">>
) {
  const existing = db.get<{ call_id: string }>("SELECT call_id FROM calls WHERE call_id = ?", [
    row.call_id
  ]);

  const patchKeys = Object.keys(row).filter((k) => k !== "call_id" && (row as any)[k] !== undefined);
  if (existing) {
    if (patchKeys.length === 0) return;
    const setClause = patchKeys.map((k) => `${k} = ?`).join(", ");
    const params = patchKeys.map((k) => (row as any)[k]);
    params.push(row.call_id);
    db.run(`UPDATE calls SET ${setClause} WHERE call_id = ?`, params);
    return;
  }

  db.run(
    `INSERT INTO calls (call_id, tenant_id, from_number, to_number, started_at, ended_at, status, recording_url, recording_sid, transcript)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      row.transcript ?? ""
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
  lead: Omit<LeadRow, "created_at"> & { created_at?: string }
) {
  const created_at = lead.created_at ?? new Date().toISOString();
  const existing = db.get<{ lead_id: string }>("SELECT lead_id FROM leads WHERE lead_id = ?", [
    lead.lead_id
  ]);

  if (existing) {
    db.run(
      `UPDATE leads SET
        tenant_id=?, name=?, phone=?, address=?, issue_type=?, issue_summary=?,
        urgency_level=?, preferred_time=?, notes=?, confidence=?, next_action=?
      WHERE lead_id=?`,
      [
        lead.tenant_id ?? null,
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
        lead.lead_id
      ]
    );
    return;
  }

  db.run(
    `INSERT INTO leads (
      lead_id, tenant_id, call_id, name, phone, address, issue_type, issue_summary,
      urgency_level, preferred_time, notes, confidence, next_action, lead_status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
  opts: { limit?: number; urgency?: string; status?: string } = {}
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

export function getLeadHistoryByName(db: Db, name: string, tenantId?: string, limit = 5): LeadRow[] {
  if (tenantId) {
    return db.all<LeadRow>(
      `SELECT * FROM leads
       WHERE LOWER(name) LIKE LOWER(?) AND tenant_id = ? AND issue_summary IS NOT NULL
       ORDER BY created_at DESC LIMIT ?`,
      [`%${name}%`, tenantId, limit]
    );
  }
  return db.all<LeadRow>(
    `SELECT * FROM leads
     WHERE LOWER(name) LIKE LOWER(?) AND issue_summary IS NOT NULL
     ORDER BY created_at DESC LIMIT ?`,
    [`%${name}%`, limit]
  );
}

export function newLeadId() {
  return randomUUID();
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
  for (let i = 0; i < 10; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
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

  // If this tenant already has an active demo session, return that number
  const existing = db.get<DemoSessionRow>(
    "SELECT * FROM demo_sessions WHERE tenant_id = ?",
    [tenantId]
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
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour
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
  db.run("DELETE FROM demo_sessions", []);
  // Return count of rows deleted is not directly available in this wrapper,
  // so we just return 0 as a placeholder.
  return 0;
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
