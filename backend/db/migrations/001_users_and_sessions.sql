CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255),
  google_id     VARCHAR(255) UNIQUE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE sessions (
  id         VARCHAR(64) PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sessions_user ON sessions(user_id);

-- Truly app-wide config (not per-user) — currently just the HMAC secret
-- used to sign unsubscribe tokens. Its job is to prevent forgery of a
-- (user_id, email) payload; it doesn't need to differ per user, and a
-- single global secret avoids a chicken-and-egg problem for brand-new
-- accounts that have no settings configured yet.
CREATE TABLE app_config (
  key   VARCHAR(100) PRIMARY KEY,
  value TEXT
);
