/**
 * Test script to check WebPage image information
 */

const TEST_URL = 'https://whatscookingamerica.net/bksalpiccata.htm';

async function testWebPageImage() {
  console.log('🧪 Testing WebPage image information\n');
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
    
    if (jsonLd['@graph'] && Array.isArray(jsonLd['@graph'])) {
      // Find the WebPage object
      const webPage = jsonLd['@graph'].find(item => item['@type'] === 'WebPage');
      
      if (webPage) {
        console.log('✅ Found WebPage object');
        console.log('WebPage details:');
        console.log('  Name:', webPage.name);
        console.log('  Image:', webPage.image);
        console.log('  Primary Image of Page:', webPage.primaryImageOfPage);
        console.log('  Thumbnail URL:', webPage.thumbnailUrl);
        
        // Check if we can extract an image from the WebPage
        let extractedImage = null;
        
        if (webPage.image && typeof webPage.image === 'object' && webPage.image['@id']) {
          // Look up the referenced image
          const imageId = webPage.image['@id'];
          const imageObject = jsonLd['@graph'].find(item => item['@id'] === imageId);
          if (imageObject && imageObject.url) {
            extractedImage = imageObject.url;
            console.log('  Extracted image from image reference:', extractedImage);
          }
        }
        
        if (webPage.primaryImageOfPage && typeof webPage.primaryImageOfPage === 'object' && webPage.primaryImageOfPage['@id']) {
          // Look up the referenced primary image
          const imageId = webPage.primaryImageOfPage['@id'];
          const imageObject = jsonLd['@graph'].find(item => item['@id'] === imageId);
          if (imageObject && imageObject.url) {
            extractedImage = imageObject.url;
            console.log('  Extracted image from primaryImageOfPage reference:', extractedImage);
          }
        }
        
        if (webPage.thumbnailUrl) {
          extractedImage = webPage.thumbnailUrl;
          console.log('  Extracted image from thumbnailUrl:', extractedImage);
        }
        
        if (extractedImage) {
          console.log('\n✅ Successfully extracted image:', extractedImage);
        } else {
          console.log('\n❌ Could not extract image from WebPage');
        }
      } else {
        console.log('❌ WebPage object not found');
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// Run the test
testWebPageImage();
