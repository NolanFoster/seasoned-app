// Debug script to test FTS search functionality
const SEARCH_DB_URL = 'https://recipe-search-db.nolanfoster.workers.dev';

async function debugFTS() {
  console.log('🔍 Debugging FTS Search Functionality\n');
  
  try {
    // Test 1: Check if nodes exist
    console.log('1. Checking for nodes in database...');
    const nodesResponse = await fetch(`${SEARCH_DB_URL}/api/nodes?type=RECIPE&limit=3`);
    const nodesData = await nodesResponse.json();
    console.log(`   Found ${nodesData.nodes.length} recipe nodes`);
    
    if (nodesData.nodes.length > 0) {
      console.log('   Sample titles:');
      nodesData.nodes.forEach((node, i) => {
        console.log(`   ${i + 1}. ${node.properties.title}`);
      });
    }
    
    // Test 2: Try different search queries
    console.log('\n2. Testing search queries...');
    const testQueries = ['chicken', 'chick', 'slow', 'cook', 'pepper'];
    
    for (const query of testQueries) {
      console.log(`\n   Testing query: "${query}"`);
      const searchResponse = await fetch(`${SEARCH_DB_URL}/api/search?q=${encodeURIComponent(query)}&type=RECIPE&limit=3`);
      const searchData = await searchResponse.json();
      
      console.log(`   Results found: ${searchData.results.length}`);
      console.log(`   FTS Query used: "${searchData.ftsQuery}"`);
      
      if (searchData.results.length > 0) {
        searchData.results.forEach((result, i) => {
          console.log(`   ${i + 1}. ${result.properties.title}`);
        });
      }
    }
    
    // Test 3: Direct test without type filter
    console.log('\n3. Testing search without type filter...');
    const directResponse = await fetch(`${SEARCH_DB_URL}/api/search?q=recipe&limit=5`);
    const directData = await directResponse.json();
    console.log(`   Results found: ${directData.results.length}`);
    console.log(`   FTS Query used: "${directData.ftsQuery}"`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// Run the debug
debugFTS().catch(console.error);