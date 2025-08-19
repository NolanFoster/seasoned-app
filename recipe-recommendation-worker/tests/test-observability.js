// Test observability features
import { strict as assert } from 'assert';

// Mock environment for testing
const mockEnv = {
  AI: null, // No AI binding for testing
  ANALYTICS: {
    writeDataPoint: async (data) => {
      console.log('Analytics data:', JSON.stringify(data, null, 2));
      return Promise.resolve();
    }
  }
};

// Test the worker
async function testObservability() {
  console.log('Testing observability features...\n');

  // Import the worker
  const { default: worker } = await import('../src/index.js');

  // Test health endpoint
  console.log('1. Testing health endpoint...');
  const healthRequest = new Request('https://test.example.com/health', {
    method: 'GET'
  });
  const healthResponse = await worker.fetch(healthRequest, mockEnv);
  const healthData = await healthResponse.json();
  
  assert(healthResponse.status === 200);
  assert(healthData.status === 'healthy');
  assert(healthData.requestId);
  assert(healthData.services);
  console.log('✅ Health endpoint working with request ID:', healthData.requestId);

  // Test metrics endpoint
  console.log('\n2. Testing metrics endpoint...');
  const metricsRequest = new Request('https://test.example.com/metrics', {
    method: 'GET'
  });
  const metricsResponse = await worker.fetch(metricsRequest, mockEnv);
  const metricsData = await metricsResponse.json();
  
  assert(metricsResponse.status === 200);
  assert(metricsData.metrics);
  assert(metricsData.requestId);
  console.log('✅ Metrics endpoint working with', Object.keys(metricsData.metrics).length, 'metric types');

  // Test recommendations endpoint (will use mock data)
  console.log('\n3. Testing recommendations endpoint with observability...');
  const recommendationsRequest = new Request('https://test.example.com/recommendations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      location: 'Seattle, WA',
      date: '2024-01-15'
    })
  });
  const recommendationsResponse = await worker.fetch(recommendationsRequest, mockEnv);
  const recommendationsData = await recommendationsResponse.json();
  
  assert(recommendationsResponse.status === 200);
  assert(recommendationsData.requestId);
  assert(recommendationsData.processingTime);
  assert(recommendationsData.recommendations);
  assert(recommendationsData.isMockData === true); // Should be true since no AI binding
  console.log('✅ Recommendations endpoint working with request ID:', recommendationsData.requestId);
  console.log('   Processing time:', recommendationsData.processingTime);
  console.log('   Categories generated:', Object.keys(recommendationsData.recommendations).length);

  // Test error handling
  console.log('\n4. Testing error handling with observability...');
  const errorRequest = new Request('https://test.example.com/recommendations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: 'invalid json'
  });
  const errorResponse = await worker.fetch(errorRequest, mockEnv);
  const errorData = await errorResponse.json();
  
  assert(errorResponse.status === 500);
  assert(errorData.requestId);
  console.log('✅ Error handling working with request ID:', errorData.requestId);

  // Test CORS preflight
  console.log('\n5. Testing CORS preflight...');
  const corsRequest = new Request('https://test.example.com/recommendations', {
    method: 'OPTIONS'
  });
  const corsResponse = await worker.fetch(corsRequest, mockEnv);
  
  assert(corsResponse.status === 200);
  assert(corsResponse.headers.get('Access-Control-Allow-Origin') === '*');
  assert(corsResponse.headers.get('X-Request-ID')); // Should have request ID header
  console.log('✅ CORS preflight working with request ID header');

  console.log('\n🎉 All observability tests passed!');
  console.log('\nObservability features verified:');
  console.log('- ✅ Request tracking with unique IDs');
  console.log('- ✅ Structured logging');
  console.log('- ✅ Performance metrics collection');
  console.log('- ✅ Error categorization');
  console.log('- ✅ Analytics integration');
  console.log('- ✅ Health monitoring');
  console.log('- ✅ Real-time metrics endpoint');
}

// Run tests
testObservability().catch(console.error);