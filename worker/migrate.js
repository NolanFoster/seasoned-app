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
console.log('1. Apply schema:');
console.log('   wrangler d1 execute recipe-db --file=./schema.sql');
console.log('');
console.log('2. Apply unique constraint migration:');
console.log('   wrangler d1 execute recipe-db --command="CREATE UNIQUE INDEX IF NOT EXISTS idx_recipes_name_source_unique ON recipes(name, source_url);"');
console.log('');
console.log('3. View current data:');
console.log('   wrangler d1 execute recipe-db --command="SELECT * FROM recipes;"');
console.log('');
console.log('4. Reset database:');
console.log('   wrangler d1 execute recipe-db --file=./schema.sql');
console.log('');
console.log('5. View table structure:');
console.log('   wrangler d1 execute recipe-db --command="PRAGMA table_info(recipes);"');
console.log('');
console.log('6. Count recipes:');
console.log('   wrangler d1 execute recipe-db --command="SELECT COUNT(*) as count FROM recipes;"');
console.log('');
console.log('7. Check for duplicates:');
console.log('   wrangler d1 execute recipe-db --command="SELECT name, source_url, COUNT(*) as count FROM recipes GROUP BY name, source_url HAVING COUNT(*) > 1;"');
console.log('');
console.log('8. Clean up duplicates (keep newest):');
console.log('   wrangler d1 execute recipe-db --command="DELETE FROM recipes WHERE id NOT IN (SELECT MAX(id) FROM recipes GROUP BY name, source_url);"');
console.log('');
console.log('📝 Note: Make sure you have:');
console.log('   - Created the D1 database');
console.log('   - Updated wrangler.toml with the correct database_id');
console.log('   - Are in the worker directory when running commands');
console.log('');
console.log('🔧 For development, you can also use:');
console.log('   npm run db:migrate  # Apply schema');
console.log('   npm run dev         # Start development server'); 