-- Additive migration for the authenticated manual pantry MVP.
-- Pantry rows are always scoped by user_id in the worker service.
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
