/**
 * Example test file for Recipe Index DB Worker
 * This demonstrates how to test the worker locally
 */

// Example recipe URLs to test
const testUrls = [
  'https://www.allrecipes.com/recipe/20171/quick-and-easy-pizza-crust/',
  'https://www.bbcgoodfood.com/recipes/easy-vanilla-cake',
  'https://www.seriouseats.com/recipes/2011/12/serious-eats-halal-cart-style-chicken-and-rice-white-sauce-recipe.html'
];

// Test single URL
async function testSingleUrl(workerUrl) {
  console.log('Testing single URL...');
  
  try {
    const response = await fetch(`${workerUrl}/scrape?url=${encodeURIComponent(testUrls[0])}`);
    const data = await response.json();
    
    console.log('Response:', JSON.stringify(data, null, 2));
    
    if (data.results[0].success) {
      console.log('✓ Successfully scraped recipe:', data.results[0].data.name);
    } else {
      console.log('✗ Failed to scrape:', data.results[0].error);
    }
  } catch (error) {
    console.error('Error testing single URL:', error);
  }
}

// Test batch URLs
async function testBatchUrls(workerUrl) {
  console.log('\nTesting batch URLs...');
  
  try {
    const response = await fetch(`${workerUrl}/scrape`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        urls: testUrls
      })
    });
    
    const data = await response.json();
    
    console.log('Summary:', data.summary);
    
    data.results.forEach((result, index) => {
      if (result.success) {
        console.log(`✓ Recipe ${index + 1}: ${result.data.name}`);
        console.log(`  - Ingredients: ${result.data.ingredients.length}`);
        console.log(`  - Instructions: ${result.data.instructions.length}`);
      } else {
        console.log(`✗ Recipe ${index + 1}: ${result.error}`);
      }
    });
  } catch (error) {
    console.error('Error testing batch URLs:', error);
  }
}

// Test health endpoint
async function testHealth(workerUrl) {
  console.log('\nTesting health endpoint...');
  
  try {
    const response = await fetch(`${workerUrl}/health`);
    const data = await response.json();
    
    console.log('Health check:', data);
  } catch (error) {
    console.error('Error testing health:', error);
  }
}

// Main test function
async function runTests() {
  // Use localhost for local testing or your deployed worker URL
  const workerUrl = process.env.WORKER_URL || 'http://localhost:8787';
  
  console.log(`Testing Recipe Index DB Worker at: ${workerUrl}\n`);
  
  await testHealth(workerUrl);
  await testSingleUrl(workerUrl);
  await testBatchUrls(workerUrl);
}

// Run tests if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runTests().catch(console.error);
}

export { runTests, testSingleUrl, testBatchUrls, testHealth };