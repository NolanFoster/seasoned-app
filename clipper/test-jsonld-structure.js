/**
 * Test script to examine the full JSON-LD structure
 */

const TEST_URL = 'https://whatscookingamerica.net/bksalpiccata.htm';

async function testJsonLdStructure() {
  console.log('🧪 Testing JSON-LD structure analysis\n');
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
    
    // Find JSON-LD scripts
    const jsonLdMatches = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
    
    if (!jsonLdMatches || jsonLdMatches.length === 0) {
      console.log('❌ No JSON-LD scripts found');
      return;
    }
    
    const jsonContent = jsonLdMatches[0].replace(/<script[^>]*type=["']application\/ld\+json["'][^>]*>/i, '')
                                         .replace(/<\/script>/i, '')
                                         .trim();
    
    const jsonLd = JSON.parse(jsonContent);
    
    console.log('✅ JSON-LD parsed successfully');
    console.log('Structure:', {
      hasType: !!jsonLd['@type'],
      type: jsonLd['@type'],
      hasGraph: !!jsonLd['@graph'],
      graphLength: jsonLd['@graph']?.length || 0
    });
    
    if (jsonLd['@graph'] && Array.isArray(jsonLd['@graph'])) {
      console.log('\n📋 @graph contents:');
      
      jsonLd['@graph'].forEach((item, index) => {
        console.log(`\nItem ${index}:`);
        console.log('  Type:', item['@type']);
        console.log('  ID:', item['@id']);
        
        if (item['@type'] === 'Recipe') {
          console.log('  Recipe details:');
          console.log('    Name:', item.name);
          console.log('    Image:', item.image);
          console.log('    Image type:', typeof item.image);
          console.log('    Has ingredients:', !!item.recipeIngredient);
          console.log('    Ingredient count:', item.recipeIngredient?.length || 0);
          console.log('    Has instructions:', !!item.recipeInstructions);
          console.log('    Instruction count:', item.recipeInstructions?.length || 0);
          
          // Check if image is referenced elsewhere
          if (item.image && typeof item.image === 'object' && item.image['@id']) {
            const imageId = item.image['@id'];
            console.log('    Image reference ID:', imageId);
            
            // Look for the referenced image object
            const imageObject = jsonLd['@graph'].find(graphItem => graphItem['@id'] === imageId);
            if (imageObject) {
              console.log('    Found referenced image object:', {
                type: imageObject['@type'],
                url: imageObject.url,
                contentUrl: imageObject.contentUrl
              });
            } else {
              console.log('    ❌ Referenced image object not found');
            }
          }
        } else if (item['@type'] === 'ImageObject') {
          console.log('  Image details:');
          console.log('    ID:', item['@id']);
          console.log('    URL:', item.url);
          console.log('    Content URL:', item.contentUrl);
        }
      });
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// Run the test
testJsonLdStructure();
