-- Append-only, user-scoped pantry outflow ledger (#585).
-- pantry_items remains the materialized current snapshot; every confirmed
-- cook/waste operation is recorded here before the snapshot is updated.
CREATE TABLE IF NOT EXISTS pantry_ledger_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('debit_cook', 'debit_waste', 'adjust')),
    recipe_id TEXT,
    cook_session_id TEXT,
    lines TEXT NOT NULL CHECK (json_valid(lines)),
    source TEXT NOT NULL CHECK (source IN ('navigator', 'workflow', 'meal_log', 'pantry')),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    UNIQUE (user_id, cook_session_id)
);

CREATE INDEX IF NOT EXISTS idx_pantry_ledger_user_time
    ON pantry_ledger_events(user_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_pantry_ledger_user_recipe
    ON pantry_ledger_events(user_id, recipe_id);
