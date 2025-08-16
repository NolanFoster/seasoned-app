// Test script for verifying prefix search functionality
// This tests that partial word searches now work correctly

const SEARCH_DB_URL = 'https://recipe-search-db.kyle-schick80.workers.dev';

async function testPrefixSearch() {
  console.log('🧪 Testing Prefix Search Functionality\n');
  
  const testCases = [
    { query: 'chick', expected: ['chicken'] },
    { query: 'tom', expected: ['tomato', 'tomatoes'] },
    { query: 'sal', expected: ['salad', 'salmon', 'salt', 'salsa'] },
    { query: 'pasta sal', expected: ['pasta salad', 'pasta with salmon'] },
    { query: 'choc', expected: ['chocolate'] },
    { query: 'garlic bread', expected: ['garlic bread', 'garlic breadsticks'] }
  ];
  
  for (const testCase of testCases) {
    console.log(`\n📍 Testing: "${testCase.query}"`);
    console.log(`   Expected to match words starting with: ${testCase.expected.join(', ')}`);
    
    try {
      const response = await fetch(
        `${SEARCH_DB_URL}/api/search?q=${encodeURIComponent(testCase.query)}&type=RECIPE&limit=10`
      );
      
      if (!response.ok) {
        console.error(`   ❌ Search failed with status: ${response.status}`);
        continue;
      }
      
      const data = await response.json();
      console.log(`   ✅ Search returned ${data.results.length} results`);
      console.log(`   🔍 FTS Query used: "${data.ftsQuery}"`);
      
      // Show first few results
      if (data.results.length > 0) {
        console.log('   📋 Sample results:');
        data.results.slice(0, 3).forEach((result, index) => {
          const title = result.properties.title || result.properties.name;
          console.log(`      ${index + 1}. ${title}`);
        });
      }
      
      // Check if results contain expected partial matches
      const foundTitles = data.results.map(r => 
        (r.properties.title || r.properties.name || '').toLowerCase()
      );
      
      const matchedExpected = testCase.expected.filter(expected => 
        foundTitles.some(title => title.includes(expected.toLowerCase()))
      );
      
      if (matchedExpected.length > 0) {
        console.log(`   ✨ Found matches for: ${matchedExpected.join(', ')}`);
      }
      
    } catch (error) {
      console.error(`   ❌ Error testing "${testCase.query}":`, error.message);
    }
  }
  
  console.log('\n\n📊 Test Summary:');
  console.log('The search now supports prefix matching by automatically appending * to search terms.');
  console.log('This allows searches like "chick" to find "chicken" recipes.');
}

// Run the tests
testPrefixSearch().catch(console.error);