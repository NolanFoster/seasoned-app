// Test to verify that clipped recipes only save to KV store
console.log('🧪 Testing KV Store-Only Behavior for Clipped Recipes\n');

let passedTests = 0;
let failedTests = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✅ ${name}`);
    passedTests++;
  } catch (error) {
    console.log(`❌ ${name}`);
    console.log(`   Error: ${error.message}`);
    failedTests++;
  }
}



// Import the shared KV storage functions and worker
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { saveRecipeToKV, getRecipeFromKV, generateRecipeId } from '../../shared/kv-storage.js';
import worker from '../src/recipe-clipper.js';

// Mock environment for testing
const createMockEnv = (kvOperations = {}) => ({
  RECIPE_STORAGE: {
    get: kvOperations.get || (async (key) => null),
    put: kvOperations.put || (async (key, value) => {}),
    delete: kvOperations.delete || (async (key) => {}),
    list: kvOperations.list || (async (options) => ({ keys: [], cursor: null, list_complete: true }))
  },
  SAVE_WORKER_URL: 'https://recipe-save-worker.example.com',
  AI: {
    run: async (model, options) => ({
      output: [{
        content: [{
          text: JSON.stringify({
            name: 'Test Recipe',
            image: 'https://example.com/image.jpg',
            recipeIngredient: ['ingredient 1', 'ingredient 2'],
            recipeInstructions: [
              { "@type": "HowToStep", text: "step 1" },
              { "@type": "HowToStep", text: "step 2" }
            ]
          })
        }]
      }]
    })
  }
});

const createMockRequest = (method, url, body = null) => ({
  method,
  url: `https://worker.example.com${url}`,
  json: async () => body,
  headers: new Map()
});

// Test 1: Verify that successful recipe clipping saves only to KV store
test('Recipe clipping saves only to KV store', async () => {
  let kvSaved = false;
  let kvSavedKey = null;
  let kvSavedValue = null;
  
  const env = createMockEnv({
    get: async (key) => null, // Recipe not in cache
    put: async (key, value) => {
      kvSaved = true;
      kvSavedKey = key;
      kvSavedValue = value;
    }
  });

  // Mock fetch to return valid HTML
  global.fetch = vi.fn().mockImplementation(async (url) => ({
    ok: true,
    text: async () => '<html><body>Simple recipe content</body></html>'
  });

  const request = createMockRequest('POST', '/clip', { url: 'https://example.com/recipe' });
  const response = await worker.fetch(request, env);
  
  expect(response.status).toBe(200);
  expect(kvSaved).toBeTruthy();
  expect(kvSavedKey).toBeTruthy();
  expect(kvSavedValue).toBeTruthy();
  
  // Verify the saved data is compressed (base64 string)
  expect(typeof kvSavedValue).toBe('string');
  expect(kvSavedValue.length).toBeGreaterThan(0);
});

// Test 2: Verify that cached recipes are retrieved only from KV store
test('Cached recipes retrieved only from KV store', async () => {
  const mockRecipe = {
    id: 'test-id',
    url: 'https://example.com/cached-recipe',
    data: {
      name: 'Cached Recipe',
      image: 'https://example.com/cached.jpg',
      ingredients: ['cached ingredient'],
      instructions: ['cached step']
    },
    scrapedAt: new Date().toISOString()
  };

  let kvAccessed = false;
  
  const env = createMockEnv({
    get: async (key) => {
      kvAccessed = true;
      return JSON.stringify(mockRecipe);
    }
  });

  const request = createMockRequest('POST', '/clip', { url: 'https://example.com/cached-recipe' });
  const response = await worker.fetch(request, env);
  
  expect(response.status).toBe(200);
  expect(kvAccessed).toBeTruthy();
  
  const data = await response.json();
  expect(data.cached).toBe(true);
  expect(data.name).toBe('Cached Recipe');
});

// Test 3: Verify that recipe deletion only affects KV store
test('Recipe deletion only affects KV store', async () => {
  let kvDeleted = false;
  let kvDeletedKey = null;
  
  const env = createMockEnv({
    delete: async (key) => {
      kvDeleted = true;
      kvDeletedKey = key;
    }
  });

  const request = createMockRequest('DELETE', '/cached?url=https://example.com/recipe-to-delete');
  const response = await worker.fetch(request, env);
  
  expect(response.status).toBe(200);
  expect(kvDeleted).toBeTruthy();
  expect(kvDeletedKey).toBeTruthy();
});

// Test 4: Verify that clipper worker has no database endpoints
test('Clipper worker has no database endpoints', async () => {
  const env = createMockEnv();
  
  // Test that /recipes endpoints return 404
  const getRecipeRequest = createMockRequest('GET', '/recipes/test-id');
  const getResponse = await worker.fetch(getRecipeRequest, env);
  expect(getResponse.status).toBe(404);
  
  const putRecipeRequest = createMockRequest('PUT', '/recipes/test-id', { name: 'Test' });
  const putResponse = await worker.fetch(putRecipeRequest, env);
  expect(putResponse.status).toBe(404);
  
  const postRecipeRequest = createMockRequest('POST', '/recipes', { name: 'Test' });
  const postResponse = await worker.fetch(postRecipeRequest, env);
  expect(postResponse.status).toBe(404);
});

// Test 5: Verify that clipper worker only has KV-related endpoints
test('Clipper worker only has KV-related endpoints', async () => {
  const env = createMockEnv();
  
  // Health check should work
  const healthRequest = createMockRequest('GET', '/health');
  const healthResponse = await worker.fetch(healthRequest, env);
  expect(healthResponse.status).toBe(200);
  
  const healthData = await healthResponse.json();
  expect(healthData.service).toBe('recipe-clipper');
  expect(healthData.features.includes('kv-storage')).toBeTruthy();
  expect(!healthData.features.includes('database')).toBeTruthy();
  
  // Verify endpoints listed in health check are KV-related only
  const endpoints = healthData.endpoints;
  expect(endpoints['POST /clip']).toBeTruthy();
  expect(endpoints['GET /cached?url=<recipe-url>']).toBeTruthy();
  expect(endpoints['DELETE /cached?url=<recipe-url>']).toBeTruthy();
  expect(!endpoints['GET /recipes/:id']).toBeTruthy();
  expect(!endpoints['POST /recipes']).toBeTruthy();
});

// Test 6: Verify KV storage functions work correctly
test('KV storage functions work correctly', async () => {
  let storedData = null;
  let storedKey = null;
  
  const mockEnv = {
    RECIPE_STORAGE: {
      put: async (key, value) => {
        storedKey = key;
        storedData = value;
      },
      get: async (key) => {
        if (key === storedKey) {
          return storedData;
        }
        return null;
      }
    }
  };
  
  const testUrl = 'https://example.com/test-recipe';
  const testRecipe = {
    url: testUrl,
    data: {
      name: 'Test Recipe',
      ingredients: ['ingredient 1'],
      instructions: ['step 1']
    }
  };
  
  // Test saving to KV
  const recipeId = await generateRecipeId(testUrl);
  const saveResult = await saveRecipeToKV(mockEnv, recipeId, testRecipe);
  
  expect(saveResult.success).toBeTruthy();
  expect(storedKey).toBe(recipeId);
  expect(storedData).toBeTruthy();
  
  // Test retrieving from KV
  const getResult = await getRecipeFromKV(mockEnv, recipeId);
  
  expect(getResult.success).toBeTruthy();
  expect(getResult.recipe.url).toBe(testUrl);
  expect(getResult.recipe.data.name).toBe('Test Recipe');
});

// Test 7: Verify no HTTP calls to external databases
test('No HTTP calls to external databases during recipe clipping', async () => {
  const originalFetch = global.fetch;
  const fetchCalls = [];
  
  // Mock fetch to track all HTTP calls
  global.fetch = vi.fn().mockImplementation(async (url, options) => {
    fetchCalls.push({ url, options });
    
    // Only allow calls to recipe URLs (for scraping)
    if (url.includes('example.com/recipe')) {
      return {
        ok: true,
        text: async () => '<html><body>Recipe content</body></html>'
      };
    }
    
    throw new Error(`Unexpected HTTP call to: ${url}`);
  };
  
  try {
    const env = createMockEnv();
    const request = createMockRequest('POST', '/clip', { url: 'https://example.com/recipe' });
    await worker.fetch(request, env);
    
    // Verify only the recipe URL was fetched (no database calls)
    expect(fetchCalls.length).toBe(1);
    expect(fetchCalls[0].url).toBe('https://example.com/recipe');
    
    // Verify no calls to database workers
    const dbCalls = fetchCalls.filter(call => 
      call.url.includes('recipe-db') || 
      call.url.includes('clipped-recipe-db') ||
      call.url.includes('/recipe') && call.url !== 'https://example.com/recipe'
    );
    expect(dbCalls.length).toBe(0);
    
  } finally {
    global.fetch = originalFetch;
  }
});

// Summary
console.log('\n' + '='.repeat(50));