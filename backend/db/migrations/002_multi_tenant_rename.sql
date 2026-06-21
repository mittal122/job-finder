-- Renames every existing single-tenant table to a _legacy suffix
-- (untouched, inert, never queried by the app again) and creates fresh
-- multi-tenant replacements with user_id NOT NULL from day one. All new
-- constraints/indexes use explicit names to avoid colliding with the
-- renamed tables' original auto-generated constraint/index names, which
-- Postgres does not rename along with the table.

ALTER TABLE candidate_profiles RENAME TO candidate_profiles_legacy;
ALTER TABLE campaigns          RENAME TO campaigns_legacy;
ALTER TABLE email_logs         RENAME TO email_logs_legacy;
ALTER TABLE app_settings       RENAME TO app_settings_legacy;
ALTER TABLE mapping_configs    RENAME TO mapping_configs_legacy;
ALTER TABLE send_history        RENAME TO send_history_legacy;
ALTER TABLE suppressions        RENAME TO suppressions_legacy;

CREATE TABLE candidate_profiles (
  user_id           UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  full_name         VARCHAR(255),
  email             VARCHAR(255),
  phone             VARCHAR(50),
  linkedin          VARCHAR(512),
  github            VARCHAR(512),
  portfolio         VARCHAR(512),
  bio               TEXT,
  skills            JSONB       DEFAULT '[]',
  projects          JSONB       DEFAULT '[]',
  experience_years  INTEGER     DEFAULT 0,
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE campaigns (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name          VARCHAR(255) NOT NULL,
  status        VARCHAR(50)  DEFAULT 'PENDING',
  total_emails  INTEGER      DEFAULT 0,
  sent_count    INTEGER      DEFAULT 0,
  failed_count  INTEGER      DEFAULT 0,
  pending_count INTEGER      DEFAULT 0,
  test_mode     INTEGER      DEFAULT 0,
  resume_path   VARCHAR(512),
  created_at    TIMESTAMPTZ  DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  DEFAULT NOW()
);
CREATE INDEX idx_campaigns_v2_user ON campaigns(user_id);

CREATE TABLE email_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  campaign_id   UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  hr_name       VARCHAR(255),
  company_name  VARCHAR(255) NOT NULL,
  email         VARCHAR(255) NOT NULL,
  job_role      VARCHAR(255),
  subject       VARCHAR(512),
  body          TEXT,
  status        VARCHAR(50)  DEFAULT 'PENDING',
  error_message TEXT,
  retry_count   INTEGER      DEFAULT 0,
  sent_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ  DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  DEFAULT NOW()
);
CREATE INDEX idx_email_logs_v2_user     ON email_logs(user_id);
CREATE INDEX idx_email_logs_v2_campaign ON email_logs(campaign_id);
CREATE INDEX idx_email_logs_v2_status   ON email_logs(status);
CREATE INDEX idx_email_logs_v2_email    ON email_logs(email);

CREATE TABLE app_settings (
  user_id UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key     VARCHAR(100) NOT NULL,
  value   TEXT,
  CONSTRAINT pk_app_settings_v2 PRIMARY KEY (user_id, key)
);

CREATE TABLE mapping_configs (
  id         SERIAL PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       VARCHAR(255) NOT NULL,
  subject    TEXT         DEFAULT '',
  body       TEXT         DEFAULT '',
  mapping    JSONB        DEFAULT '{}',
  created_at TIMESTAMPTZ  DEFAULT NOW()
);
CREATE INDEX idx_mapping_configs_v2_user ON mapping_configs(user_id);

CREATE TABLE send_history (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source          VARCHAR(50)  NOT NULL,
  session_id      VARCHAR(100),
  email           VARCHAR(255) NOT NULL,
  company         VARCHAR(255),
  subject         VARCHAR(512),
  body            TEXT,
  status          VARCHAR(50)  NOT NULL,
  error_message   TEXT,
  resume_filename VARCHAR(255),
  sent_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ  DEFAULT NOW()
);
CREATE INDEX idx_send_history_v2_user    ON send_history(user_id);
CREATE INDEX idx_send_history_v2_source  ON send_history(source);
CREATE INDEX idx_send_history_v2_status  ON send_history(status);
CREATE INDEX idx_send_history_v2_email   ON send_history(email);
CREATE INDEX idx_send_history_v2_created ON send_history(created_at);

CREATE TABLE suppressions (
  user_id    UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email      VARCHAR(255) NOT NULL,
  reason     VARCHAR(50)  DEFAULT 'unsubscribed',
  created_at TIMESTAMPTZ  DEFAULT NOW(),
  CONSTRAINT pk_suppressions_v2 PRIMARY KEY (user_id, email)
);
