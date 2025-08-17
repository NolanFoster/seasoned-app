/**
 * Test script to test HTML fetching and see what's actually being processed
 */

const TEST_URL = 'https://whatscookingamerica.net/bksalpiccata.htm';

async function testHtmlFetch() {
  console.log('🧪 Testing HTML fetching from live site\n');
  console.log('URL:', TEST_URL);
  
  try {
    // Fetch the HTML content
    const response = await fetch(TEST_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const html = await response.text();
    console.log('✅ HTML fetched successfully');
    console.log('HTML length:', html.length);
    
    // Check for JSON-LD scripts
    const jsonLdMatches = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
    
    if (!jsonLdMatches || jsonLdMatches.length === 0) {
      console.log('❌ No JSON-LD scripts found in HTML');
      return;
    }
    
    console.log(`✅ Found ${jsonLdMatches.length} JSON-LD script(s)`);
    
    // Check the first JSON-LD script
    const firstScript = jsonLdMatches[0];
    console.log('\nFirst JSON-LD script (first 500 chars):');
    console.log(firstScript.substring(0, 500) + '...');
    
    // Try to parse the JSON content
    try {
      const jsonContent = firstScript.replace(/<script[^>]*type=["']application\/ld\+json["'][^>]*>/i, '')
                                   .replace(/<\/script>/i, '')
                                   .trim();
      
      console.log('\nJSON content (first 500 chars):');
      console.log(jsonContent.substring(0, 500) + '...');
      
      const jsonLd = JSON.parse(jsonContent);
      console.log('\n✅ JSON-LD parsed successfully');
      console.log('Structure:', {
        hasType: !!jsonLd['@type'],
        type: jsonLd['@type'],
        hasGraph: !!jsonLd['@graph'],
        graphLength: jsonLd['@graph']?.length || 0
      });
      
      // Look for Recipe objects
      if (jsonLd['@graph'] && Array.isArray(jsonLd['@graph'])) {
        const recipe = jsonLd['@graph'].find(item => 
          item['@type'] === 'Recipe' || 
          (Array.isArray(item['@type']) && item['@type'].includes('Recipe'))
        );
        
        if (recipe) {
          console.log('\n✅ Found Recipe object in @graph');
          console.log('Recipe structure:', {
            name: recipe.name,
            hasImage: !!recipe.image,
            imageType: typeof recipe.image,
            imageValue: recipe.image,
            hasIngredients: !!recipe.recipeIngredient,
            ingredientCount: recipe.recipeIngredient?.length || 0,
            hasInstructions: !!recipe.recipeInstructions,
            instructionCount: recipe.recipeInstructions?.length || 0
          });
        } else {
          console.log('\n❌ No Recipe object found in @graph');
        }
      }
      
    } catch (parseError) {
      console.error('❌ Error parsing JSON-LD:', parseError.message);
    }
    
  } catch (error) {
    console.error('❌ Error fetching HTML:', error.message);
  }
}

// Run the test
testHtmlFetch();
