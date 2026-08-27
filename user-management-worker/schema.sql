-- User Database Schema for User Management Worker
-- This database stores user information, authentication data, and login history

-- Initial schema for a new database. Existing databases must use the additive
-- migrations directory; this file intentionally performs no destructive drops.

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
    login_method TEXT NOT NULL CHECK (login_method IN ('OTP', 'MAGIC_LINK', 'PASSKEY')) DEFAULT 'OTP',
    success BOOLEAN NOT NULL,
    failure_reason TEXT, -- NULL if successful
    device_fingerprint TEXT, -- For device recognition
    risk_score INTEGER DEFAULT 0, -- 0-100 risk assessment
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

-- Passkey credentials. Existing databases should use migrations/001_add_passkey_credentials.sql.
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

-- Passkey events use a separate additive table so existing databases do not
-- need their legacy login history CHECK constraint rebuilt.
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

-- Culinary profiles are additive and optional. JSON columns preserve the
-- extensible profile contract while keeping one row per authenticated user.
CREATE TABLE IF NOT EXISTS user_culinary_profiles (
    user_id TEXT PRIMARY KEY,
    diet_tags TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(diet_tags)),
    hard_allergens TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(hard_allergens)),
    soft_avoids TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(soft_avoids)),
    cuisine_likes TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(cuisine_likes)),
    cuisine_dislikes TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(cuisine_dislikes)),
    spice_level INTEGER NOT NULL DEFAULT 2 CHECK (spice_level BETWEEN 0 AND 5),
    skill_level TEXT NOT NULL DEFAULT 'intermediate' CHECK (skill_level IN ('beginner', 'intermediate', 'advanced')),
    default_servings INTEGER NOT NULL DEFAULT 4 CHECK (default_servings BETWEEN 1 AND 24),
    max_cook_time_min INTEGER NOT NULL DEFAULT 60 CHECK (max_cook_time_min BETWEEN 5 AND 720),
    equipment TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(equipment)),
    nutrition_goals TEXT NOT NULL DEFAULT '{"focus":null,"targets":{}}' CHECK (json_valid(nutrition_goals)),
    units_pref TEXT NOT NULL DEFAULT 'us' CHECK (units_pref IN ('us', 'metric')),
    exclude_ingredients TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(exclude_ingredients)),
    notes_freeform TEXT NOT NULL DEFAULT '',
    consent_flags TEXT NOT NULL DEFAULT '{"learn_from_activity":false,"share_anon_evals":false}' CHECK (json_valid(consent_flags)),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_culinary_profiles_updated_at
    ON user_culinary_profiles(updated_at);

CREATE TRIGGER IF NOT EXISTS user_culinary_profiles_updated_at_trigger
    AFTER UPDATE ON user_culinary_profiles
    BEGIN
        UPDATE user_culinary_profiles SET updated_at = CURRENT_TIMESTAMP WHERE user_id = NEW.user_id;
    END;

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

-- Recent login activity view (includes OTP, magic-link, and passkey events)
CREATE VIEW IF NOT EXISTS recent_login_activity AS
WITH all_login_history AS (
    SELECT user_id, login_timestamp, ip_address, country, city,
           login_method, success, risk_score
    FROM user_login_history
    UNION ALL
    SELECT user_id, login_timestamp, ip_address, country, city,
           login_method, success, risk_score
    FROM passkey_login_history
)
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
FROM all_login_history ulh
JOIN users u ON ulh.user_id = u.user_id
WHERE ulh.login_timestamp > datetime('now', '-30 days')
ORDER BY ulh.login_timestamp DESC;

-- User statistics view (includes passkey events)
CREATE VIEW IF NOT EXISTS user_statistics AS
WITH all_login_history AS (
    SELECT user_id, login_timestamp, ip_address, country, success
    FROM user_login_history
    UNION ALL
    SELECT user_id, login_timestamp, ip_address, country, success
    FROM passkey_login_history
)
SELECT
    u.user_id,
    u.email_hash,
    u.status,
    u.account_type,
    u.created_at,
    u.last_activity_at,
    COUNT(ulh.user_id) as total_logins,
    COUNT(CASE WHEN ulh.success = TRUE THEN 1 END) as successful_logins,
    COUNT(CASE WHEN ulh.success = FALSE THEN 1 END) as failed_logins,
    MAX(ulh.login_timestamp) as last_login,
    COUNT(DISTINCT ulh.ip_address) as unique_ips,
    COUNT(DISTINCT ulh.country) as unique_countries
FROM users u
LEFT JOIN all_login_history ulh ON u.user_id = ulh.user_id
GROUP BY u.user_id, u.email_hash, u.status, u.account_type, u.created_at, u.last_activity_at;

-- Keep account activity current for passkey logins as well.
CREATE TRIGGER IF NOT EXISTS update_user_activity_passkey_trigger
    AFTER INSERT ON passkey_login_history
    BEGIN
        UPDATE users SET last_activity_at = NEW.login_timestamp WHERE user_id = NEW.user_id;
    END;

-- Pantry inventory. Existing databases should use migrations/003_add_pantry_items.sql.
CREATE TABLE IF NOT EXISTS pantry_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 200),
    quantity REAL,
    unit TEXT,
    location TEXT NOT NULL DEFAULT 'pantry' CHECK (location IN ('fridge', 'freezer', 'pantry', 'other')),
    expires_on TEXT,
    tags TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(tags)),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_pantry_items_user_expiry
    ON pantry_items(user_id, expires_on, created_at);
CREATE INDEX IF NOT EXISTS idx_pantry_items_user_location
    ON pantry_items(user_id, location);

-- Private per-user recipe notes. Existing databases should use
-- migrations/004_add_recipe_notes.sql.
CREATE TABLE IF NOT EXISTS recipe_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    recipe_id TEXT NOT NULL CHECK (length(trim(recipe_id)) BETWEEN 1 AND 200),
    recipe_title TEXT,
    body TEXT NOT NULL CHECK (length(trim(body)) BETWEEN 1 AND 4000),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_recipe_notes_user_recipe
    ON recipe_notes(user_id, recipe_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_recipe_notes_user_created
    ON recipe_notes(user_id, created_at DESC);

-- Per-user meal plan and grocery list. Existing databases should use
-- migrations/005_add_meal_plan_sync.sql.
CREATE TABLE IF NOT EXISTS meal_plans (
    user_id TEXT PRIMARY KEY,
    plan TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(plan)),
    up_next TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(up_next)),
    client_updated_at INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS grocery_lists (
    user_id TEXT PRIMARY KEY,
    items TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(items)),
    last_generated_at INTEGER,
    client_updated_at INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_meal_plans_updated_at ON meal_plans(updated_at);
CREATE INDEX IF NOT EXISTS idx_grocery_lists_updated_at ON grocery_lists(updated_at);
