-- Additive migration that moves the meal planner and its grocery list off the
-- browser. Both were localStorage-only, so a plan never survived a new device,
-- a reinstalled PWA, cleared site data, or a sign-in from another browser.
-- One row per user, keyed by the verified JWT subject.
--
-- client_updated_at is the millisecond timestamp of the edit as the client saw
-- it. The worker refuses a write whose timestamp predates the stored one, so a
-- stale tab reconnecting cannot roll back an edit made on another device.
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
