-- Additive migration for passkey credential storage.
-- Apply this migration to each existing D1 environment. Do not run schema.sql
-- against a populated database because that file contains DROP TABLE statements.

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

CREATE INDEX IF NOT EXISTS idx_passkey_credentials_user_id
    ON passkey_credentials(user_id);
CREATE INDEX IF NOT EXISTS idx_passkey_credentials_created_at
    ON passkey_credentials(created_at);

-- Keep passkey audit events separate from the legacy table's restrictive CHECK
-- constraint. This lets the migration remain additive for existing databases.
CREATE TABLE IF NOT EXISTS passkey_login_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    login_timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    ip_address TEXT,
    user_agent TEXT,
    location_data TEXT,
    country TEXT,
    region TEXT,
    city TEXT,
    latitude REAL,
    longitude REAL,
    timezone TEXT,
    login_method TEXT NOT NULL CHECK (login_method = 'PASSKEY'),
    success BOOLEAN NOT NULL,
    failure_reason TEXT,
    device_fingerprint TEXT,
    risk_score INTEGER DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_passkey_login_history_user_id
    ON passkey_login_history(user_id);
CREATE INDEX IF NOT EXISTS idx_passkey_login_history_timestamp
    ON passkey_login_history(login_timestamp);

-- Refresh analytics views so passkey events are visible on databases that had
-- the original OTP-only views already installed.
DROP VIEW IF EXISTS recent_login_activity;
CREATE VIEW recent_login_activity AS
WITH all_login_history AS (
    SELECT user_id, login_timestamp, ip_address, country, city, login_method, success, risk_score
    FROM user_login_history
    UNION ALL
    SELECT user_id, login_timestamp, ip_address, country, city, login_method, success, risk_score
    FROM passkey_login_history
)
SELECT ulh.user_id, u.email_hash, ulh.login_timestamp, ulh.ip_address,
       ulh.country, ulh.city, ulh.login_method, ulh.success, ulh.risk_score
FROM all_login_history ulh
JOIN users u ON ulh.user_id = u.user_id
WHERE ulh.login_timestamp > datetime('now', '-30 days')
ORDER BY ulh.login_timestamp DESC;

DROP VIEW IF EXISTS user_statistics;
CREATE VIEW user_statistics AS
WITH all_login_history AS (
    SELECT user_id, login_timestamp, ip_address, country, success FROM user_login_history
    UNION ALL
    SELECT user_id, login_timestamp, ip_address, country, success FROM passkey_login_history
)
SELECT u.user_id, u.email_hash, u.status, u.account_type, u.created_at,
       u.last_activity_at, COUNT(ulh.user_id) AS total_logins,
       COUNT(CASE WHEN ulh.success = TRUE THEN 1 END) AS successful_logins,
       COUNT(CASE WHEN ulh.success = FALSE THEN 1 END) AS failed_logins,
       MAX(ulh.login_timestamp) AS last_login,
       COUNT(DISTINCT ulh.ip_address) AS unique_ips,
       COUNT(DISTINCT ulh.country) AS unique_countries
FROM users u
LEFT JOIN all_login_history ulh ON u.user_id = ulh.user_id
GROUP BY u.user_id, u.email_hash, u.status, u.account_type, u.created_at, u.last_activity_at;

CREATE TRIGGER IF NOT EXISTS update_user_activity_passkey_trigger
    AFTER INSERT ON passkey_login_history
    BEGIN
        UPDATE users SET last_activity_at = NEW.login_timestamp WHERE user_id = NEW.user_id;
    END;
