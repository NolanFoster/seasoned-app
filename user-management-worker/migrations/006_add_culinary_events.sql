-- Additive migration for culinary events and inferred preference learning.
-- Records implicit and explicit user culinary events (saves, cooks, ratings, tags, planner adds)
-- for users who have opted into learn_from_activity.

CREATE TABLE IF NOT EXISTS user_culinary_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    recipe_id TEXT,
    recipe_name TEXT,
    features TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(features)),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_culinary_events_user_time
    ON user_culinary_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_culinary_events_type
    ON user_culinary_events(user_id, event_type);
