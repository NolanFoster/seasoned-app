#!/usr/bin/env node

/**
 * Test script for KV to Search Database Migration
 * 
 * This script demonstrates how to test the migration functionality
 * and can be used to verify the migration works correctly.
 */

const BASE_URL = 'http://localhost:8787'; // Update with your worker URL

// Test the migration endpoint
async function testMigration() {
  console.log('🧪 Testing KV to Search Database Migration...\n');
  
  try {
    // Test the migration endpoint
    console.log('📡 Calling migration endpoint...');
    const response = await fetch(`${BASE_URL}/api/migrate-kv`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      }
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Migration failed: ${error.error || 'Unknown error'}`);
    }
    
    const result = await response.json();
    console.log('✅ Migration completed successfully!');
    console.log('📊 Results:', result.stats);
    
    // Test search functionality after migration
    if (result.stats.successful > 0) {
      console.log('\n🔍 Testing search functionality...');
      await testSearchAfterMigration();
    }
    
  } catch (error) {
    console.error('❌ Migration test failed:', error.message);
  }
}

// Test search functionality after migration
async function testSearchAfterMigration() {
  try {
    // Search for recipes
    const recipeSearch = await fetch(`${BASE_URL}/api/search?q=recipe&type=RECIPE`);
    if (recipeSearch.ok) {
      const recipes = await recipeSearch.json();
      console.log(`📝 Found ${recipes.results.length} recipe nodes`);
    }
    
    // Search for ingredients
    const ingredientSearch = await fetch(`${BASE_URL}/api/search?q=chicken&type=INGREDIENT`);
    if (ingredientSearch.ok) {
      const ingredients = await ingredientSearch.json();
      console.log(`🥩 Found ${ingredients.results.length} ingredient nodes`);
    }
    
    // Search for tags
    const tagSearch = await fetch(`${BASE_URL}/api/search?q=italian&type=TAG`);
    if (tagSearch.ok) {
      const tags = await tagSearch.json();
      console.log(`🏷️  Found ${tags.results.length} tag nodes`);
    }
    
    // Test graph traversal
    const nodesResponse = await fetch(`${BASE_URL}/api/nodes?type=RECIPE&limit=1`);
    if (nodesResponse.ok) {
      const nodes = await nodesResponse.json();
      if (nodes.nodes.length > 0) {
        const recipeId = nodes.nodes[0].id;
        console.log(`🔗 Testing graph traversal for recipe: ${recipeId}`);
        
        const graphResponse = await fetch(`${BASE_URL}/api/graph?node_id=${recipeId}&depth=1`);
        if (graphResponse.ok) {
          const graph = await graphResponse.json();
          console.log(`📊 Graph contains ${graph.nodes.length} nodes and ${graph.edges.length} edges`);
        }
      }
    }
    
  } catch (error) {
    console.error('❌ Search test failed:', error.message);
  }
}

// Test individual recipe migration
async function testSingleRecipeMigration() {
  console.log('\n🧪 Testing single recipe migration...');
  
  try {
    // Create a test recipe node
    const testRecipe = {
      id: 'test_recipe_migration',
      type: 'RECIPE',
      properties: {
        title: 'Test Migration Recipe',
        description: 'A test recipe for migration testing',
        ingredients: ['2 cups flour', '1 cup sugar', '3 eggs'],
        instructions: ['Mix ingredients', 'Bake at 350F'],
        tags: ['test', 'migration', 'dessert']
      }
    };
    
    // Create the recipe node
    const createResponse = await fetch(`${BASE_URL}/api/nodes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testRecipe)
    });
    
    if (createResponse.ok) {
      console.log('✅ Test recipe created successfully');
      
      // Test search for the new recipe
      const searchResponse = await fetch(`${BASE_URL}/api/search?q=test+migration`);
      if (searchResponse.ok) {
        const searchResults = await searchResponse.json();
        console.log(`🔍 Search found ${searchResults.results.length} results`);
      }
    } else {
      console.log('❌ Failed to create test recipe');
    }
    
  } catch (error) {
    console.error('❌ Single recipe test failed:', error.message);
  }
}

// Main test execution
async function runTests() {
  console.log('🚀 Starting Migration Tests\n');
  
  // Test single recipe creation first
  await testSingleRecipeMigration();
  
  // Test the migration endpoint (if you have KV data)
  console.log('\n' + '='.repeat(50));
  console.log('Note: Migration test requires KV data to be available');
  console.log('If you have recipes in KV storage, uncomment the next line');
  console.log('='.repeat(50));
  
  // Uncomment this line when you have KV data to migrate
  // await testMigration();
  
  console.log('\n✅ Migration tests completed!');
}

// Run tests if this file is executed directly
if (require.main === module) {
  runTests().catch(console.error);
}

module.exports = {
  testMigration,
  testSingleRecipeMigration,
  testSearchAfterMigration
};
