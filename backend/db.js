const { Pool } = require('pg');
const crypto = require('crypto');
const config = require('./config');

const pool = new Pool({ connectionString: config.databaseUrl });

const SCHEMA_SQL = `
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS candidate_profiles (
  id            SERIAL PRIMARY KEY,
  full_name     VARCHAR(255),
  email         VARCHAR(255),
  phone         VARCHAR(50),
  linkedin      VARCHAR(512),
  github        VARCHAR(512),
  portfolio     VARCHAR(512),
  bio           TEXT,
  skills        JSONB         DEFAULT '[]',
  projects      JSONB         DEFAULT '[]',
  experience_years INTEGER    DEFAULT 0,
  updated_at    TIMESTAMPTZ   DEFAULT NOW()
);

-- Seed a default profile row if none exists
INSERT INTO candidate_profiles (id) VALUES (1) ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS campaigns (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(255)  NOT NULL,
  status        VARCHAR(50)   DEFAULT 'PENDING',
  total_emails  INTEGER       DEFAULT 0,
  sent_count    INTEGER       DEFAULT 0,
  failed_count  INTEGER       DEFAULT 0,
  pending_count INTEGER       DEFAULT 0,
  test_mode     INTEGER       DEFAULT 0,
  resume_path   VARCHAR(512),
  created_at    TIMESTAMPTZ   DEFAULT NOW(),
  updated_at    TIMESTAMPTZ   DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS email_logs (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id   UUID          REFERENCES campaigns(id) ON DELETE CASCADE,
  hr_name       VARCHAR(255),
  company_name  VARCHAR(255)  NOT NULL,
  email         VARCHAR(255)  NOT NULL,
  job_role      VARCHAR(255),
  subject       VARCHAR(512),
  body          TEXT,
  status        VARCHAR(50)   DEFAULT 'PENDING',
  error_message TEXT,
  retry_count   INTEGER       DEFAULT 0,
  sent_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ   DEFAULT NOW(),
  updated_at    TIMESTAMPTZ   DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_logs_campaign ON email_logs(campaign_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_status   ON email_logs(status);
CREATE INDEX IF NOT EXISTS idx_email_logs_email    ON email_logs(email);

CREATE TABLE IF NOT EXISTS app_settings (
  key   VARCHAR(100) PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS mapping_configs (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(255) NOT NULL,
  subject    TEXT         DEFAULT '',
  body       TEXT         DEFAULT '',
  mapping    JSONB        DEFAULT '{}',
  created_at TIMESTAMPTZ  DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS send_history (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  source          VARCHAR(50)   NOT NULL,
  session_id      VARCHAR(100),
  email           VARCHAR(255)  NOT NULL,
  company         VARCHAR(255),
  subject         VARCHAR(512),
  body            TEXT,
  status          VARCHAR(50)   NOT NULL,
  error_message   TEXT,
  resume_filename VARCHAR(255),
  sent_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ   DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_send_history_source  ON send_history(source);
CREATE INDEX IF NOT EXISTS idx_send_history_status  ON send_history(status);
CREATE INDEX IF NOT EXISTS idx_send_history_email   ON send_history(email);
CREATE INDEX IF NOT EXISTS idx_send_history_created ON send_history(created_at);

CREATE TABLE IF NOT EXISTS suppressions (
  email      VARCHAR(255) PRIMARY KEY,
  reason     VARCHAR(50)  DEFAULT 'unsubscribed',
  created_at TIMESTAMPTZ  DEFAULT NOW()
);
`;

// One-time seed from an env var, only if the setting has no value yet.
// Lets .env act as a convenience for first boot / headless deployments
// without ever clobbering a value the user has since configured through
// the Settings page — unlike a previous version of this function, which
// unconditionally overwrote the DB value from env on every single boot.
async function seedSettingIfEmpty(key, envValue) {
  if (!envValue) return;
  const { rows } = await pool.query('SELECT value FROM app_settings WHERE key=$1', [key]);
  if (rows.length && rows[0].value) return;
  await pool.query(
    `INSERT INTO app_settings (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [key, envValue]
  );
}

async function initDb() {
  await pool.query(SCHEMA_SQL);
  // Migrate old gemini key → nvidia key if present
  await pool.query(`UPDATE app_settings SET key='nvidia_api_key' WHERE key='gemini_api_key'`);

  await seedSettingIfEmpty('nvidia_api_key',     process.env.NVIDIA_API_KEY);
  await seedSettingIfEmpty('gmail_address',      process.env.GMAIL_ADDRESS);
  await seedSettingIfEmpty('gmail_app_password', process.env.GMAIL_APP_PASSWORD);
  await seedSettingIfEmpty('email_delay_min',    process.env.EMAIL_DELAY_MIN);
  await seedSettingIfEmpty('email_delay_max',    process.env.EMAIL_DELAY_MAX);

  // Auto-generate a signing secret for unsubscribe links — never asked of
  // the user, generated once and persisted, exactly the kind of thing
  // that should never require manual configuration.
  await seedSettingIfEmpty('unsubscribe_secret', crypto.randomBytes(32).toString('hex'));

  console.log('Database schema ready.');
}

module.exports = { pool, initDb };
