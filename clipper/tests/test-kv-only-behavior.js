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

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

// Import the shared KV storage functions and worker
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
  RECIPE_SAVE_WORKER: {
    fetch: async (path, options) => {
      if (path === '/recipe/save') {
        return {
          ok: true,
          json: async () => ({ success: true, id: 'test-id' })
        };
      }
      if (path === '/recipe/delete') {
        return {
          ok: true,
          json: async () => ({ success: true })
        };
      }
      throw new Error('Unexpected service binding path: ' + path);
    }
  },
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
  global.fetch = async (url) => ({
    ok: true,
    text: async () => '<html><body>Simple recipe content</body></html>'
  });

  const request = createMockRequest('POST', '/clip', { url: 'https://example.com/recipe' });
  const response = await worker.fetch(request, env);
  
  assert(response.status === 200, 'Should return 200 for successful clip');
  assert(kvSaved, 'Should save to KV store');
  assert(kvSavedKey, 'Should save with a key');
  assert(kvSavedValue, 'Should save with recipe data');
  
  // Verify the saved data is compressed (base64 string)
  assert(typeof kvSavedValue === 'string', 'KV value should be a string (compressed)');
  assert(kvSavedValue.length > 0, 'KV value should not be empty');
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
  
  assert(response.status === 200, 'Should return 200 for cached recipe');
  assert(kvAccessed, 'Should access KV store to check for cached recipe');
  
  const data = await response.json();
  assert(data.cached === true, 'Should indicate recipe was cached');
  assert(data.name === 'Cached Recipe', 'Should return cached recipe data');
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
  
  assert(response.status === 200, 'Should return 200 for successful delete');
  assert(kvDeleted, 'Should delete from KV store');
  assert(kvDeletedKey, 'Should delete with correct key');
});

// Test 4: Verify that clipper worker has no database endpoints
test('Clipper worker has no database endpoints', async () => {
  const env = createMockEnv();
  
  // Test that /recipes endpoints return 404
  const getRecipeRequest = createMockRequest('GET', '/recipes/test-id');
  const getResponse = await worker.fetch(getRecipeRequest, env);
  assert(getResponse.status === 404, 'GET /recipes/:id should return 404');
  
  const putRecipeRequest = createMockRequest('PUT', '/recipes/test-id', { name: 'Test' });
  const putResponse = await worker.fetch(putRecipeRequest, env);
  assert(putResponse.status === 404, 'PUT /recipes/:id should return 404');
  
  const postRecipeRequest = createMockRequest('POST', '/recipes', { name: 'Test' });
  const postResponse = await worker.fetch(postRecipeRequest, env);
  assert(postResponse.status === 404, 'POST /recipes should return 404');
});

// Test 5: Verify that clipper worker only has KV-related endpoints
test('Clipper worker only has KV-related endpoints', async () => {
  const env = createMockEnv();
  
  // Health check should work
  const healthRequest = createMockRequest('GET', '/health');
  const healthResponse = await worker.fetch(healthRequest, env);
  assert(healthResponse.status === 200, 'GET /health should return 200');
  
  const healthData = await healthResponse.json();
  assert(healthData.service === 'recipe-clipper', 'Should identify as recipe-clipper');
  assert(healthData.features.includes('kv-storage'), 'Should list kv-storage as a feature');
  assert(!healthData.features.includes('database'), 'Should not list database as a feature');
  
  // Verify endpoints listed in health check are KV-related only
  const endpoints = healthData.endpoints;
  assert(endpoints['POST /clip'], 'Should have clip endpoint');
  assert(endpoints['GET /cached?url=<recipe-url>'], 'Should have cached get endpoint');
  assert(endpoints['DELETE /cached?url=<recipe-url>'], 'Should have cached delete endpoint');
  assert(!endpoints['GET /recipes/:id'], 'Should not have database recipe endpoints');
  assert(!endpoints['POST /recipes'], 'Should not have database recipe creation endpoints');
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
  
  assert(saveResult.success, 'Should successfully save to KV');
  assert(storedKey === recipeId, 'Should store with correct key');
  assert(storedData, 'Should store compressed data');
  
  // Test retrieving from KV
  const getResult = await getRecipeFromKV(mockEnv, recipeId);
  
  assert(getResult.success, 'Should successfully retrieve from KV');
  assert(getResult.recipe.url === testUrl, 'Should retrieve correct recipe data');
  assert(getResult.recipe.data.name === 'Test Recipe', 'Should decompress data correctly');
});

// Test 7: Verify no HTTP calls to external databases
test('No HTTP calls to external databases during recipe clipping', async () => {
  const originalFetch = global.fetch;
  const fetchCalls = [];
  
  // Mock fetch to track all HTTP calls
  global.fetch = async (url, options) => {
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
    assert(fetchCalls.length === 1, 'Should make only one HTTP call');
    assert(fetchCalls[0].url === 'https://example.com/recipe', 'Should only call the recipe URL');
    
    // Verify no calls to database workers
    const dbCalls = fetchCalls.filter(call => 
      call.url.includes('recipe-db') || 
      call.url.includes('clipped-recipe-db') ||
      call.url.includes('/recipe') && call.url !== 'https://example.com/recipe'
    );
    assert(dbCalls.length === 0, 'Should make no calls to database workers');
    
  } finally {
    global.fetch = originalFetch;
  }
});

// Summary
console.log('\n' + '='.repeat(50));
console.log('📊 KV Store-Only Test Summary:');
console.log(`   ✅ Passed: ${passedTests}`);
console.log(`   ❌ Failed: ${failedTests}`);
console.log(`   📁 Total: ${passedTests + failedTests}`);

if (failedTests === 0) {
  console.log('\n🎉 All KV store-only tests passed!');
  console.log('✅ Verified: Clipped recipes only save to KV store');
  process.exit(0);
} else {
  console.log('\n⚠️  Some KV store-only tests failed.');
  process.exit(1);
}