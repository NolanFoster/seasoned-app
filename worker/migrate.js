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
console.log('2. View current data:');
console.log('   wrangler d1 execute recipe-db --command="SELECT * FROM recipes;"');
console.log('');
console.log('3. Reset database:');
console.log('   wrangler d1 execute recipe-db --file=./schema.sql');
console.log('');
console.log('4. View table structure:');
console.log('   wrangler d1 execute recipe-db --command="PRAGMA table_info(recipes);"');
console.log('');
console.log('5. Count recipes:');
console.log('   wrangler d1 execute recipe-db --command="SELECT COUNT(*) as count FROM recipes;"');
console.log('');
console.log('📝 Note: Make sure you have:');
console.log('   - Created the D1 database');
console.log('   - Updated wrangler.toml with the correct database_id');
console.log('   - Are in the worker directory when running commands');
console.log('');
console.log('🔧 For development, you can also use:');
console.log('   npm run db:migrate  # Apply schema');
console.log('   npm run dev         # Start development server'); 