#!/usr/bin/env node

/**
 * Debug script to examine the actual search results structure
 */

const SEARCH_DB_URL = 'https://recipe-search-db.nolanfoster.workers.dev';

async function debugSearchResults() {
  console.log('🔍 Debugging Search Results Structure...\n');

  try {
    // Test search functionality and examine the response structure
    console.log('1️⃣ Testing search with detailed response analysis...');
    const searchResponse = await fetch(`${SEARCH_DB_URL}/api/smart-search?tags=["pasta"]&type=recipe&limit=3`);
    
    if (!searchResponse.ok) {
      throw new Error(`HTTP ${searchResponse.status}: ${searchResponse.statusText}`);
    }

    const searchData = await searchResponse.json();
    console.log(`✅ Search returned ${searchData.results.length} results`);
    console.log(`   Strategy: ${searchData.strategy}`);
    console.log(`   Similarity Score: ${searchData.similarityScore}`);
    console.log(`   Query: ${searchData.query}`);
    
    // Examine the full response structure
    console.log('\n📋 Full Search Response Structure:');
    console.log(JSON.stringify(searchData, null, 2));
    
    console.log('\n📋 Individual Result Analysis:');
    searchData.results.forEach((result, index) => {
      console.log(`\n🔍 Result ${index + 1}:`);
      console.log(`   ID: ${result.id}`);
      console.log(`   Type: ${result.type}`);
      console.log(`   Has Properties: ${!!result.properties}`);
      console.log(`   Properties Keys: ${result.properties ? Object.keys(result.properties).join(', ') : 'None'}`);
      
      if (result.properties) {
        console.log(`   Properties Structure:`);
        Object.entries(result.properties).forEach(([key, value]) => {
          if (typeof value === 'string') {
            console.log(`      ${key}: "${value.substring(0, 100)}${value.length > 100 ? '...' : ''}"`);
          } else if (Array.isArray(value)) {
            console.log(`      ${key}: [${value.length} items] - ${JSON.stringify(value.slice(0, 3))}${value.length > 3 ? '...' : ''}`);
          } else {
            console.log(`      ${key}: ${typeof value} = ${JSON.stringify(value)}`);
          }
        });
        
        // Check for name fields specifically
        const nameFields = ['title', 'name', 'recipeName', 'recipeTitle'];
        const foundNameFields = nameFields.filter(field => result.properties[field]);
        
        if (foundNameFields.length > 0) {
          console.log(`   ✅ Name fields found: ${foundNameFields.join(', ')}`);
          foundNameFields.forEach(field => {
            console.log(`      ${field}: "${result.properties[field]}"`);
          });
        } else {
          console.log(`   ❌ No name fields found`);
        }
      } else {
        console.log(`   ❌ No properties object`);
      }
    });

  } catch (error) {
    console.error('❌ Debug failed:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

// Run the debug
debugSearchResults()
  .then(() => {
    console.log('\n🎉 Search results debug completed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Debug failed with error:', error);
    process.exit(1);
  });

