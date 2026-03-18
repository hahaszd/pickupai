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
  tenant_id     TEXT REFERENCES tenants(tenant_id),
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
  tenant_id      TEXT REFERENCES tenants(tenant_id),
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
  )`
];
