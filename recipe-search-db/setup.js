#!/usr/bin/env node

// Setup script for Recipe Search Database
// This script helps set up the D1 database for graph-based search

console.log('🚀 Recipe Search Database Setup\n');

console.log('1. Create D1 Database:');
console.log('   wrangler d1 create recipe-search-db\n');

console.log('2. Update wrangler.toml:');
console.log('   - Copy the database_id from step 1');
console.log('   - Paste it in the database_id field in wrangler.toml\n');

console.log('3. Initialize Database Schema:');
console.log('   wrangler d1 execute recipe-search-db --file=./schema.sql\n');

console.log('4. Verify Setup:');
console.log('   wrangler d1 execute recipe-search-db --command="PRAGMA table_info(nodes);"');
console.log('   wrangler d1 execute recipe-search-db --command="PRAGMA table_info(edges);"');
console.log('   wrangler d1 execute recipe-search-db --command="PRAGMA table_info(metadata);"\n');

console.log('5. Test with Sample Data:');
console.log('   node test-example.js\n');

console.log('6. Run Tests:');
console.log('   node test-search-db.js\n');

console.log('📚 Database Structure:');
console.log('   - nodes: Entities (recipes, ingredients, categories)');
console.log('   - edges: Relationships between entities');
console.log('   - metadata: Versioning and status tracking');
console.log('   - nodes_fts: Full-text search index\n');

console.log('🔍 Search Capabilities:');
console.log('   - Full-text search on node properties');
console.log('   - Graph traversal via edges');
console.log('   - Type-based filtering');
console.log('   - Versioning and soft deletes\n');

console.log('💡 Example Usage:');
console.log('   - Recipe → Ingredient nodes → HAS_INGREDIENT edges');
console.log('   - Category → Recipe nodes → BELONGS_TO edges');
console.log('   - Search recipes by ingredient names');
console.log('   - Find related recipes via shared ingredients');
