/**
 * Basic test for shared KV storage library
 * Simple test without complex error handling
 */

import { 
  generateRecipeId, 
  compressData, 
  decompressData 
} from './kv-storage.js';

console.log('🧪 Running Basic KV Storage Library Tests...\n');

async function runBasicTests() {
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
  
  // Test 1: generateRecipeId
  runTest('generateRecipeId should generate consistent hashes', async () => {
    const testUrl = 'https://test.com/recipe';
    const id1 = await generateRecipeId(testUrl);
    const id2 = await generateRecipeId(testUrl);
    
    if (id1 !== id2) throw new Error('Generated IDs should be identical for same URL');
    if (typeof id1 !== 'string') throw new Error('Generated ID should be a string');
    if (id1.length !== 64) throw new Error('Generated ID should be 64 characters (SHA-256)');
  });
  
  // Test 2: compression and decompression
  runTest('compressData and decompressData should work correctly', async () => {
    const testData = { name: 'Test Recipe', ingredients: ['test'] };
    const compressed = await compressData(testData);
    const decompressed = await decompressData(compressed);
    
    if (typeof compressed !== 'string') throw new Error('Compressed data should be a string');
    if (compressed.length === 0) throw new Error('Compressed data should not be empty');
    if (JSON.stringify(decompressed) !== JSON.stringify(testData)) {
      throw new Error('Decompressed data should match original data');
    }
  });
  
  // Test 3: different data types
  runTest('compression should work with different data types', async () => {
    const testCases = [
      'test string',
      [1, 2, 3, 'test'],
      { key: 'value', number: 42 }
    ];
    
    for (const testCase of testCases) {
      const compressed = await compressData(testCase);
      const decompressed = await decompressData(compressed);
      
      if (JSON.stringify(decompressed) !== JSON.stringify(testCase)) {
        throw new Error(`Data type ${typeof testCase} should be preserved`);
      }
    }
  });
  
  // Test 4: empty data
  runTest('compression should handle empty data', async () => {
    const compressed = await compressData({});
    const decompressed = await decompressData(compressed);
    
    if (typeof compressed !== 'string') throw new Error('Compressed data should be a string');
    if (JSON.stringify(decompressed) !== '{}') throw new Error('Empty object should be preserved');
  });
  
  // Test 5: base64 validation
  runTest('compressed data should be valid base64', async () => {
    const testData = { name: 'Test Recipe' };
    const compressed = await compressData(testData);
    
    // Base64 should only contain valid characters
    const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
    if (!base64Regex.test(compressed)) {
      throw new Error('Compressed data should be valid base64');
    }
  });
  
  console.log(`\n📊 Test Results: ${passedTests}/${totalTests} tests passed`);
  
  if (passedTests === totalTests) {
    console.log('🎉 All basic tests passed! The shared KV library is working correctly.');
    return true;
  } else {
    console.log('⚠️  Some basic tests failed. Please check the implementation.');
    return false;
  }
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runBasicTests().then(success => {
    if (!success) process.exit(1);
  }).catch(error => {
    console.error('❌ Basic test runner failed:', error.message);
    process.exit(1);
  });
}

export { runBasicTests };
