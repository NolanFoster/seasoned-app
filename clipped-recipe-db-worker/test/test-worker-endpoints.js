// Test script for worker endpoints when running locally
// Run this after starting the worker with: ./start-local-dev.sh

const WORKER_URL = 'http://localhost:8787';

// Test health endpoint
async function testHealthEndpoint() {
  console.log('🧪 Testing Health Endpoint');
  
  try {
    const response = await fetch(`${WORKER_URL}/health`);
    const data = await response.json();
    
    console.log('✅ Health endpoint response:', data);
    console.log('Status:', response.status);
    return data;
  } catch (error) {
    console.error('❌ Health endpoint error:', error.message);
    return null;
  }
}

// Test recipe clipping endpoint
async function testRecipeClipping() {
  console.log('\n🧪 Testing Recipe Clipping Endpoint');
  
  try {
    const testUrl = 'https://www.allrecipes.com/recipe/235171/chef-johns-salt-roasted-chicken/';
    
    const response = await fetch(`${WORKER_URL}/clip`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url: testUrl })
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ Recipe clipping successful:');
      console.log(JSON.stringify(data, null, 2));
      return data;
    } else {
      const errorText = await response.text();
      console.log('❌ Recipe clipping failed:');
      console.log('Status:', response.status);
      console.log('Error:', errorText);
      return null;
    }
  } catch (error) {
    console.error('❌ Recipe clipping error:', error.message);
    return null;
  }
}

// Test invalid URL
async function testInvalidURL() {
  console.log('\n🧪 Testing Invalid URL Handling');
  
  try {
    const response = await fetch(`${WORKER_URL}/clip`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url: 'invalid-url' })
    });
    
    const data = await response.text();
    console.log('✅ Invalid URL handling:');
    console.log('Status:', response.status);
    console.log('Response:', data);
    return data;
  } catch (error) {
    console.error('❌ Invalid URL test error:', error.message);
    return null;
  }
}

// Test missing URL
async function testMissingURL() {
  console.log('\n🧪 Testing Missing URL Handling');
  
  try {
    const response = await fetch(`${WORKER_URL}/clip`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({})
    });
    
    const data = await response.text();
    console.log('✅ Missing URL handling:');
    console.log('Status:', response.status);
    console.log('Response:', data);
    return data;
  } catch (error) {
    console.error('❌ Missing URL test error:', error.message);
    return null;
  }
}

// Test CORS preflight
async function testCORS() {
  console.log('\n🧪 Testing CORS Preflight');
  
  try {
    const response = await fetch(`${WORKER_URL}/clip`, {
      method: 'OPTIONS',
      headers: {
        'Origin': 'http://localhost:3000',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Content-Type'
      }
    });
    
    console.log('✅ CORS preflight response:');
    console.log('Status:', response.status);
    console.log('CORS Headers:');
    console.log('  Access-Control-Allow-Origin:', response.headers.get('Access-Control-Allow-Origin'));
    console.log('  Access-Control-Allow-Methods:', response.headers.get('Access-Control-Allow-Methods'));
    console.log('  Access-Control-Allow-Headers:', response.headers.get('Access-Control-Allow-Headers'));
    
    return response;
  } catch (error) {
    console.error('❌ CORS test error:', error.message);
    return null;
  }
}

// Run all endpoint tests
async function runEndpointTests() {
  console.log('🚀 Starting Worker Endpoint Tests');
  console.log(`📍 Testing worker at: ${WORKER_URL}`);
  console.log('');
  
  // Test health endpoint
  await testHealthEndpoint();
  
  // Test CORS
  await testCORS();
  
  // Test recipe clipping (this will fail without AI binding, but tests the endpoint)
  await testRecipeClipping();
  
  // Test error handling
  await testInvalidURL();
  await testMissingURL();
  
  console.log('\n🎯 Endpoint tests completed!');
  console.log('💡 Note: Recipe clipping will fail without proper AI binding setup');
}

// Check if worker is running
async function checkWorkerStatus() {
  try {
    const response = await fetch(`${WORKER_URL}/health`);
    return response.ok;
  } catch (error) {
    return false;
  }
}

// Main execution
async function main() {
  console.log('🔍 Checking if worker is running...');
  
  const isRunning = await checkWorkerStatus();
  if (!isRunning) {
    console.log('❌ Worker is not running!');
    console.log('💡 Please start the worker first with: ./start-local-dev.sh');
    console.log('   Or run: wrangler dev --config wrangler-clipper.toml');
    return;
  }
  
  console.log('✅ Worker is running! Starting tests...\n');
  await runEndpointTests();
}

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { 
  testHealthEndpoint, 
  testRecipeClipping, 
  testInvalidURL, 
  testMissingURL, 
  testCORS,
  runEndpointTests 
}; 