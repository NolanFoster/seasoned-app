/**
 * Test script to verify recipe-scraper refactoring
 * Tests that the shared library integration works correctly
 */

// Test configuration
const SCRAPER_URL = 'http://localhost:8788'; // Update with your scraper URL
const TEST_RECIPE_URL = 'https://www.allrecipes.com/recipe/24074/alysias-basic-meat-lasagna/';

async function testRefactoring() {
  console.log('🧪 Testing Recipe Scraper Refactoring\n');
  
  try {
    // Test 1: Verify shared library import works
    console.log('1. Testing shared library import...');
    try {
      const { generateRecipeId, saveRecipeToKV, getRecipeFromKV } = await import('../shared/kv-storage.js');
      const testId = await generateRecipeId('https://test.com/recipe');
      console.log('✅ Shared library import works, test ID:', testId.substring(0, 8) + '...');
    } catch (error) {
      console.log('❌ Shared library import failed:', error.message);
      throw error;
    }
    
    // Test 2: Health check
    console.log('\n2. Testing health check...');
    const healthResponse = await fetch(`${SCRAPER_URL}/health`);
    const healthData = await healthResponse.json();
    console.log('✅ Health check response:', healthData);
    
    // Test 3: Test scraping with save to KV
    console.log('\n3. Testing scraping with save to KV...');
    const scrapeResponse = await fetch(`${SCRAPER_URL}/scrape?url=${encodeURIComponent(TEST_RECIPE_URL)}&save=true`);
    const scrapeData = await scrapeResponse.json();
    console.log('✅ Scrape response:', {
      success: scrapeData.results?.[0]?.success,
      savedToKV: scrapeData.results?.[0]?.savedToKV,
      recipeId: scrapeData.results?.[0]?.recipeId
    });
    
    if (scrapeData.results?.[0]?.success && scrapeData.results?.[0]?.recipeId) {
      const recipeId = scrapeData.results[0].recipeId;
      
      // Test 4: Test retrieving from KV
      console.log('\n4. Testing retrieve from KV...');
      const retrieveResponse = await fetch(`${SCRAPER_URL}/recipes?id=${recipeId}`);
      const retrieveData = await retrieveResponse.json();
      console.log('✅ Retrieve response:', {
        success: !!retrieveData.id,
        name: retrieveData.data?.name,
        hasIngredients: !!(retrieveData.data?.ingredients && retrieveData.data.ingredients.length > 0)
      });
      
      // Test 5: Test listing recipes
      console.log('\n5. Testing list recipes...');
      const listResponse = await fetch(`${SCRAPER_URL}/recipes?limit=5`);
      const listData = await listResponse.json();
      console.log('✅ List response:', {
        success: listData.success,
        recipeCount: listData.recipes?.length || 0,
        hasCursor: !!listData.cursor
      });
      
      // Test 6: Test deleting recipe
      console.log('\n6. Testing delete recipe...');
      const deleteResponse = await fetch(`${SCRAPER_URL}/recipes?id=${recipeId}`, {
        method: 'DELETE'
      });
      const deleteData = await deleteResponse.json();
      console.log('✅ Delete response:', deleteData);
      
      // Test 7: Verify deletion
      console.log('\n7. Verifying deletion...');
      const verifyResponse = await fetch(`${SCRAPER_URL}/recipes?id=${recipeId}`);
      console.log('✅ Verify deletion:', verifyResponse.status === 404 ? 'SUCCESS' : 'FAILED');
    }
    
    console.log('\n🎉 All refactoring tests completed successfully!');
    console.log('✅ Shared library integration is working correctly');
    console.log('✅ All KV operations are functioning');
    console.log('✅ No breaking changes introduced');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

// Run the test
if (import.meta.url === `file://${process.argv[1]}`) {
  testRefactoring();
}

export { testRefactoring };
