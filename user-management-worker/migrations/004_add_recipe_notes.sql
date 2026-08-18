-- Additive migration for private per-user recipe notes.
-- A note belongs to the user who wrote it, never to the shared recipe record in
-- the recipe-save-worker KV store, so annotating someone else's clipped recipe
-- leaves their published text untouched. Every query is scoped by user_id.
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

-- Reading one recipe's notes is the hot path; the second index backs the
-- "all of my notes, newest first" listing.
CREATE INDEX IF NOT EXISTS idx_recipe_notes_user_recipe
    ON recipe_notes(user_id, recipe_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_recipe_notes_user_created
    ON recipe_notes(user_id, created_at DESC);
