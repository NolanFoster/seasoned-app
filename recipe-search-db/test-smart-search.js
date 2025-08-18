// Test script for the simplified smart search endpoint
const SEARCH_DB_URL = 'https://recipe-search-db.nolanfoster.workers.dev'; // Production URL

async function testSmartSearch() {
  console.log('🧪 Testing Simplified Smart Search Endpoint\n');
  
  try {
    // Test 1: Basic smart search
    console.log('Test 1: Basic smart search for "chicken pasta"');
    const response1 = await fetch(`${SEARCH_DB_URL}/api/smart-search?q=chicken%20pasta&type=RECIPE&limit=5`);
    if (response1.ok) {
      const data1 = await response1.json();
      console.log(`✅ Success: Found ${data1.results.length} results using strategy: ${data1.strategy}`);
      console.log(`   Query: "${data1.query}"`);
      console.log(`   Similarity Score: ${data1.similarityScore || 'N/A'}`);
    } else {
      console.log(`❌ Failed: ${response1.status} ${response1.statusText}`);
    }
    
    console.log('\n' + '='.repeat(50) + '\n');
    
    // Test 2: Single word search
    console.log('Test 2: Single word search for "salmon"');
    const response2 = await fetch(`${SEARCH_DB_URL}/api/smart-search?q=salmon&type=RECIPE&limit=5`);
    if (response2.ok) {
      const data2 = await response2.json();
      console.log(`✅ Success: Found ${data2.results.length} results using strategy: ${data2.strategy}`);
      console.log(`   Query: "${data2.query}"`);
      console.log(`   Similarity Score: ${data2.similarityScore || 'N/A'}`);
    } else {
      console.log(`❌ Failed: ${response2.status} ${response2.statusText}`);
    }
    
    console.log('\n' + '='.repeat(50) + '\n');
    
    // Test 3: Complex query
    console.log('Test 3: Complex query for "homemade chocolate chip cookies"');
    const response3 = await fetch(`${SEARCH_DB_URL}/api/smart-search?q=homemade%20chocolate%20chip%20cookies&type=RECIPE&limit=5`);
    if (response3.ok) {
      const data3 = await response3.json();
      console.log(`✅ Success: Found ${data3.results.length} results using strategy: ${data3.strategy}`);
      console.log(`   Query: "${data3.query}"`);
      console.log(`   Similarity Score: ${data3.similarityScore || 'N/A'}`);
    } else {
      console.log(`❌ Failed: ${response3.status} ${response3.statusText}`);
    }
    
    console.log('\n' + '='.repeat(50) + '\n');
    
    // Test 4: Version check
    console.log('Test 4: Version check');
    const response4 = await fetch(`${SEARCH_DB_URL}/api/version`);
    if (response4.ok) {
      const data4 = await response4.json();
      console.log(`✅ Version: ${data4.version}`);
      console.log(`   Features: ${JSON.stringify(data4.features)}`);
    } else {
      console.log(`❌ Failed: ${response4.status} ${response4.statusText}`);
    }
    
  } catch (error) {
    console.error('❌ Test failed with error:', error.message);
  }
}

// Run the test
testSmartSearch();
