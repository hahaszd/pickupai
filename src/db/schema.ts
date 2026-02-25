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
  )`
];
