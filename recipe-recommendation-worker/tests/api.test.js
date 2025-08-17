/**
 * API Endpoint Tests for Recipe Recommendation Worker
 */

import { Miniflare } from 'miniflare';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test utilities
function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

function assertEquals(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message || 'Assertion failed'}: expected ${expected}, got ${actual}`);
  }
}

export async function runTests() {
  const tests = [];
  let passed = 0;
  let failed = 0;

  // Initialize Miniflare
  let mf;
  
  try {
    mf = new Miniflare({
      scriptPath: path.join(__dirname, '../src/index.js'),
      modules: true,
      bindings: {
        AI: null // Testing without AI binding
      }
    });
  } catch (error) {
    console.error('Failed to initialize Miniflare:', error);
    return { total: 0, passed: 0, failed: 0 };
  }

  // Test 1: Health check endpoint
  tests.push({
    name: 'GET /health should return healthy status',
    fn: async () => {
      const response = await mf.dispatchFetch('http://localhost/health');
      assertEquals(response.status, 200, 'Should return 200 status');
      
      const data = await response.json();
      assertEquals(data.status, 'healthy', 'Should return healthy status');
    }
  });

  // Test 2: CORS preflight request
  tests.push({
    name: 'OPTIONS request should handle CORS',
    fn: async () => {
      const response = await mf.dispatchFetch('http://localhost/recommendations', {
        method: 'OPTIONS'
      });
      
      assertEquals(response.status, 200, 'Should return 200 for OPTIONS');
      assert(response.headers.get('Access-Control-Allow-Origin') === '*', 'Should have CORS headers');
      assert(response.headers.get('Access-Control-Allow-Methods'), 'Should have allowed methods');
    }
  });

  // Test 3: POST /recommendations with valid data
  tests.push({
    name: 'POST /recommendations should return recommendations',
    fn: async () => {
      const response = await mf.dispatchFetch('http://localhost/recommendations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location: 'San Francisco, CA',
          date: '2024-07-15'
        })
      });
      
      assertEquals(response.status, 200, 'Should return 200 status');
      
      const data = await response.json();
      assert(data.recommendations, 'Should have recommendations');
      assert(data.location === 'San Francisco, CA', 'Should include location');
      assert(data.date === '2024-07-15', 'Should include date');
      assert(data.season === 'Summer', 'Should identify summer season');
    }
  });

  // Test 4: POST /recommendations without location
  tests.push({
    name: 'POST /recommendations without location should return valid recommendations',
    fn: async () => {
      const response = await mf.dispatchFetch('http://localhost/recommendations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: '2024-07-15'
        })
      });
      
      assertEquals(response.status, 200, 'Should return 200 status');
      const data = await response.json();
      assert(data.recommendations, 'Should have recommendations');
      assert(Object.keys(data.recommendations).length === 3, 'Should have 3 categories');
      assert(data.location === 'Not specified', 'Should indicate no location');
    }
  });

  // Test 5: POST /recommendations without date (should use current date)
  tests.push({
    name: 'POST /recommendations without date should use current date',
    fn: async () => {
      const response = await mf.dispatchFetch('http://localhost/recommendations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location: 'New York, NY'
        })
      });
      
      assertEquals(response.status, 200, 'Should return 200 status');
      
      const data = await response.json();
      assert(data.recommendations, 'Should have recommendations');
      assert(data.date, 'Should have a date');
      
      // Verify it's today's date
      const today = new Date().toISOString().split('T')[0];
      assertEquals(data.date, today, 'Should use current date');
    }
  });

  // Test 6: Invalid JSON body
  tests.push({
    name: 'POST /recommendations with invalid JSON should return 500',
    fn: async () => {
      const response = await mf.dispatchFetch('http://localhost/recommendations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'invalid json'
      });
      
      assertEquals(response.status, 500, 'Should return 500 status');
      
      const data = await response.json();
      assert(data.error, 'Should have error message');
    }
  });

  // Test 7: GET request to /recommendations should fail
  tests.push({
    name: 'GET /recommendations should return 405 Method Not Allowed',
    fn: async () => {
      const response = await mf.dispatchFetch('http://localhost/recommendations', {
        method: 'GET'
      });
      
      assertEquals(response.status, 405, 'Should return 405 for GET');
      
      const data = await response.json();
      assert(data.error, 'Should have error message');
      assert(data.error.includes('Method not allowed'), 'Error should mention method not allowed');
    }
  });

  // Test 8: Unknown endpoint
  tests.push({
    name: 'Unknown endpoint should return 404',
    fn: async () => {
      const response = await mf.dispatchFetch('http://localhost/unknown');
      
      assertEquals(response.status, 404, 'Should return 404 status');
      
      const data = await response.json();
      assert(data.error, 'Should have error message');
    }
  });

  // Test 9: CORS headers on all responses
  tests.push({
    name: 'All responses should include CORS headers',
    fn: async () => {
      const endpoints = [
        { url: '/health', method: 'GET' },
        { url: '/recommendations', method: 'POST', body: JSON.stringify({ location: 'Test' }) },
        { url: '/unknown', method: 'GET' }
      ];
      
      for (const endpoint of endpoints) {
        const options = {
          method: endpoint.method,
          headers: endpoint.body ? { 'Content-Type': 'application/json' } : {}
        };
        if (endpoint.body) options.body = endpoint.body;
        
        const response = await mf.dispatchFetch(`http://localhost${endpoint.url}`, options);
        assert(response.headers.get('Access-Control-Allow-Origin'), 
          `${endpoint.url} should have CORS headers`);
      }
    }
  });

  // Run all tests
  for (const test of tests) {
    try {
      await test.fn();
      console.log(`✅ ${test.name}`);
      passed++;
    } catch (error) {
      console.log(`❌ ${test.name}`);
      console.log(`   Error: ${error.message}`);
      failed++;
    }
  }

  // Cleanup
  if (mf) {
    await mf.dispose();
  }

  return {
    total: tests.length,
    passed,
    failed
  };
}