-- Identity Schema: Manages user accounts and authentication tokens.
-- Privacy principle: Email and password_hash are ONLY stored here.
-- Other services receive only user_id — never PII.

-- Users table: stores credentials and account status
CREATE TABLE IF NOT EXISTS identity_schema.users (
    id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    email         VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT         NOT NULL,    -- bcrypt hash, never plain text
    is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON identity_schema.users (email);

-- Auto-update updated_at on any UPDATE to users
CREATE OR REPLACE FUNCTION identity_schema.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_users_updated_at ON identity_schema.users;
CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON identity_schema.users
  FOR EACH ROW EXECUTE FUNCTION identity_schema.set_updated_at();

-- Refresh tokens: opaque long-lived tokens stored as SHA-256 hashes.
-- Plaintext tokens are never persisted — only their hash.
CREATE TABLE IF NOT EXISTS identity_schema.refresh_tokens (
    id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID         NOT NULL REFERENCES identity_schema.users(id) ON DELETE CASCADE,
    token_hash TEXT         UNIQUE NOT NULL,   -- SHA-256 of the raw refresh token
    expires_at TIMESTAMPTZ  NOT NULL,
    revoked    BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON identity_schema.refresh_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON identity_schema.refresh_tokens (token_hash);
-- Clean up query: find expired+revoked tokens for background purge
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires ON identity_schema.refresh_tokens (expires_at);

-- Audit log: tracks significant auth events for security monitoring.
-- NO passwords, tokens, or PII stored here — only event type and outcome.
CREATE TABLE IF NOT EXISTS identity_schema.audit_logs (
    id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID         REFERENCES identity_schema.users(id) ON DELETE SET NULL,
    event_type VARCHAR(50)  NOT NULL,   -- 'signup', 'login', 'login_failed', 'logout', 'token_refresh'
    success    BOOLEAN      NOT NULL DEFAULT TRUE,
    ip_address INET,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user    ON identity_schema.audit_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_event   ON identity_schema.audit_logs (event_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON identity_schema.audit_logs (created_at DESC);

-- Password reset tokens: one-time use, expire after 1 hour.
CREATE TABLE IF NOT EXISTS identity_schema.password_reset_tokens (
    id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID         NOT NULL REFERENCES identity_schema.users(id) ON DELETE CASCADE,
    token_hash TEXT         UNIQUE NOT NULL,   -- SHA-256 of the emailed reset token
    expires_at TIMESTAMPTZ  NOT NULL,
    used_at    TIMESTAMPTZ,                    -- NULL = not yet used
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reset_tokens_user    ON identity_schema.password_reset_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_reset_tokens_expires ON identity_schema.password_reset_tokens (expires_at);
