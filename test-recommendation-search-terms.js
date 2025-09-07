#!/usr/bin/env node

/**
 * Test script to check what search terms the recommendation worker generates
 */

const RECOMMENDATION_WORKER_URL = 'https://recipe-recommendation-worker.nolanfoster.workers.dev';

async function testRecommendationSearchTerms() {
  console.log('🔍 Testing Recommendation Worker Search Terms...\n');

  try {
    // Test the same request that was showing "Unknown Recipe"
    console.log('1️⃣ Making recommendation request...');
    const response = await fetch(`${RECOMMENDATION_WORKER_URL}/recommendations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        location: 'San Francisco, CA',
        date: '2024-01-15',
        limit: 3
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    console.log('✅ Recommendation request successful\n');

    // Look for any "Unknown Recipe" entries and examine their details
    if (data.recommendations) {
      Object.entries(data.recommendations).forEach(([categoryName, recipes]) => {
        console.log(`📂 Category: ${categoryName}`);
        
        recipes.forEach((recipe, index) => {
          if (recipe.name === 'Unknown Recipe') {
            console.log(`\n🔍 Unknown Recipe ${index + 1}:`);
            console.log(`   ID: ${recipe.id}`);
            console.log(`   Description: ${recipe.description ? recipe.description.substring(0, 100) + '...' : 'None'}`);
            console.log(`   Source: ${recipe.source}`);
            console.log(`   Source URL: ${recipe.source_url || 'None'}`);
            console.log(`   Ingredients: ${recipe.ingredients ? recipe.ingredients.length : 0} items`);
            
            // Test URL extraction on this specific recipe
            if (recipe.source_url) {
              console.log(`   Testing URL extraction:`);
              try {
                const url = new URL(recipe.source_url);
                const pathParts = url.pathname.split('/').filter(part => part.length > 0);
                console.log(`   URL: ${recipe.source_url}`);
                console.log(`   Path parts: ${JSON.stringify(pathParts)}`);
                
                if (pathParts.length > 0) {
                  const lastPart = pathParts[pathParts.length - 1];
                  const extractedName = lastPart
                    .split('-')
                    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                    .join(' ');
                  console.log(`   Extracted name: "${extractedName}"`);
                }
              } catch (e) {
                console.log(`   URL parsing failed: ${e.message}`);
              }
            }
          } else {
            console.log(`   ${index + 1}. ${recipe.name} (${recipe.source})`);
          }
        });
        console.log('');
      });
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

// Run the test
testRecommendationSearchTerms()
  .then(() => {
    console.log('🎉 Recommendation search terms test completed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Test failed with error:', error);
    process.exit(1);
  });

