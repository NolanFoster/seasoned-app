#!/usr/bin/env node

/**
 * Debug script to examine the actual data structure in the search database
 */

const SEARCH_DB_URL = 'https://recipe-search-db.nolanfoster.workers.dev';

async function debugSearchDatabase() {
  console.log('🔍 Debugging Search Database...\n');

  try {
    // Get a few recipes to examine their structure
    console.log('1️⃣ Fetching sample recipes...');
    const response = await fetch(`${SEARCH_DB_URL}/api/nodes?type=recipe&limit=5`);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    console.log(`✅ Found ${data.nodes.length} recipes\n`);

    // Examine each recipe's properties
    data.nodes.forEach((node, index) => {
      console.log(`📋 Recipe ${index + 1} (ID: ${node.id}):`);
      console.log(`   Type: ${node.type}`);
      console.log(`   Properties keys: ${Object.keys(node.properties).join(', ')}`);
      
      // Check for name fields
      const nameFields = ['title', 'name', 'recipeName', 'recipeTitle'];
      const foundNameFields = nameFields.filter(field => node.properties[field]);
      
      if (foundNameFields.length > 0) {
        console.log(`   ✅ Name fields found: ${foundNameFields.join(', ')}`);
        foundNameFields.forEach(field => {
          console.log(`      ${field}: "${node.properties[field]}"`);
        });
      } else {
        console.log(`   ❌ No name fields found`);
        console.log(`   Available properties:`);
        Object.entries(node.properties).forEach(([key, value]) => {
          if (typeof value === 'string' && value.length > 0) {
            console.log(`      ${key}: "${value.substring(0, 100)}${value.length > 100 ? '...' : ''}"`);
          } else if (Array.isArray(value)) {
            console.log(`      ${key}: [${value.length} items]`);
          } else {
            console.log(`      ${key}: ${typeof value} = ${JSON.stringify(value)}`);
          }
        });
      }
      console.log('');
    });

    // Test search functionality
    console.log('2️⃣ Testing search functionality...');
    const searchResponse = await fetch(`${SEARCH_DB_URL}/api/smart-search?tags=["pasta"]&type=recipe&limit=3`);
    
    if (searchResponse.ok) {
      const searchData = await searchResponse.json();
      console.log(`✅ Search returned ${searchData.results.length} results`);
      console.log(`   Strategy: ${searchData.strategy}`);
      console.log(`   Similarity Score: ${searchData.similarityScore}`);
      
      if (searchData.results.length > 0) {
        console.log('\n📋 Search Results:');
        searchData.results.forEach((result, index) => {
          const nameFields = ['title', 'name', 'recipeName', 'recipeTitle'];
          const foundName = nameFields.find(field => result.properties[field]) || 'Unknown Recipe';
          console.log(`   ${index + 1}. ${foundName} (ID: ${result.id})`);
        });
      }
    } else {
      console.log(`❌ Search failed: ${searchResponse.status} ${searchResponse.statusText}`);
    }

  } catch (error) {
    console.error('❌ Debug failed:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

// Run the debug
debugSearchDatabase()
  .then(() => {
    console.log('\n🎉 Search database debug completed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Debug failed with error:', error);
    process.exit(1);
  });

