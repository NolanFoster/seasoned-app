-- Additive migration for the authenticated culinary profile foundation.
-- JSON columns keep the profile extensible while D1 remains the source of truth.
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
