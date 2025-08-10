-- Recipe database schema
CREATE TABLE IF NOT EXISTS recipes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    ingredients TEXT NOT NULL, -- JSON array as text
    instructions TEXT NOT NULL, -- JSON array as text
    image_url TEXT,
    source_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_recipes_name ON recipes(name);
CREATE INDEX IF NOT EXISTS idx_recipes_created_at ON recipes(created_at);

-- Add unique constraint to prevent duplicates
CREATE UNIQUE INDEX IF NOT EXISTS idx_recipes_name_source_unique ON recipes(name, source_url); 