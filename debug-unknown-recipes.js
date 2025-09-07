#!/usr/bin/env node

/**
 * Debug script to examine the specific recipes that are showing as "Unknown Recipe"
 */

const SEARCH_DB_URL = 'https://recipe-search-db.nolanfoster.workers.dev';

async function debugUnknownRecipes() {
  console.log('🔍 Debugging Unknown Recipe Entries...\n');

  try {
    // Get the same search results that the recommendation worker would get
    console.log('1️⃣ Testing search with pasta query...');
    const searchResponse = await fetch(`${SEARCH_DB_URL}/api/smart-search?tags=["pasta"]&type=recipe&limit=5`);
    
    if (!searchResponse.ok) {
      throw new Error(`HTTP ${searchResponse.status}: ${searchResponse.statusText}`);
    }

    const searchData = await searchResponse.json();
    console.log(`✅ Search returned ${searchData.results.length} results\n`);

    // Test our name extraction logic on each result
    searchData.results.forEach((result, index) => {
      console.log(`🔍 Recipe ${index + 1} (ID: ${result.id}):`);
      const properties = result.properties || {};
      
      // Test our name extraction logic
      let recipeName = (properties.title && properties.title.trim()) || 
                      (properties.name && properties.name.trim()) || 
                      (properties.recipeName && properties.recipeName.trim()) ||
                      (properties.recipeTitle && properties.recipeTitle.trim());
      
      console.log(`   Title: "${properties.title}"`);
      console.log(`   Name: "${properties.name || 'N/A'}"`);
      console.log(`   RecipeName: "${properties.recipeName || 'N/A'}"`);
      console.log(`   RecipeTitle: "${properties.recipeTitle || 'N/A'}"`);
      console.log(`   After first pass: "${recipeName || 'N/A'}"`);
      
      // Test URL extraction
      if (!recipeName && properties.url) {
        console.log(`   URL: ${properties.url}`);
        try {
          const url = new URL(properties.url);
          const pathParts = url.pathname.split('/').filter(part => part.length > 0);
          console.log(`   URL path parts: ${JSON.stringify(pathParts)}`);
          
          if (pathParts.length > 0) {
            const lastPart = pathParts[pathParts.length - 1];
            console.log(`   Last path part: "${lastPart}"`);
            
            recipeName = lastPart
              .split('-')
              .map(word => word.charAt(0).toUpperCase() + word.slice(1))
              .join(' ');
            console.log(`   After URL extraction: "${recipeName}"`);
          }
        } catch (e) {
          console.log(`   URL parsing failed: ${e.message}`);
        }
      } else if (!properties.url) {
        console.log(`   No URL available`);
      }
      
      // Final result
      if (!recipeName) {
        recipeName = 'Unknown Recipe';
      }
      
      console.log(`   Final name: "${recipeName}"`);
      console.log('');
    });

  } catch (error) {
    console.error('❌ Debug failed:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

// Run the debug
debugUnknownRecipes()
  .then(() => {
    console.log('🎉 Unknown recipe debug completed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Debug failed with error:', error);
    process.exit(1);
  });

