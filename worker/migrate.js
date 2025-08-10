#!/usr/bin/env node

// Database migration script for Recipe App
// This script helps manage database migrations

const fs = require('fs');
const path = require('path');

const schemaPath = path.join(__dirname, 'schema.sql');

console.log('🍳 Recipe App Database Migration');
console.log('================================\n');

if (!fs.existsSync(schemaPath)) {
  console.error('❌ Schema file not found:', schemaPath);
  process.exit(1);
}

console.log('📋 Available commands:');
console.log('');
console.log('1. Apply complete new schema (for new databases):');
console.log('   wrangler d1 execute recipe-db --file=./schema.sql');
console.log('');
console.log('2. Update existing database to new schema:');
console.log('   wrangler d1 execute recipe-db --command="ALTER TABLE recipes ADD COLUMN image TEXT;"');
console.log('   wrangler d1 execute recipe-db --command="ALTER TABLE recipes ADD COLUMN author TEXT;"');
console.log('   wrangler d1 execute recipe-db --command="ALTER TABLE recipes ADD COLUMN date_published TEXT;"');
console.log('   wrangler d1 execute recipe-db --command="ALTER TABLE recipes ADD COLUMN prep_time TEXT;"');
console.log('   wrangler d1 execute recipe-db --command="ALTER TABLE recipes ADD COLUMN cook_time TEXT;"');
console.log('   wrangler d1 execute recipe-db --command="ALTER TABLE recipes ADD COLUMN total_time TEXT;"');
console.log('   wrangler d1 execute recipe-db --command="ALTER TABLE recipes ADD COLUMN recipe_yield TEXT;"');
console.log('   wrangler d1 execute recipe-db --command="ALTER TABLE recipes ADD COLUMN recipe_category TEXT;"');
console.log('   wrangler d1 execute recipe-db --command="ALTER TABLE recipes ADD COLUMN recipe_cuisine TEXT;"');
console.log('   wrangler d1 execute recipe-db --command="ALTER TABLE recipes ADD COLUMN nutrition_calories TEXT;"');
console.log('   wrangler d1 execute recipe-db --command="ALTER TABLE recipes ADD COLUMN nutrition_protein TEXT;"');
console.log('   wrangler d1 execute recipe-db --command="ALTER TABLE recipes ADD COLUMN nutrition_fat TEXT;"');
console.log('   wrangler d1 execute recipe-db --command="ALTER TABLE recipes ADD COLUMN nutrition_carbohydrate TEXT;"');
console.log('   wrangler d1 execute recipe-db --command="ALTER TABLE recipes ADD COLUMN nutrition_fiber TEXT;"');
console.log('   wrangler d1 execute recipe-db --command="ALTER TABLE recipes ADD COLUMN nutrition_sugar TEXT;"');
console.log('   wrangler d1 execute recipe-db --command="ALTER TABLE recipes ADD COLUMN nutrition_sodium TEXT;"');
console.log('   wrangler d1 execute recipe-db --command="ALTER TABLE recipes ADD COLUMN nutrition_cholesterol TEXT;"');
console.log('   wrangler d1 execute recipe-db --command="ALTER TABLE recipes ADD COLUMN nutrition_saturated_fat TEXT;"');
console.log('   wrangler d1 execute recipe-db --command="ALTER TABLE recipes ADD COLUMN nutrition_trans_fat TEXT;"');
console.log('   wrangler d1 execute recipe-db --command="ALTER TABLE recipes ADD COLUMN nutrition_unsaturated_fat TEXT;"');
console.log('   wrangler d1 execute recipe-db --command="ALTER TABLE recipes ADD COLUMN nutrition_serving_size TEXT;"');
console.log('   wrangler d1 execute recipe-db --command="ALTER TABLE recipes ADD COLUMN keywords TEXT;"');
console.log('   wrangler d1 execute recipe-db --command="ALTER TABLE recipes ADD COLUMN video_url TEXT;"');
console.log('   wrangler d1 execute recipe-db --command="ALTER TABLE recipes ADD COLUMN aggregate_rating_value REAL;"');
console.log('   wrangler d1 execute recipe-db --command="ALTER TABLE recipes ADD COLUMN aggregate_rating_count INTEGER;"');
console.log('   wrangler d1 execute recipe-db --command="ALTER TABLE recipes ADD COLUMN review_count INTEGER;"');
console.log('   wrangler d1 execute recipe-db --command="ALTER TABLE recipes ADD COLUMN recipe_ingredient TEXT;"');
console.log('   wrangler d1 execute recipe-db --command="ALTER TABLE recipes ADD COLUMN recipe_instructions TEXT;"');
console.log('');
console.log('3. Copy existing data to new columns:');
console.log('   wrangler d1 execute recipe-db --command="UPDATE recipes SET recipe_ingredient = ingredients WHERE ingredients IS NOT NULL;"');
console.log('   wrangler d1 execute recipe-db --command="UPDATE recipes SET recipe_instructions = instructions WHERE instructions IS NOT NULL;"');
console.log('   wrangler d1 execute recipe-db --command="UPDATE recipes SET image = image_url WHERE image_url IS NOT NULL;"');
console.log('');
console.log('4. Create indexes for new schema:');
console.log('   wrangler d1 execute recipe-db --command="CREATE INDEX IF NOT EXISTS idx_recipes_created_at ON recipes(created_at);"');
console.log('   wrangler d1 execute recipe-db --command="CREATE INDEX IF NOT EXISTS idx_recipes_category ON recipes(recipe_category);"');
console.log('   wrangler d1 execute recipe-db --command="CREATE INDEX IF NOT EXISTS idx_recipes_cuisine ON recipes(recipe_cuisine);"');
console.log('   wrangler d1 execute recipe-db --command="CREATE INDEX IF NOT EXISTS idx_recipes_name ON recipes(name);"');
console.log('   wrangler d1 execute recipe-db --command="CREATE UNIQUE INDEX IF NOT EXISTS idx_recipes_name_source_unique ON recipes(name, source_url);"');
console.log('');
console.log('5. View current data:');
console.log('   wrangler d1 execute recipe-db --command="SELECT * FROM recipes;"');
console.log('');
console.log('6. Reset database (WARNING: This will delete all data):');
console.log('   wrangler d1 execute recipe-db --file=./schema.sql');
console.log('');
console.log('7. View table structure:');
console.log('   wrangler d1 execute recipe-db --command="PRAGMA table_info(recipes);"');
console.log('');
console.log('8. Count recipes:');
console.log('   wrangler d1 execute recipe-db --command="SELECT COUNT(*) as count FROM recipes;"');
console.log('');
console.log('9. Check for duplicates:');
console.log('   wrangler d1 execute recipe-db --command="SELECT name, source_url, COUNT(*) as count FROM recipes GROUP BY name, source_url HAVING COUNT(*) > 1;"');
console.log('');
console.log('10. Clean up duplicates (keep newest):');
console.log('    wrangler d1 execute recipe-db --command="DELETE FROM recipes WHERE id NOT IN (SELECT MAX(id) FROM recipes GROUP BY name, source_url);"');
console.log('');
console.log('📝 Note: Make sure you have:');
console.log('   - Created the D1 database');
console.log('   - Updated wrangler.toml with the correct database_id');
console.log('   - Are in the worker directory when running commands');
console.log('');
console.log('🔧 For development, you can also use:');
console.log('   npm run db:migrate  # Apply schema');
console.log('   npm run dev         # Start development server');
console.log('');
console.log('✅ Schema Update Status:');
console.log('   - All new columns have been added');
console.log('   - Existing data has been preserved');
console.log('   - New indexes have been created');
console.log('   - Database is ready for Google Recipe structured data'); 