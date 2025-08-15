// Test script for JSON-LD extraction
import fetch from 'node-fetch';

// Test URLs known to have JSON-LD recipe data
const testUrls = [
  'https://www.allrecipes.com/recipe/222000/spaghetti-aglio-e-olio/',
  'https://www.foodnetwork.com/recipes/alton-brown/good-eats-roast-turkey-recipe-1950271',
  'https://www.seriouseats.com/recipes/2011/12/serious-eats-halal-cart-style-chicken-and-rice-white-sauce-recipe.html',
  'https://www.bonappetit.com/recipe/bas-best-chocolate-chip-cookies',
  'https://cooking.nytimes.com/recipes/1017518-chocolate-chip-cookies'
];

// Extract JSON-LD recipe data from HTML (copied from recipe-clipper.js for testing)
function extractRecipeFromJsonLd(html) {
  try {
    const jsonLdMatches = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
    
    if (!jsonLdMatches || jsonLdMatches.length === 0) {
      console.log('No JSON-LD scripts found in HTML');
      return null;
    }
    
    console.log(`Found ${jsonLdMatches.length} JSON-LD script(s)`);
    
    for (const match of jsonLdMatches) {
      try {
        const jsonContent = match.replace(/<script[^>]*type=["']application\/ld\+json["'][^>]*>/i, '')
                                 .replace(/<\/script>/i, '')
                                 .trim();
        
        if (!jsonContent) continue;
        
        const jsonLd = JSON.parse(jsonContent);
        
        // Check if it's a Recipe
        if (jsonLd['@type'] === 'Recipe' || 
            (Array.isArray(jsonLd['@type']) && jsonLd['@type'].includes('Recipe'))) {
          return jsonLd;
        }
        
        // Check if it's an array
        if (Array.isArray(jsonLd)) {
          for (const item of jsonLd) {
            if (item['@type'] === 'Recipe' || 
                (Array.isArray(item['@type']) && item['@type'].includes('Recipe'))) {
              return item;
            }
          }
        }
        
        // Check if it's a graph
        if (jsonLd['@graph'] && Array.isArray(jsonLd['@graph'])) {
          for (const item of jsonLd['@graph']) {
            if (item['@type'] === 'Recipe' || 
                (Array.isArray(item['@type']) && item['@type'].includes('Recipe'))) {
              return item;
            }
          }
        }
      } catch (parseError) {
        console.error('Error parsing JSON-LD:', parseError);
      }
    }
    
    console.log('No Recipe found in JSON-LD scripts');
    return null;
  } catch (error) {
    console.error('Error extracting JSON-LD:', error);
    return null;
  }
}

async function testJsonLdExtraction() {
  console.log('Testing JSON-LD extraction from popular recipe sites...\n');
  
  for (const url of testUrls) {
    console.log(`\nTesting: ${url}`);
    console.log('='.repeat(60));
    
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });
      
      if (!response.ok) {
        console.log(`Failed to fetch: ${response.status} ${response.statusText}`);
        continue;
      }
      
      const html = await response.text();
      console.log(`HTML fetched, length: ${html.length}`);
      
      const recipe = extractRecipeFromJsonLd(html);
      
      if (recipe) {
        console.log('✅ JSON-LD Recipe found!');
        console.log('Recipe name:', recipe.name);
        console.log('Ingredients count:', recipe.recipeIngredient?.length || 0);
        console.log('Instructions count:', recipe.recipeInstructions?.length || 0);
        console.log('Has image:', !!recipe.image);
        console.log('Has nutrition:', !!recipe.nutrition);
        console.log('Has rating:', !!recipe.aggregateRating);
      } else {
        console.log('❌ No JSON-LD Recipe found');
      }
    } catch (error) {
      console.log(`Error testing ${url}:`, error.message);
    }
  }
}

// Run the test
testJsonLdExtraction().catch(console.error);