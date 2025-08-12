-- Clean migration script to replace old schema with new Google Recipe schema
-- This will remove old columns and create a clean new structure

-- Drop existing table completely
DROP TABLE IF EXISTS recipes;

-- Create new table with Google Recipe structured data schema
CREATE TABLE recipes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    
    -- Required fields for Google Recipe
    name TEXT NOT NULL,
    image TEXT NOT NULL,
    
    -- Recommended fields for Google Recipe
    description TEXT,
    author TEXT,
    date_published TEXT,
    prep_time TEXT, -- ISO 8601 duration format
    cook_time TEXT, -- ISO 8601 duration format
    total_time TEXT, -- ISO 8601 duration format
    recipe_yield TEXT, -- Number of servings
    recipe_category TEXT,
    recipe_cuisine TEXT,
    
    -- Nutrition fields
    nutrition_calories TEXT,
    nutrition_protein TEXT,
    nutrition_fat TEXT,
    nutrition_carbohydrate TEXT,
    nutrition_fiber TEXT,
    nutrition_sugar TEXT,
    nutrition_sodium TEXT,
    nutrition_cholesterol TEXT,
    nutrition_saturated_fat TEXT,
    nutrition_trans_fat TEXT,
    nutrition_unsaturated_fat TEXT,
    nutrition_serving_size TEXT,
    
    -- Recipe content (stored as JSON)
    recipe_ingredient TEXT NOT NULL, -- JSON array as text
    recipe_instructions TEXT NOT NULL, -- JSON array as text
    
    -- Additional fields
    source_url TEXT,
    keywords TEXT, -- Comma-separated keywords
    video_url TEXT,
    aggregate_rating_value REAL,
    aggregate_rating_count INTEGER,
    review_count INTEGER,
    
    -- Metadata
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better query performance
CREATE INDEX idx_recipes_name ON recipes(name);
CREATE INDEX idx_recipes_created_at ON recipes(created_at);
CREATE INDEX idx_recipes_category ON recipes(recipe_category);
CREATE INDEX idx_recipes_cuisine ON recipes(recipe_cuisine);

-- Add unique constraint to prevent duplicates
CREATE UNIQUE INDEX idx_recipes_name_source_unique ON recipes(name, source_url); 