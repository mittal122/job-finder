const { Pool } = require('pg');
const config = require('./config');

const pool = new Pool({ connectionString: config.databaseUrl });

const SCHEMA_SQL = `
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS candidate_profiles (
  id            SERIAL PRIMARY KEY,
  full_name     VARCHAR(255)  DEFAULT 'Mittal Domaidya',
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
`;

async function initDb() {
  await pool.query(SCHEMA_SQL);
  // Migrate old gemini key → nvidia key if present
  await pool.query(`UPDATE app_settings SET key='nvidia_api_key' WHERE key='gemini_api_key'`);
  // Seed NVIDIA key from env — always overwrite so .env is the source of truth
  const envKey = process.env.NVIDIA_API_KEY || '';
  if (envKey) {
    await pool.query(
      `INSERT INTO app_settings (key, value) VALUES ('nvidia_api_key', $1)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [envKey]
    );
  }
  console.log('Database schema ready.');
}

module.exports = { pool, initDb };
