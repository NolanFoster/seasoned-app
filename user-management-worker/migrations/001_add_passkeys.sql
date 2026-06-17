-- Migration 001: Add passkey credential storage
-- Run against each environment:
--   wrangler d1 execute user-db --env preview  --file migrations/001_add_passkeys.sql
--   wrangler d1 execute user-db --env staging  --file migrations/001_add_passkeys.sql
--   wrangler d1 execute user-db --env production --file migrations/001_add_passkeys.sql

CREATE TABLE IF NOT EXISTS passkey_credentials (
    credential_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    public_key TEXT NOT NULL,
    counter INTEGER NOT NULL DEFAULT 0,
    device_type TEXT NOT NULL CHECK (device_type IN ('singleDevice', 'multiDevice')),
    backed_up INTEGER NOT NULL DEFAULT 0,
    transports TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_used_at DATETIME,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_passkeys_user_id ON passkey_credentials(user_id);
CREATE INDEX IF NOT EXISTS idx_passkeys_created_at ON passkey_credentials(created_at);
