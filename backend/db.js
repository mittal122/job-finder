const { Pool } = require('pg');
const crypto = require('crypto');
const config = require('./config');
const { runMigrations } = require('./db/migrate');

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

// One-time seed of a global (not per-user) app_config value, only if it
// has no value yet — never clobbers a value already set.
async function seedAppConfigIfEmpty(key, value) {
  if (!value) return;
  const { rows } = await pool.query('SELECT value FROM app_config WHERE key=$1', [key]);
  if (rows.length && rows[0].value) return;
  await pool.query(
    `INSERT INTO app_config (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [key, value]
  );
}

async function initDb() {
  // Baseline single-tenant schema — only runs before the multi-tenant
  // migrations have ever applied. It must NOT run again afterward: once
  // migration 002 renames e.g. candidate_profiles to
  // candidate_profiles_legacy and creates a new candidate_profiles with a
  // different shape (user_id instead of id), re-running this idempotent
  // "CREATE TABLE IF NOT EXISTS candidate_profiles (id SERIAL ...)" would
  // see a table already named candidate_profiles and skip creation, but
  // its INSERT...(id)... seed statement would still fire against the new
  // table's actual (incompatible) columns and fail. Gating on whether
  // `users` exists (created by migration 001, never touched again) is a
  // reliable proxy for "have the multi-tenant migrations already run."
  const { rows } = await pool.query(`
    SELECT 1 FROM information_schema.tables WHERE table_name = 'users'
  `);
  if (!rows.length) {
    await pool.query(SCHEMA_SQL);
  }

  await runMigrations(pool);

  // Auto-generate the unsubscribe-link signing secret — never asked of
  // the user, generated once and persisted, exactly the kind of thing
  // that should never require manual configuration.
  await seedAppConfigIfEmpty('unsubscribe_secret', crypto.randomBytes(32).toString('hex'));

  console.log('Database schema ready.');
}

module.exports = { pool, initDb };
