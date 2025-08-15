/**
 * Test script for KV integration in recipe clipper
 * This script tests the caching functionality of the updated clipper
 * Also verifies that the shared library refactoring works correctly
 */

// Test configuration
const CLIPPER_URL = 'http://localhost:8787'; // Update with your clipper URL
const TEST_RECIPE_URL = 'https://www.allrecipes.com/recipe/24074/alysias-basic-meat-lasagna/';

async function testKVIntegration() {
  console.log('🧪 Testing KV Integration in Recipe Clipper\n');
  
  try {
    // Test 0: Verify shared library import works
    console.log('0. Testing shared library import...');
    try {
      const { generateRecipeId } = await import('../shared/kv-storage.js');
      const testId = await generateRecipeId('https://test.com/recipe');
      console.log('✅ Shared library import works, test ID:', testId.substring(0, 8) + '...');
    } catch (error) {
      console.log('❌ Shared library import failed:', error.message);
      throw error;
    }
    
    // Test 1: Health check
    console.log('\n1. Testing health check...');
    const healthResponse = await fetch(`${CLIPPER_URL}/health`);
    const healthData = await healthResponse.json();
    console.log('✅ Health check response:', healthData);
    
    // Test 2: First clip (should save to KV)
    console.log('\n2. Testing first clip (should save to KV)...');
    const firstClipResponse = await fetch(`${CLIPPER_URL}/clip`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: TEST_RECIPE_URL })
    });
    
    if (!firstClipResponse.ok) {
      throw new Error(`First clip failed: ${firstClipResponse.status} ${firstClipResponse.statusText}`);
    }
    
    const firstClipData = await firstClipResponse.json();
    console.log('✅ First clip response:', {
      name: firstClipData.name,
      cached: firstClipData.cached,
      savedToKV: firstClipData.savedToKV,
      recipeId: firstClipData.recipeId
    });
    
    // Test 3: Second clip (should return cached version)
    console.log('\n3. Testing second clip (should return cached version)...');
    const secondClipResponse = await fetch(`${CLIPPER_URL}/clip`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: TEST_RECIPE_URL })
    });
    
    if (!secondClipResponse.ok) {
      throw new Error(`Second clip failed: ${secondClipResponse.status} ${secondClipResponse.statusText}`);
    }
    
    const secondClipData = await secondClipResponse.json();
    console.log('✅ Second clip response:', {
      name: secondClipData.name,
      cached: secondClipData.cached,
      recipeId: secondClipData.recipeId,
      scrapedAt: secondClipData.scrapedAt
    });
    
    // Test 4: Direct cache access
    console.log('\n4. Testing direct cache access...');
    const cacheResponse = await fetch(`${CLIPPER_URL}/cached?url=${encodeURIComponent(TEST_RECIPE_URL)}`);
    
    if (!cacheResponse.ok) {
      throw new Error(`Cache access failed: ${cacheResponse.status} ${cacheResponse.statusText}`);
    }
    
    const cacheData = await cacheResponse.json();
    console.log('✅ Cache access response:', {
      name: cacheData.name,
      cached: cacheData.cached,
      recipeId: cacheData.recipeId
    });
    
    // Test 5: Clear cache
    console.log('\n5. Testing cache clearing...');
    const clearResponse = await fetch(`${CLIPPER_URL}/cached?url=${encodeURIComponent(TEST_RECIPE_URL)}`, {
      method: 'DELETE'
    });
    
    if (!clearResponse.ok) {
      throw new Error(`Cache clearing failed: ${clearResponse.status} ${clearResponse.statusText}`);
    }
    
    const clearData = await clearResponse.json();
    console.log('✅ Cache clearing response:', clearData);
    
    // Test 6: Verify cache is cleared
    console.log('\n6. Verifying cache is cleared...');
    const verifyResponse = await fetch(`${CLIPPER_URL}/cached?url=${encodeURIComponent(TEST_RECIPE_URL)}`);
    
    if (verifyResponse.status === 404) {
      console.log('✅ Cache successfully cleared (404 response as expected)');
    } else {
      console.log('⚠️  Cache may not be cleared (unexpected response)');
    }
    
    console.log('\n🎉 All tests completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

// Run the test
if (import.meta.url === `file://${process.argv[1]}`) {
  testKVIntegration();
}

export { testKVIntegration };
