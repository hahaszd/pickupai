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
  db.run("UPDATE tenants SET session_token = ? WHERE tenant_id = ?", [token, tenant.tenant_id]);
  return { ...tenant, session_token: token };
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
