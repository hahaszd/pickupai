export const schemaSql = `
CREATE TABLE IF NOT EXISTS tenants (
  tenant_id             TEXT PRIMARY KEY,
  name                  TEXT NOT NULL,
  trade_type            TEXT NOT NULL DEFAULT 'tradie',
  ai_name               TEXT NOT NULL DEFAULT 'Olivia',
  twilio_number         TEXT NOT NULL UNIQUE,
  owner_phone           TEXT NOT NULL,
  owner_email           TEXT,
  password_hash         TEXT,
  session_token         TEXT,
  business_hours_start  TEXT DEFAULT '08:00',
  business_hours_end    TEXT DEFAULT '17:00',
  timezone              TEXT DEFAULT 'Australia/Sydney',
  enable_warm_transfer  INTEGER DEFAULT 0,
  active                INTEGER DEFAULT 1,
  created_at            TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS calls (
  call_id       TEXT PRIMARY KEY,
  tenant_id     TEXT REFERENCES tenants(tenant_id) ON DELETE SET NULL,
  from_number   TEXT,
  to_number     TEXT,
  started_at    TEXT,
  ended_at      TEXT,
  status        TEXT,
  recording_url TEXT,
  recording_sid TEXT,
  transcript    TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS leads (
  lead_id        TEXT PRIMARY KEY,
  tenant_id      TEXT REFERENCES tenants(tenant_id) ON DELETE SET NULL,
  call_id        TEXT NOT NULL REFERENCES calls(call_id) ON DELETE CASCADE,
  name           TEXT,
  phone          TEXT,
  address        TEXT,
  issue_type     TEXT,
  issue_summary  TEXT,
  urgency_level  TEXT,
  preferred_time TEXT,
  notes          TEXT,
  confidence     REAL,
  next_action    TEXT,
  lead_status    TEXT DEFAULT 'new',
  created_at     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notifications (
  id         TEXT PRIMARY KEY,
  call_id    TEXT NOT NULL REFERENCES calls(call_id) ON DELETE CASCADE,
  channel    TEXT NOT NULL,
  sent_at    TEXT,
  status     TEXT,
  error      TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_call_channel
  ON notifications(call_id, channel);

CREATE TABLE IF NOT EXISTS analytics_events (
  event_id     TEXT PRIMARY KEY,
  event_name   TEXT NOT NULL,
  tenant_id    TEXT,
  call_id      TEXT,
  level        TEXT DEFAULT 'info',
  payload_json TEXT,
  created_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS system_config (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;

/**
 * Migration statements for existing databases.
 * Each runs individually; errors are caught and ignored if the column already exists.
 */
export const migrationStatements = [
  `ALTER TABLE calls ADD COLUMN tenant_id TEXT REFERENCES tenants(tenant_id)`,
  `ALTER TABLE leads ADD COLUMN tenant_id TEXT REFERENCES tenants(tenant_id)`,
  `ALTER TABLE leads ADD COLUMN lead_status TEXT DEFAULT 'new'`,
  `ALTER TABLE tenants ADD COLUMN service_area TEXT`,
  `ALTER TABLE tenants ADD COLUMN last_login_at TEXT`,
  `ALTER TABLE tenants ADD COLUMN payment_status TEXT DEFAULT 'none'`,
  `ALTER TABLE tenants ADD COLUMN trial_ends_at TEXT`,
  `ALTER TABLE tenants ADD COLUMN stripe_customer_id TEXT`,
  `ALTER TABLE tenants ADD COLUMN custom_instructions TEXT`,
  `ALTER TABLE leads ADD COLUMN job_value REAL`,
  // job_value is the owner-entered dollar figure summed for their ROI stat.
  // job_size is the assistant's scope estimate. They used to be one column,
  // which wrote 'medium' into a REAL and zeroed the revenue total.
  `ALTER TABLE leads ADD COLUMN job_size TEXT`,
  `ALTER TABLE tenants ADD COLUMN vacation_mode INTEGER DEFAULT 0`,
  `ALTER TABLE tenants ADD COLUMN vacation_message TEXT`,
  // Multi-user support: additional dashboard users per tenant (read-only or admin)
  `CREATE TABLE IF NOT EXISTS tenant_users (
    user_id      TEXT PRIMARY KEY,
    tenant_id    TEXT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    email        TEXT NOT NULL,
    password_hash TEXT,
    role         TEXT NOT NULL DEFAULT 'viewer',
    session_token TEXT,
    created_at   TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS demo_sessions (
    demo_number   TEXT NOT NULL PRIMARY KEY,
    tenant_id     TEXT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    assigned_at   TEXT NOT NULL,
    expires_at    TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS system_config (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS prospects (
    prospect_id       TEXT PRIMARY KEY,
    business_name     TEXT NOT NULL,
    owner_name        TEXT,
    phone             TEXT,
    email             TEXT,
    website           TEXT,
    trade_type        TEXT,
    suburb            TEXT,
    state             TEXT DEFAULT 'NSW',
    source            TEXT DEFAULT 'manual',
    status            TEXT DEFAULT 'new',
    google_rating     REAL,
    review_count      INTEGER,
    notes             TEXT,
    last_contacted_at TEXT,
    next_followup_at  TEXT,
    created_at        TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS outreach_log (
    log_id      TEXT PRIMARY KEY,
    prospect_id TEXT NOT NULL REFERENCES prospects(prospect_id) ON DELETE CASCADE,
    channel     TEXT NOT NULL,
    message     TEXT,
    status      TEXT DEFAULT 'sent',
    sent_at     TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS analytics_events (
    event_id     TEXT PRIMARY KEY,
    event_name   TEXT NOT NULL,
    tenant_id    TEXT,
    call_id      TEXT,
    level        TEXT DEFAULT 'info',
    payload_json TEXT,
    created_at   TEXT NOT NULL
  )`,
  `ALTER TABLE calls ADD COLUMN is_demo INTEGER DEFAULT 0`,
  `CREATE INDEX IF NOT EXISTS idx_calls_tenant_started ON calls(tenant_id, started_at)`,
  `CREATE INDEX IF NOT EXISTS idx_analytics_created ON analytics_events(created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_tenants_session ON tenants(session_token)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_email ON tenants(owner_email) WHERE owner_email IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS idx_leads_tenant_created ON leads(tenant_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_prospects_phone ON prospects(phone) WHERE phone IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS idx_calls_from_number ON calls(from_number) WHERE from_number IS NOT NULL`,
  `ALTER TABLE leads ADD COLUMN property_type TEXT`,
  `ALTER TABLE leads ADD COLUMN caller_sentiment TEXT`,
  // caller_intent was collected by save_lead() on every call since the tool
  // existed, used in memory to decide whether to SMS the owner, and then
  // discarded — the leads table never had a column for it. Added 2026-07-29
  // when the daily funnel's "complete captures" metric turned out to be
  // filtering on it. It is one of the four CORE_FIELDS the eval grades
  // capture quality against.
  `ALTER TABLE leads ADD COLUMN caller_intent TEXT`,
  `CREATE TABLE IF NOT EXISTS chat_logs (
    chat_id      TEXT PRIMARY KEY,
    tenant_id    TEXT,
    ip_address   TEXT,
    user_message TEXT NOT NULL,
    ai_response  TEXT,
    created_at   TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_chat_logs_created ON chat_logs(created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_chat_logs_tenant ON chat_logs(tenant_id) WHERE tenant_id IS NOT NULL`,
  `ALTER TABLE tenants ADD COLUMN provision_status TEXT DEFAULT 'none'`,
  `ALTER TABLE tenants ADD COLUMN provision_error TEXT`,
  `CREATE TABLE IF NOT EXISTS tenant_sms_log (
    sms_id     TEXT PRIMARY KEY,
    tenant_id  TEXT NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    to_phone   TEXT NOT NULL,
    body       TEXT NOT NULL,
    status     TEXT DEFAULT 'sent',
    twilio_sid TEXT,
    sent_at    TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_tenant_sms_log_tenant ON tenant_sms_log(tenant_id, sent_at)`,
  // Cancellation lifecycle: set when payment_status flips to expired/trial_expired; consumed by the daily release sweep.
  `ALTER TABLE tenants ADD COLUMN expired_at TEXT`,
  // Set when the daily release sweep deletes the Twilio number; suppresses re-release attempts.
  `ALTER TABLE tenants ADD COLUMN number_released_at TEXT`,
  `ALTER TABLE outreach_log ADD COLUMN twilio_sid TEXT`,
  // Marketing-SMS A/B testing + per-recipient attribution.
  // variant: free-form tag (e.g. "A_reply_yes", "B_call_demo") used to group
  //   sends for funnel analysis. NULL for pre-instrumented historical rows.
  // link_clicked_at / replied_at / reply_body: populated by the inbound
  //   /r/:prospectId redirect and the Mobile Message inbound webhook so we
  //   can attribute clicks and replies back to the originating SMS.
  `ALTER TABLE outreach_log ADD COLUMN variant TEXT`,
  `ALTER TABLE outreach_log ADD COLUMN link_clicked_at TEXT`,
  `ALTER TABLE outreach_log ADD COLUMN replied_at TEXT`,
  `ALTER TABLE outreach_log ADD COLUMN reply_body TEXT`,
  `CREATE INDEX IF NOT EXISTS idx_outreach_variant ON outreach_log(variant, sent_at) WHERE variant IS NOT NULL`,
  // Hard suppression timestamp. Set whenever a STOP / opt-out is processed.
  // Independent of `prospects.status` so we can prove "we honoured the opt-out
  // at <timestamp>" for ACMA record-keeping even if status changes later.
  `ALTER TABLE prospects ADD COLUMN unsubscribed_at TEXT`,
  `CREATE INDEX IF NOT EXISTS idx_prospects_unsubscribed ON prospects(unsubscribed_at) WHERE unsubscribed_at IS NOT NULL`
];
