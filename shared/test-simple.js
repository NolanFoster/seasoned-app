/**
 * Simple test runner for shared KV storage library
 * Tests basic functionality without requiring Jest
 */

import { 
  generateRecipeId, 
  compressData, 
  decompressData 
} from './kv-storage.js';

// Test data
const testUrl = 'https://www.allrecipes.com/recipe/24074/alysias-basic-meat-lasagna/';
const testRecipeData = {
  name: 'Test Recipe',
  ingredients: ['ingredient 1', 'ingredient 2'],
  instructions: ['step 1', 'step 2'],
  description: 'A test recipe for unit testing'
};

// Simple assertion function
function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

// Test runner
async function runTests() {
  console.log('🧪 Running Simple KV Storage Library Tests...\n');
  
  let passedTests = 0;
  let totalTests = 0;
  
  const runTest = (testName, testFn) => {
    totalTests++;
    try {
      testFn();
      console.log(`✅ ${testName}`);
      passedTests++;
    } catch (error) {
      console.log(`❌ ${testName}: ${error.message}`);
    }
  };
  
  // Test 1: generateRecipeId consistency
  runTest('generateRecipeId should generate consistent hashes', async () => {
    const id1 = await generateRecipeId(testUrl);
    const id2 = await generateRecipeId(testUrl);
    
    assert(id1 === id2, 'Generated IDs should be identical for same URL');
    assert(typeof id1 === 'string', 'Generated ID should be a string');
    assert(id1.length === 64, 'Generated ID should be 64 characters (SHA-256)');
  });
  
  // Test 2: generateRecipeId uniqueness
  runTest('generateRecipeId should generate different hashes for different URLs', async () => {
    const id1 = await generateRecipeId(testUrl);
    const id2 = await generateRecipeId('https://different-url.com/recipe');
    
    assert(id1 !== id2, 'Generated IDs should be different for different URLs');
  });
  
  // Test 3: generateRecipeId empty URL
  runTest('generateRecipeId should handle empty URL', async () => {
    const id = await generateRecipeId('');
    
    assert(typeof id === 'string', 'Generated ID should be a string');
    assert(id.length === 64, 'Generated ID should be 64 characters');
  });
  
  // Test 4: compression and decompression
  runTest('compressData and decompressData should work correctly', async () => {
    const compressed = await compressData(testRecipeData);
    const decompressed = await decompressData(compressed);
    
    assert(typeof compressed === 'string', 'Compressed data should be a string');
    assert(compressed.length > 0, 'Compressed data should not be empty');
    assert(JSON.stringify(decompressed) === JSON.stringify(testRecipeData), 
           'Decompressed data should match original data');
  });
  
  // Test 5: compression with different data types
  runTest('compression should work with different data types', async () => {
    const testCases = [
      'test string',
      [1, 2, 3, 'test'],
      { key: 'value', number: 42 },
      null,
      undefined
    ];
    
    for (const testCase of testCases) {
      const compressed = await compressData(testCase);
      const decompressed = await decompressData(compressed);
      
      if (testCase === null) {
        assert(decompressed === null, 'null should be preserved');
      } else if (testCase === undefined) {
        assert(decompressed === undefined, 'undefined should be preserved');
      } else {
        assert(JSON.stringify(decompressed) === JSON.stringify(testCase), 
               `Data type ${typeof testCase} should be preserved`);
      }
    }
  });
  
  // Test 6: compression with empty data
  runTest('compression should handle empty data', async () => {
    const compressed = await compressData({});
    const decompressed = await decompressData(compressed);
    
    assert(typeof compressed === 'string', 'Compressed data should be a string');
    assert(JSON.stringify(decompressed) === '{}', 'Empty object should be preserved');
  });
  
  // Test 7: base64 validation
  runTest('compressed data should be valid base64', async () => {
    const compressed = await compressData(testRecipeData);
    
    // Base64 should only contain valid characters
    const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
    assert(base64Regex.test(compressed), 'Compressed data should be valid base64');
  });
  
  // Test 8: error handling for invalid base64
  runTest('decompressData should throw error for invalid base64', async () => {
    let errorThrown = false;
    try {
      await decompressData('invalid-base64!@#');
    } catch (error) {
      errorThrown = true;
    }
    
    assert(errorThrown, 'decompressData should throw error for invalid base64');
  });
  
  // Test 9: large data compression
  runTest('compression should handle large data', async () => {
    const largeData = {
      name: 'Large Recipe',
      ingredients: Array.from({ length: 100 }, (_, i) => `ingredient ${i + 1}`),
      instructions: Array.from({ length: 50 }, (_, i) => `step ${i + 1}: do something`),
      description: 'A'.repeat(1000) // 1000 character description
    };
    
    const compressed = await compressData(largeData);
    const decompressed = await decompressData(compressed);
    
    assert(JSON.stringify(decompressed) === JSON.stringify(largeData), 
           'Large data should be preserved correctly');
    assert(compressed.length < JSON.stringify(largeData).length, 
           'Compressed data should be smaller than original');
  });
  
  // Test 10: special characters
  runTest('compression should handle special characters', async () => {
    const specialData = {
      name: 'Recipe with special chars: éñüß',
      ingredients: ['salt & pepper', 'olive oil (extra virgin)', 'garlic (minced)'],
      instructions: ['Preheat oven to 350°F', 'Mix ingredients in bowl', 'Bake for 30-45 minutes'],
      description: 'A recipe with unicode characters: 🍕 🍝 🍰'
    };
    
    const compressed = await compressData(specialData);
    const decompressed = await decompressData(compressed);
    
    assert(JSON.stringify(decompressed) === JSON.stringify(specialData), 
           'Special characters should be preserved');
  });
  
  console.log(`\n📊 Test Results: ${passedTests}/${totalTests} tests passed`);
  
  if (passedTests === totalTests) {
    console.log('🎉 All tests passed! The shared KV library is working correctly.');
  } else {
    console.log('⚠️  Some tests failed. Please check the implementation.');
    process.exit(1);
  }
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runTests().catch(error => {
    console.error('❌ Test runner failed:', error.message);
    process.exit(1);
  });
}

export { runTests };
