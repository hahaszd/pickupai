import { randomUUID, timingSafeEqual, randomInt } from "node:crypto";
import { pbkdf2Sync, randomBytes } from "node:crypto";
import type { Db } from "./db.js";
import { toE164Au, isAuMobile, isUnreachableNumber } from "../utils/phone.js";

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
  provision_status: string | null;
  provision_error: string | null;
  expired_at: string | null;
  number_released_at: string | null;
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
  /** Owner-entered dollar figure. The assistant never writes this. */
  job_value: number | null;
  /** Assistant's scope estimate: small | medium | large. */
  job_size: string | null;
  property_type: string | null;
  caller_sentiment: string | null;
  /** new_job | quote_only | complaint | supplier | spam | … — see session.ts. */
  caller_intent: string | null;
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
  "payment_status", "trial_ends_at", "stripe_customer_id",
  "expired_at", "number_released_at"
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
  lead: Omit<LeadRow, "created_at" | "lead_status" | "job_value" | "job_size" | "property_type" | "caller_sentiment" | "caller_intent"> & {
    created_at?: string;
    lead_status?: string | null;
    job_value?: number | null;
    job_size?: string | null;
    property_type?: string | null;
    caller_sentiment?: string | null;
    caller_intent?: string | null;
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
      ["job_size", lead.job_size],
      ["property_type", lead.property_type],
      ["caller_sentiment", lead.caller_sentiment],
      ["caller_intent", lead.caller_intent],
    ];
    const updatableFields = allFields.filter(([, v]) => v !== undefined);
    if (updatableFields.length === 0) return;

    // Scoped by tenant as well as by lead_id, and the tenant_id column is not
    // in the SET list — this branch could previously rewrite ANY tenant's row
    // and reassign its owner in the same statement. lead_id is a callSid so a
    // collision is not the realistic risk; a careless call site is, and the
    // read side was made unrepresentable on 2026-07-29 while the write side was
    // left representable.
    //
    // A row with no tenant (the "default" fallback path) is matched by the
    // IS NULL arm rather than being locked out of its own updates.
    const params = [
      ...updatableFields.filter(([k]) => k !== "tenant_id").map(([, v]) => v ?? null),
      lead.lead_id,
      lead.tenant_id ?? null,
      lead.tenant_id ?? null
    ];
    const setNoTenant = updatableFields
      .filter(([k]) => k !== "tenant_id")
      .map(([k]) => `${k}=?`)
      .join(", ");
    if (!setNoTenant) return;
    db.run(
      `UPDATE leads SET ${setNoTenant} WHERE lead_id=? AND (tenant_id = ? OR (? IS NULL AND tenant_id IS NULL))`,
      params
    );
    return;
  }

  db.run(
    `INSERT INTO leads (
      lead_id, tenant_id, call_id, name, phone, address, issue_type, issue_summary,
      urgency_level, preferred_time, notes, confidence, next_action, lead_status,
      job_value, job_size, property_type, caller_sentiment, caller_intent, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      lead.job_size ?? null,
      lead.property_type ?? null,
      lead.caller_sentiment ?? null,
      lead.caller_intent ?? null,
      created_at
    ]
  );
}

/**
 * Scoped by tenant as well as by lead. The route already checks ownership
 * first, but a repo function that can rewrite another tenant's row is one
 * careless call site from doing it — and a mutation removing the WHERE clause
 * entirely passed all 372 tests when this was probed.
 */
export function updateLeadStatus(db: Db, leadId: string, status: string, tenantId: string) {
  db.run("UPDATE leads SET lead_status = ? WHERE lead_id = ? AND tenant_id = ?", [status, leadId, tenantId]);
}

// ─── Lead queries ─────────────────────────────────────────────────────────────

export function listLeadsForTenant(
  db: Db,
  tenantId: string,
  // No `urgency` filter. It matched on urgency_level, which stopped being
  // written on 2026-07-28, so it could only ever return rows older than that —
  // a filter guaranteed to hide every job the tradie actually has.
  opts: { limit?: number; status?: string; search?: string } = {}
): (LeadRow & { recording_url: string | null })[] {
  const conditions = ["l.tenant_id = ?"];
  const params: any[] = [tenantId];

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
     -- Newest first, full stop. This used to sort by urgency_level before
     -- created_at, and that column stopped being written on 2026-07-28 when the
     -- urgency feature was deleted. Every lead since is NULL, so it falls in
     -- the last bucket — which pinned every pre-2026-07-28 "emergency" and
     -- "urgent" lead permanently above every job that has come in since. The
     -- tradie opens his own leads page and sees months-old work on top.
     ORDER BY l.created_at DESC
     LIMIT ?`,
    params
  );
}

export function getLeadWithCall(
  db: Db,
  leadId: string,
  tenantId: string
): (LeadRow & { recording_url: string | null; transcript: string | null; from_number: string | null }) | null {
  const row = db.get<LeadRow & { recording_url: string | null; transcript: string | null; from_number: string | null }>(
    `SELECT l.*, c.recording_url, c.transcript, c.from_number
     FROM leads l
     LEFT JOIN calls c ON l.call_id = c.call_id
     WHERE l.lead_id = ? AND l.tenant_id = ?`,
    [leadId, tenantId]
  );
  if (!row) return null;

  // calls.from_number stores whatever Twilio sent, placeholder and all. The
  // dashboard falls back to it — `lead.phone ?? lead.from_number` — and renders
  // it as <a href="tel:…">, so guarding lead.phone alone just moved the render
  // onto this branch. The tradie taps it and dials an international number.
  //
  // Sanitised here rather than at the page, so the CSV export, the duplicate
  // detector and anything added later inherit it. Nothing may present an
  // unringable string as a number to ring.
  return { ...row, from_number: isUnreachableNumber(row.from_number) ? null : row.from_number };
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

/**
 * `tenantId` is REQUIRED, and the un-filtered branch that used to sit behind an
 * optional parameter is gone.
 *
 * This feeds returning-caller history into the live system prompt
 * (`server.ts`), so a missing filter means one tenant's receptionist greeting a
 * caller with another tenant's name, address and previous job. The only call
 * site always passed a tenantId, which made the other branch pure trap: nothing
 * used it, nothing tested it, and it was one forgotten argument from a
 * cross-tenant disclosure on a live call. Deleting it makes the leak
 * unrepresentable rather than merely untested.
 */
export function getLeadHistoryByPhone(db: Db, phone: string, tenantId: string, limit = 3): LeadRow[] {
  return db.all<LeadRow>(
    `SELECT l.* FROM leads l
     JOIN calls c ON l.call_id = c.call_id
     WHERE c.from_number = ? AND l.tenant_id = ? AND l.issue_summary IS NOT NULL
     ORDER BY l.created_at DESC LIMIT ?`,
    [phone, tenantId, limit]
  );
}

export function escapeLike(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

/** `tenantId` required, same reasoning as getLeadHistoryByPhone. */
export function getLeadHistoryByName(db: Db, name: string, tenantId: string, limit = 5): LeadRow[] {
  return db.all<LeadRow>(
    `SELECT * FROM leads
     WHERE LOWER(name) LIKE LOWER(?) ESCAPE '\\' AND tenant_id = ? AND issue_summary IS NOT NULL
     ORDER BY created_at DESC LIMIT ?`,
    [`%${escapeLike(name)}%`, tenantId, limit]
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
  // emergency / urgent / routine were here until 2026-07-31. urgency_level
  // stopped being written on 2026-07-28 when the grading feature was deleted,
  // and sanitizeSaveLeadArgs strips it from every patch — so the first two were
  // a permanent zero for any tenant onboarded since, and "routine" was just
  // `total` under another name. Nothing rendered them; they were three SUMs
  // computed on every dashboard load to be discarded.
  new_status: number;
  handled: number;
  booked: number;
  called_back: number;
};

export function getTenantLeadStats(db: Db, tenantId: string): TenantLeadStats {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const totals = db.get<{ total: number }>(
    "SELECT COUNT(*) AS total FROM leads WHERE tenant_id = ?",
    [tenantId]
  ) ?? { total: 0 };

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
      t.provision_status, t.provision_error,
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

/**
 * The two numbers on the landing page. They were inline in server.ts's
 * /api/stats handler, and tests/repo.test.ts held a verbatim COPY of both
 * strings and asserted against the copy — so the numbers shown to every visitor
 * could change meaning and the test stayed green. Moved here 2026-07-29 so the
 * page and the test read the same SQL.
 *
 * Both exclusions are deliberate and both are load-bearing for an honest claim:
 * demo calls are ours, not customers', and a +PENDING number is a signup that
 * never finished provisioning.
 */
/**
 * Tenants whose trial has run out and who are still active.
 *
 * Split out of the sweep in `server.ts` on 2026-08-04. The loop that acts on
 * these rows is thin; the QUERY is the whole risk, and it lived inside `main()`
 * where no test could reach it. This one flips a tenant's billing state.
 *
 * `now` is injected rather than read from the clock so a test can stand either
 * side of an expiry boundary — the sweep runs on every instance, on an interval,
 * so "off by one comparison" means a tenant flips early or never.
 */
export function findExpiredTrials(db: Db, now: string): TenantRow[] {
  return db.all<TenantRow>(
    `SELECT * FROM tenants
     WHERE payment_status = 'trial'
       AND trial_ends_at IS NOT NULL
       AND trial_ends_at < ?
       AND active = 1`,
    [now]
  );
}

/**
 * Tenants whose Twilio number is due for release.
 *
 * **Releasing a number is irreversible and it is the tradie's business phone.**
 * A wrong row here does not lose a lead, it loses the number customers ring —
 * which is why this query, and not the Twilio call, is the thing that needed a
 * test. It had none: it lived inside `main()`.
 *
 * Four exclusions and every one is load-bearing:
 *   - only already-expired tenants, never a paying one
 *   - `expired_at` older than the grace window, so nobody loses a number the
 *     day their card bounces
 *   - `number_released_at IS NULL`, which is what makes the sweep idempotent
 *     across the multiple instances CLAUDE.md says it runs on
 *   - never a `+PENDING` or an already-`+RELEASED` placeholder
 */
export function findNumbersDueForRelease(db: Db, cutoffIso: string): TenantRow[] {
  return db.all<TenantRow>(
    `SELECT * FROM tenants
     WHERE payment_status IN ('expired', 'trial_expired')
       AND expired_at IS NOT NULL
       AND expired_at < ?
       AND number_released_at IS NULL
       AND twilio_number IS NOT NULL
       AND twilio_number NOT LIKE '+PENDING%'
       AND twilio_number NOT LIKE '+RELEASED%'`,
    [cutoffIso]
  );
}

/**
 * The audit-friendly form a released number is stamped with.
 *
 * Keeps the unique constraint happy while leaving the original readable, so a
 * report can still say which number a tenant used to own.
 */
export function releasedNumberStamp(twilioNumber: string, at: number): string {
  return `+RELEASED-${twilioNumber.replace(/^\+/, "")}-${at}`;
}

export function getPublicStats(db: Db): { calls_answered: number; businesses_served: number } {
  const calls = db.get<{ n: number }>(
    "SELECT COUNT(*) AS n FROM calls WHERE status = 'completed' AND is_demo = 0"
  )?.n ?? 0;
  const tenants = db.get<{ n: number }>(
    "SELECT COUNT(*) AS n FROM tenants WHERE active = 1 AND twilio_number NOT LIKE '+PENDING%'"
  )?.n ?? 0;
  return { calls_answered: calls, businesses_served: tenants };
}

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
  // These four are CORE_FIELDS in inbound-scenarios.ts, which is what the eval
  // grades capture quality against. The funnel and the eval must name the same
  // fields or they measure two different products.
  //
  // Filtered on urgency_level until 2026-07-29. That column stopped being
  // written when the urgency feature was deleted, so the metric read a
  // permanent zero — and the admin page's label had been changed to say
  // "caller intent" without the query underneath it changing, which is the
  // exact failure CODING_STANDARDS warns about: presenting an unexamined
  // column as a measurement. caller_intent had to be added to the leads table
  // in the same change; it had been collected on every call and discarded.
    `SELECT substr(created_at,1,10) AS day, COUNT(*) AS n
     FROM leads
     WHERE created_at IS NOT NULL
       AND substr(created_at,1,10) >= ?
       AND COALESCE(TRIM(name), '') <> ''
       AND COALESCE(TRIM(phone), '') <> ''
       AND COALESCE(TRIM(issue_summary), '') <> ''
       AND COALESCE(TRIM(caller_intent), '') <> ''
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

// ─── Campaign funnel stats ────────────────────────────────────────────────────

export type CampaignFunnelStats = {
  total_sent: number;
  total_prospects: number;
  called_demo: number;
  signed_up: number;
  by_date: Array<{ day: string; sent: number; called: number; signed_up: number }>;
  by_trade: Array<{ trade_type: string; sent: number; called: number; signed_up: number }>;
  by_suburb: Array<{ suburb: string; sent: number; called: number; signed_up: number }>;
};

export function getCampaignFunnelStats(db: Db, daysBack = 30): CampaignFunnelStats {
  const sinceIso = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString();

  const sentByDay = db.all<{ day: string; n: number }>(
    `SELECT substr(sent_at,1,10) AS day, COUNT(*) AS n
     FROM outreach_log WHERE channel = 'sms' AND status NOT IN ('failed','rejected') AND sent_at >= ?
     GROUP BY day ORDER BY day DESC`,
    [sinceIso]
  );

  const totalSent = sentByDay.reduce((s, r) => s + r.n, 0);

  const smsProspectIds = db.all<{ prospect_id: string }>(
    `SELECT DISTINCT prospect_id FROM outreach_log
     WHERE channel = 'sms' AND status NOT IN ('failed','rejected') AND sent_at >= ?`,
    [sinceIso]
  ).map(r => r.prospect_id);

  const smsProspectPhones = smsProspectIds.length > 0
    ? db.all<{ prospect_id: string; phone: string; trade_type: string | null; suburb: string | null }>(
        `SELECT prospect_id, phone, trade_type, suburb FROM prospects
         WHERE prospect_id IN (${smsProspectIds.map(() => "?").join(",")}) AND phone IS NOT NULL`,
        smsProspectIds
      )
    : [];

  const phoneSet = new Set(smsProspectPhones.map(p => p.phone));
  const phones = [...phoneSet];

  const calledPhones = new Set<string>();
  const signedUpPhones = new Set<string>();

  if (phones.length > 0) {
    const calledRows = db.all<{ from_number: string }>(
      `SELECT DISTINCT from_number FROM calls
       WHERE from_number IN (${phones.map(() => "?").join(",")}) AND started_at >= ?`,
      [...phones, sinceIso]
    );
    for (const r of calledRows) calledPhones.add(r.from_number);

    const signedRows = db.all<{ owner_phone: string }>(
      `SELECT DISTINCT owner_phone FROM tenants
       WHERE owner_phone IN (${phones.map(() => "?").join(",")}) AND created_at >= ?`,
      [...phones, sinceIso]
    );
    for (const r of signedRows) signedUpPhones.add(r.owner_phone);
  }

  const byDateMap = new Map<string, { sent: number; called: number; signed_up: number }>();
  for (const r of sentByDay) byDateMap.set(r.day, { sent: r.n, called: 0, signed_up: 0 });

  const byTradeMap = new Map<string, { sent: number; called: number; signed_up: number }>();
  const bySuburbMap = new Map<string, { sent: number; called: number; signed_up: number }>();

  for (const p of smsProspectPhones) {
    const trade = p.trade_type ?? "unknown";
    const suburb = p.suburb ?? "unknown";
    if (!byTradeMap.has(trade)) byTradeMap.set(trade, { sent: 0, called: 0, signed_up: 0 });
    if (!bySuburbMap.has(suburb)) bySuburbMap.set(suburb, { sent: 0, called: 0, signed_up: 0 });

    byTradeMap.get(trade)!.sent++;
    bySuburbMap.get(suburb)!.sent++;

    if (calledPhones.has(p.phone)) {
      byTradeMap.get(trade)!.called++;
      bySuburbMap.get(suburb)!.called++;
    }
    if (signedUpPhones.has(p.phone)) {
      byTradeMap.get(trade)!.signed_up++;
      bySuburbMap.get(suburb)!.signed_up++;
    }
  }

  return {
    total_sent: totalSent,
    total_prospects: smsProspectIds.length,
    called_demo: calledPhones.size,
    signed_up: signedUpPhones.size,
    by_date: [...byDateMap.entries()].map(([day, v]) => ({ day, ...v })),
    by_trade: [...byTradeMap.entries()].map(([trade_type, v]) => ({ trade_type, ...v })).sort((a, b) => b.sent - a.sent),
    by_suburb: [...bySuburbMap.entries()].map(([suburb, v]) => ({ suburb, ...v })).sort((a, b) => b.sent - a.sent).slice(0, 15),
  };
}

// ─── Per-variant A/B funnel stats ─────────────────────────────────────────────

export type VariantFunnelRow = {
  variant: string;
  sent: number;
  delivered: number;
  failed: number;
  clicked: number;
  replied: number;
  opt_out: number;
  called_demo: number;
  signed_up: number;
};

/**
 * Per-variant A/B funnel rollup. Joins outreach_log -> prospects -> calls/tenants
 * to compute the kill-rule metrics named in the plan: delivered, STOP rate,
 * click rate, reply rate, demo-call rate, signup rate, all bucketed by variant.
 *
 * Variants are taken verbatim from outreach_log.variant; rows with NULL variant
 * are grouped under "(none)" so legacy/un-tagged sends are still visible.
 */
export function getVariantFunnelStats(db: Db, daysBack = 30): VariantFunnelRow[] {
  const sinceIso = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString();

  const sends = db.all<{
    log_id: string;
    prospect_id: string;
    variant: string | null;
    status: string;
    link_clicked_at: string | null;
    replied_at: string | null;
  }>(
    `SELECT log_id, prospect_id, variant, status, link_clicked_at, replied_at
     FROM outreach_log
     WHERE channel = 'sms' AND sent_at >= ?`,
    [sinceIso]
  );

  if (sends.length === 0) return [];

  const prospectIds = [...new Set(sends.map(s => s.prospect_id))];
  const prospectRows = prospectIds.length
    ? db.all<{ prospect_id: string; phone: string | null }>(
        `SELECT prospect_id, phone FROM prospects WHERE prospect_id IN (${prospectIds.map(() => "?").join(",")})`,
        prospectIds
      )
    : [];
  const phoneByProspect = new Map(prospectRows.map(p => [p.prospect_id, p.phone]));
  const phones = [...new Set(prospectRows.map(p => p.phone).filter((x): x is string => !!x))];

  const calledPhones = new Set<string>();
  const signedUpPhones = new Set<string>();
  if (phones.length > 0) {
    const calledRows = db.all<{ from_number: string }>(
      `SELECT DISTINCT from_number FROM calls
       WHERE from_number IN (${phones.map(() => "?").join(",")}) AND started_at >= ?`,
      [...phones, sinceIso]
    );
    for (const r of calledRows) calledPhones.add(r.from_number);
    const signedRows = db.all<{ owner_phone: string }>(
      `SELECT DISTINCT owner_phone FROM tenants
       WHERE owner_phone IN (${phones.map(() => "?").join(",")}) AND created_at >= ?`,
      [...phones, sinceIso]
    );
    for (const r of signedRows) signedUpPhones.add(r.owner_phone);
  }

  const optOutByProspect = new Set(
    db.all<{ prospect_id: string }>(
      `SELECT DISTINCT prospect_id FROM outreach_log
       WHERE channel = 'sms_reply' AND status = 'opt_out' AND sent_at >= ?`,
      [sinceIso]
    ).map(r => r.prospect_id)
  );

  const buckets = new Map<string, VariantFunnelRow>();
  const bucketFor = (variant: string | null): VariantFunnelRow => {
    const key = variant ?? "(none)";
    let row = buckets.get(key);
    if (!row) {
      row = { variant: key, sent: 0, delivered: 0, failed: 0, clicked: 0, replied: 0, opt_out: 0, called_demo: 0, signed_up: 0 };
      buckets.set(key, row);
    }
    return row;
  };

  for (const s of sends) {
    const row = bucketFor(s.variant);
    row.sent++;
    if (/^delivered|^sent$/i.test(s.status)) row.delivered++;
    if (/failed|undelivered|rejected|skipped/i.test(s.status)) row.failed++;
    if (s.link_clicked_at) row.clicked++;
    if (s.replied_at) row.replied++;
    if (optOutByProspect.has(s.prospect_id)) row.opt_out++;
    const phone = phoneByProspect.get(s.prospect_id);
    if (phone && calledPhones.has(phone)) row.called_demo++;
    if (phone && signedUpPhones.has(phone)) row.signed_up++;
  }

  return [...buckets.values()].sort((a, b) => b.sent - a.sent);
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

export type ServiceRequestRow = {
  event_id: string;
  type: string;
  user_message: string;
  ai_response: string;
  ip: string;
  tenant_name: string | null;
  chat_log_id: string | null;
  created_at: string;
  level: string;
};

export function listServiceRequests(db: Db, opts: { type?: string; limit?: number; offset?: number } = {}): ServiceRequestRow[] {
  const limit = opts.limit ?? 50;
  const offset = opts.offset ?? 0;
  const rows = db.all<AnalyticsEventRow>(
    `SELECT * FROM analytics_events WHERE event_name = 'chat_service_request' ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [limit, offset]
  );

  return rows.map(r => {
    const payload = r.payload_json ? JSON.parse(r.payload_json) : {};
    const tenantId = r.tenant_id;
    let tenantName: string | null = null;
    if (tenantId) {
      const t = db.get<{ name: string }>("SELECT name FROM tenants WHERE tenant_id = ?", [tenantId]);
      tenantName = t?.name ?? null;
    }
    return {
      event_id: r.event_id,
      type: payload.type ?? "unknown",
      user_message: payload.user_message ?? "",
      ai_response: payload.ai_response ?? "",
      ip: payload.ip ?? "",
      tenant_name: tenantName,
      chat_log_id: payload.chat_log_id ?? null,
      created_at: r.created_at,
      level: r.level ?? "info",
    };
  }).filter(r => !opts.type || r.type === opts.type);
}

export function countServiceRequests(db: Db): number {
  return db.get<{ n: number }>("SELECT COUNT(*) AS n FROM analytics_events WHERE event_name = 'chat_service_request'")?.n ?? 0;
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
      t.provision_status, t.provision_error,
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
  state: string | null;
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
  twilio_sid: string | null;
  variant: string | null;
  link_clicked_at: string | null;
  replied_at: string | null;
  reply_body: string | null;
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
  not_mobile: number;
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
    do_not_contact: m.get("do_not_contact") ?? 0,
    not_mobile: m.get("not_mobile") ?? 0
  };
}

/**
 * Bulk-insert prospects from CSV rows, skipping duplicates by phone.
 *
 * Normalises every phone to E.164 (+61…) before dedupe + insert, and
 * pre-tags any non-AU-mobile row as status='not_mobile' so it's never
 * surfaced to the bulk-SMS UI. Sendable mobile rows go in as 'new'.
 */
export function importProspects(
  db: Db,
  rows: Array<Omit<ProspectRow, "prospect_id" | "created_at" | "status">>
): { imported: number; skipped: number; markedNotMobile: number } {
  let imported = 0;
  let skipped = 0;
  let markedNotMobile = 0;
  for (const row of rows) {
    const normalised = row.phone ? toE164Au(row.phone) : null;
    if (normalised) {
      const existing = db.get<{ prospect_id: string }>(
        "SELECT prospect_id FROM prospects WHERE phone = ?", [normalised]
      );
      if (existing) { skipped++; continue; }
    }
    const isMobile = !!normalised && isAuMobile(normalised);
    if (!isMobile) markedNotMobile++;
    createProspect(db, {
      ...row,
      phone: normalised,
      status: isMobile ? "new" : "not_mobile"
    });
    imported++;
  }
  return { imported, skipped, markedNotMobile };
}

// ─── Outreach log ─────────────────────────────────────────────────────────────

export function createOutreachLog(
  db: Db,
  data: { prospect_id: string; channel: string; message?: string; status?: string; twilio_sid?: string; variant?: string }
): OutreachLogRow {
  const log_id = randomUUID();
  const now = new Date().toISOString();
  db.run(
    `INSERT INTO outreach_log (log_id, prospect_id, channel, message, status, sent_at, twilio_sid, variant)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [log_id, data.prospect_id, data.channel, data.message ?? null, data.status ?? "sent", now, data.twilio_sid ?? null, data.variant ?? null]
  );
  return {
    log_id,
    prospect_id: data.prospect_id,
    channel: data.channel,
    message: data.message ?? null,
    status: data.status ?? "sent",
    sent_at: now,
    twilio_sid: data.twilio_sid ?? null,
    variant: data.variant ?? null,
    link_clicked_at: null,
    replied_at: null,
    reply_body: null
  };
}

export function updateOutreachLogStatus(db: Db, twilioSid: string, status: string) {
  db.run("UPDATE outreach_log SET status = ? WHERE twilio_sid = ?", [status, twilioSid]);
}

/**
 * Mark the most-recent SMS outreach_log row for this prospect as clicked.
 * Idempotent: only sets link_clicked_at on the latest send so a re-click after
 * a re-send updates the new row, not the old one.
 */
export function markOutreachLogClickedForProspect(db: Db, prospectId: string, at: string = new Date().toISOString()): void {
  db.run(
    `UPDATE outreach_log
     SET link_clicked_at = COALESCE(link_clicked_at, ?)
     WHERE log_id = (
       SELECT log_id FROM outreach_log
       WHERE prospect_id = ? AND channel = 'sms'
       ORDER BY sent_at DESC LIMIT 1
     )`,
    [at, prospectId]
  );
}

/**
 * Lookup helper for marketing-SMS attribution. Returns the variant tag of the
 * most-recent variant-tagged SMS to this prospect, or null if none exists.
 *
 * Used at signup time (`POST /dashboard/signup`) to stamp the originating
 * variant onto the "converted" outreach_log row, so per-prospect funnel
 * analysis can answer "which variant did this signup come from?" without
 * a phone-based join. Note: `scripts/measure-variants.mjs` separately uses
 * phone-match against `tenants.created_at` for headline signup counts, so
 * this lookup is for fidelity/auditability rather than the headline metric.
 */
export function getMostRecentSmsVariantForProspect(db: Db, prospectId: string): string | null {
  const row = db.get<{ variant: string | null }>(
    `SELECT variant FROM outreach_log
     WHERE prospect_id = ? AND channel = 'sms' AND variant IS NOT NULL
     ORDER BY sent_at DESC LIMIT 1`,
    [prospectId]
  );
  return row?.variant ?? null;
}

/**
 * Record an inbound reply on the most-recent SMS outreach_log row for this
 * prospect. Body is stored verbatim (truncated to 500 chars to keep rows light).
 */
export function markOutreachLogRepliedForProspect(
  db: Db,
  prospectId: string,
  body: string,
  at: string = new Date().toISOString()
): void {
  const trimmed = body.length > 500 ? body.slice(0, 500) : body;
  db.run(
    `UPDATE outreach_log
     SET replied_at = COALESCE(replied_at, ?), reply_body = COALESCE(reply_body, ?)
     WHERE log_id = (
       SELECT log_id FROM outreach_log
       WHERE prospect_id = ? AND channel = 'sms'
       ORDER BY sent_at DESC LIMIT 1
     )`,
    [at, trimmed, prospectId]
  );
}

/**
 * Honour an inbound STOP/UNSUBSCRIBE keyword: stamp prospects.unsubscribed_at
 * (kept independent of `status` for legal record-keeping) and flip status to
 * do_not_contact so the bulk-send filter excludes them.
 */
export function markProspectUnsubscribed(
  db: Db,
  prospectId: string,
  at: string = new Date().toISOString()
): void {
  db.run(
    "UPDATE prospects SET unsubscribed_at = COALESCE(unsubscribed_at, ?), status = 'do_not_contact' WHERE prospect_id = ?",
    [at, prospectId]
  );
}

/** Export all unsubscribed prospect phone numbers (for ACMA suppression-list record-keeping). */
export function listUnsubscribedProspects(db: Db): Array<{ prospect_id: string; phone: string | null; business_name: string; unsubscribed_at: string }> {
  return db.all(
    "SELECT prospect_id, phone, business_name, unsubscribed_at FROM prospects WHERE unsubscribed_at IS NOT NULL ORDER BY unsubscribed_at DESC",
    []
  );
}

// ─── Onboarding nudge helpers ─────────────────────────────────────────────────

/**
 * Find tenants who paid (have trial_ends_at), have a provisioned number, but
 * haven't received any real calls yet. Used for automated onboarding nudge SMS.
 * Time windows are relative to trial start (trial_ends_at minus 14 days).
 */
export function getTenantsNeedingNudge(
  db: Db,
  minAgeMs: number,
  maxAgeMs: number
): TenantRow[] {
  const TRIAL_DAYS_MS = 14 * 24 * 60 * 60 * 1000;
  const oldestTrialStart = new Date(Date.now() - maxAgeMs + TRIAL_DAYS_MS).toISOString();
  const newestTrialStart = new Date(Date.now() - minAgeMs + TRIAL_DAYS_MS).toISOString();
  return db.all<TenantRow>(
    `SELECT t.* FROM tenants t
     WHERE t.active = 1
       AND t.twilio_number NOT LIKE '+PENDING%'
       AND t.trial_ends_at IS NOT NULL
       AND t.trial_ends_at >= ? AND t.trial_ends_at <= ?
       AND t.payment_status IN ('trial', 'active')
       AND NOT EXISTS (
         SELECT 1 FROM calls c WHERE c.tenant_id = t.tenant_id AND c.status IS NOT NULL AND c.is_demo = 0
       )`,
    [oldestTrialStart, newestTrialStart]
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

/**
 * Most recent stored SMS SIDs across both logs, newest first.
 *
 * Used to work out which provider actually sent recent messages, which can
 * differ from the configured one — see summariseActualProvider().
 */
export function listRecentSmsSids(db: Db, limit = 25): string[] {
  return db.all<{ twilio_sid: string }>(
    `SELECT twilio_sid, sent_at FROM (
       SELECT twilio_sid, sent_at FROM tenant_sms_log WHERE twilio_sid IS NOT NULL AND twilio_sid <> ''
       UNION ALL
       SELECT twilio_sid, sent_at FROM outreach_log   WHERE twilio_sid IS NOT NULL AND twilio_sid <> ''
     )
     ORDER BY sent_at DESC
     LIMIT ?`,
    [limit]
  ).map((r) => r.twilio_sid);
}

export function listOutreachForProspect(db: Db, prospectId: string): OutreachLogRow[] {
  return db.all<OutreachLogRow>(
    "SELECT * FROM outreach_log WHERE prospect_id = ? ORDER BY sent_at DESC",
    [prospectId]
  );
}

/**
 * The number the caller rang from.
 *
 * Kept separate from `leads.phone`, which is the number the caller *gave*. They
 * are different things: a caller can ring from a landline and ask to be called
 * back on a mobile, and a caller who declines to give a number at all still
 * arrives with a caller ID. The owner SMS uses this as a labelled fallback.
 */
export function getCallFromNumber(db: Db, callId: string): string | null {
  return db.get<{ from_number: string | null }>(
    "SELECT from_number FROM calls WHERE call_id = ?",
    [callId]
  )?.from_number ?? null;
}

export function getCallsByFromNumber(db: Db, phone: string): CallRow[] {
  return db.all<CallRow>(
    "SELECT * FROM calls WHERE from_number = ? ORDER BY started_at DESC",
    [phone]
  );
}

export function getTenantByOwnerPhone(db: Db, phone: string): TenantRow | null {
  return db.get<TenantRow>("SELECT * FROM tenants WHERE owner_phone = ? LIMIT 1", [phone]) ?? null;
}

export function getProspectByPhone(db: Db, phone: string): ProspectRow | null {
  return db.get<ProspectRow>("SELECT * FROM prospects WHERE phone = ? LIMIT 1", [phone]) ?? null;
}

// ─── Chat logs ──────────────────────────────────────────────────────────────

export type ChatLogRow = {
  chat_id: string;
  tenant_id: string | null;
  ip_address: string | null;
  user_message: string;
  ai_response: string | null;
  created_at: string;
};

export function insertChatLog(
  db: Db,
  opts: { tenantId?: string | null; ip?: string | null; userMessage: string; aiResponse?: string | null }
): string {
  const id = randomUUID();
  db.run(
    `INSERT INTO chat_logs (chat_id, tenant_id, ip_address, user_message, ai_response, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, opts.tenantId ?? null, opts.ip ?? null, opts.userMessage, opts.aiResponse ?? null, new Date().toISOString()]
  );
  return id;
}

export function updateChatLogResponse(db: Db, chatId: string, aiResponse: string): void {
  db.run("UPDATE chat_logs SET ai_response = ? WHERE chat_id = ?", [aiResponse, chatId]);
}

export function listChatLogs(
  db: Db,
  opts: { limit?: number; offset?: number; tenantId?: string; search?: string } = {}
): ChatLogRow[] {
  const conditions: string[] = [];
  const params: any[] = [];

  if (opts.tenantId) {
    conditions.push("c.tenant_id = ?");
    params.push(opts.tenantId);
  }
  if (opts.search) {
    conditions.push("(LOWER(c.user_message) LIKE LOWER(?) OR LOWER(c.ai_response) LIKE LOWER(?))");
    const s = `%${opts.search}%`;
    params.push(s, s);
  }

  const where = conditions.length ? "WHERE " + conditions.join(" AND ") : "";
  const limit = opts.limit ?? 100;
  const offset = opts.offset ?? 0;

  return db.all<ChatLogRow>(
    `SELECT c.*, t.name AS tenant_name FROM chat_logs c
     LEFT JOIN tenants t ON t.tenant_id = c.tenant_id
     ${where}
     ORDER BY c.created_at DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
}

export function countChatLogs(db: Db): number {
  return db.get<{ n: number }>("SELECT COUNT(*) AS n FROM chat_logs")?.n ?? 0;
}

// ─── Tenant SMS log ──────────────────────────────────────────────────────────

export type TenantSmsRow = {
  sms_id: string;
  tenant_id: string;
  to_phone: string;
  body: string;
  status: string;
  twilio_sid: string | null;
  sent_at: string;
};

export function logTenantSms(
  db: Db,
  data: { tenant_id: string; to_phone: string; body: string; status?: string; twilio_sid?: string }
): void {
  db.run(
    `INSERT INTO tenant_sms_log (sms_id, tenant_id, to_phone, body, status, twilio_sid, sent_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [randomUUID(), data.tenant_id, data.to_phone, data.body, data.status ?? "sent", data.twilio_sid ?? null, new Date().toISOString()]
  );
}

export function listTenantSmsLog(db: Db, tenantId: string, limit = 20): TenantSmsRow[] {
  return db.all<TenantSmsRow>(
    `SELECT * FROM tenant_sms_log WHERE tenant_id = ? ORDER BY sent_at DESC LIMIT ?`,
    [tenantId, limit]
  );
}
