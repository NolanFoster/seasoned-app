-- User Database Schema for User Management Worker
-- This database stores user information, authentication data, and login history

-- Drop existing tables if they exist (for migrations)
DROP TABLE IF EXISTS user_login_history;
DROP TABLE IF EXISTS users;

-- Users table - core user information
CREATE TABLE IF NOT EXISTS users (
    user_id TEXT PRIMARY KEY, -- Hashed email (SHA-256 hash)
    email_hash TEXT UNIQUE NOT NULL, -- SHA-256 hash of email for lookups
    email_encrypted TEXT, -- Encrypted email for recovery (optional)
    status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'SUSPENDED', 'DELETED')) DEFAULT 'ACTIVE',
    account_type TEXT NOT NULL CHECK (account_type IN ('FREE', 'PREMIUM', 'ADMIN')) DEFAULT 'FREE',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_activity_at DATETIME,
    email_verified BOOLEAN DEFAULT FALSE,
    two_factor_enabled BOOLEAN DEFAULT FALSE
);

-- User login history table - comprehensive login tracking
CREATE TABLE IF NOT EXISTS user_login_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    login_timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    ip_address TEXT,
    user_agent TEXT,
    location_data TEXT, -- JSON location information
    country TEXT,
    region TEXT,
    city TEXT,
    latitude REAL,
    longitude REAL,
    timezone TEXT,
    login_method TEXT NOT NULL CHECK (login_method IN ('OTP', 'MAGIC_LINK')) DEFAULT 'OTP',
    success BOOLEAN NOT NULL,
    failure_reason TEXT, -- NULL if successful
    device_fingerprint TEXT, -- For device recognition
    risk_score INTEGER DEFAULT 0, -- 0-100 risk assessment
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

-- Create indexes for better query performance

-- Users table indexes
CREATE INDEX IF NOT EXISTS idx_users_email_hash ON users(email_hash);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_users_account_type ON users(account_type);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at);
CREATE INDEX IF NOT EXISTS idx_users_last_activity ON users(last_activity_at);

-- User login history indexes
CREATE INDEX IF NOT EXISTS idx_login_history_user_id ON user_login_history(user_id);
CREATE INDEX IF NOT EXISTS idx_login_history_timestamp ON user_login_history(login_timestamp);
CREATE INDEX IF NOT EXISTS idx_login_history_ip_address ON user_login_history(ip_address);
CREATE INDEX IF NOT EXISTS idx_login_history_location ON user_login_history(country, region, city);
CREATE INDEX IF NOT EXISTS idx_login_history_coordinates ON user_login_history(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_login_history_method ON user_login_history(login_method);
CREATE INDEX IF NOT EXISTS idx_login_history_success ON user_login_history(success);
CREATE INDEX IF NOT EXISTS idx_login_history_risk_score ON user_login_history(risk_score);

-- Composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_login_history_user_timestamp ON user_login_history(user_id, login_timestamp);
CREATE INDEX IF NOT EXISTS idx_login_history_user_success ON user_login_history(user_id, success);

-- Triggers for automatic timestamp updates
CREATE TRIGGER IF NOT EXISTS users_updated_at_trigger 
    AFTER UPDATE ON users 
    BEGIN
        UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE user_id = NEW.user_id;
    END;

-- Trigger to update user last_activity when login history is inserted
CREATE TRIGGER IF NOT EXISTS update_user_activity_trigger 
    AFTER INSERT ON user_login_history 
    BEGIN
        UPDATE users SET last_activity_at = NEW.login_timestamp WHERE user_id = NEW.user_id;
    END;

-- Create views for common queries

-- Recent login activity view
CREATE VIEW IF NOT EXISTS recent_login_activity AS
SELECT 
    ulh.user_id,
    u.email_hash,
    ulh.login_timestamp,
    ulh.ip_address,
    ulh.country,
    ulh.city,
    ulh.login_method,
    ulh.success,
    ulh.risk_score
FROM user_login_history ulh
JOIN users u ON ulh.user_id = u.user_id
WHERE ulh.login_timestamp > datetime('now', '-30 days')
ORDER BY ulh.login_timestamp DESC;

-- User statistics view
CREATE VIEW IF NOT EXISTS user_statistics AS
SELECT 
    u.user_id,
    u.email_hash,
    u.status,
    u.account_type,
    u.created_at,
    u.last_activity_at,
    COUNT(DISTINCT ulh.id) as total_logins,
    COUNT(DISTINCT CASE WHEN ulh.success = TRUE THEN ulh.id END) as successful_logins,
    COUNT(DISTINCT CASE WHEN ulh.success = FALSE THEN ulh.id END) as failed_logins,
    MAX(ulh.login_timestamp) as last_login,
    COUNT(DISTINCT ulh.ip_address) as unique_ips,
    COUNT(DISTINCT ulh.country) as unique_countries
FROM users u
LEFT JOIN user_login_history ulh ON u.user_id = ulh.user_id
GROUP BY u.user_id, u.email_hash, u.status, u.account_type, u.created_at, u.last_activity_at;
