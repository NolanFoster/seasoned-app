// Test to cover specific gaps in coverage
import './setup-crypto-polyfill.js';
import worker from '../src/recipe-clipper.js';

console.log('🧪 Running Coverage Gap Tests\n');

let passedTests = 0;
let failedTests = 0;

async function test(name, fn) {
  try {
    await fn();
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

// Mock the fetch function before any tests
global.fetch = async (url) => {
  // Mock HTML responses
  if (url.includes('example.com')) {
    return {
      ok: true,
      text: async () => '<html><body><h1>Recipe</h1></body></html>'
    };
  }
  
  // Mock recipe save worker
  if (url.includes('recipe-save-worker')) {
    return {
      ok: true,
      json: async () => ({ success: true, id: 'test-id' })
    };
  }
  
  throw new Error('Unexpected URL');
};

// Create environment with necessary mocks
const env = {
  RECIPE_STORE: {
    get: async () => null,
    put: async () => ({ success: true }),
    delete: async () => ({ success: true })
  },
  SAVE_WORKER_URL: 'https://recipe-save-worker.test',
  AI: {
    run: async () => ({
      response: JSON.stringify({
        source: {
          output: [{
            content: [{
              text: JSON.stringify({
                name: 'AI Recipe',
                image: 'https://example.com/ai.jpg',
                recipeIngredient: ['AI ingredient'],
                recipeInstructions: ['AI instruction']
              })
            }]
          }]
        }
      })
    })
  }
};

// Test 1: Health check endpoint
await test('GET /health returns ok', async () => {
  const request = new Request('https://worker.test/health', {
    method: 'GET'
  });
  
  const response = await worker.fetch(request, env);
  const result = await response.json();
  
  assert(response.status === 200);
  assert(result.status === 'ok');
});

// Test 2: OPTIONS request for CORS
await test('OPTIONS request returns CORS headers', async () => {
  const request = new Request('https://worker.test/clip', {
    method: 'OPTIONS'
  });
  
  const response = await worker.fetch(request, env);
  
  assert(response.status === 200);
  assert(response.headers.get('Access-Control-Allow-Origin') === '*');
});

// Test 3: JSON-LD with array keywords
await test('JSON-LD with array keywords', async () => {
  // Override fetch for this specific test
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    if (url.includes('example.com')) {
      return {
        ok: true,
        text: async () => `<html><head>
          <script type="application/ld+json">
          {
            "@context": "https://schema.org",
            "@type": "Recipe",
            "name": "Test",
            "image": "https://example.com/test.jpg",
            "recipeIngredient": ["flour"],
            "recipeInstructions": ["mix"],
            "keywords": ["easy", "quick"]
          }
          </script>
        </head></html>`
      };
    }
    return originalFetch(url);
  };
  
  const request = new Request('https://worker.test/clip', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: 'https://example.com/test' })
  });
  
  const response = await worker.fetch(request, env);
  const result = await response.json();
  
  assert(result.recipe);
  assert(result.recipe.keywords === 'easy, quick');
  
  // Restore original fetch
  global.fetch = originalFetch;
});

// Test 4: JSON-LD with string ingredients
await test('JSON-LD with string ingredients', async () => {
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    if (url.includes('example.com')) {
      return {
        ok: true,
        text: async () => `<html><head>
      <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "Recipe",
        "name": "String Ingredients",
        "image": "https://example.com/test.jpg",
        "recipeIngredient": "flour, eggs, sugar",
        "recipeInstructions": ["mix"]
      }
      </script>
    </head></html>`
  });
  
  const request = new Request('https://worker.test/clip', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: 'https://example.com/test' })
  });
  
  const response = await worker.fetch(request, env);
  const result = await response.json();
  
  assert(result.recipe);
  assert(Array.isArray(result.recipe.recipeIngredient));
  assert(result.recipe.recipeIngredient[0] === 'flour, eggs, sugar');
  
  global.fetch = originalFetch;
});

// Test 5: JSON-LD with object instructions  
await test('JSON-LD with object instructions', async () => {
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    if (url.includes('example.com')) {
      return {
        ok: true,
        text: async () => `<html><head>
      <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "Recipe",
        "name": "Object Instructions",
        "image": "https://example.com/test.jpg",
        "recipeIngredient": ["flour"],
        "recipeInstructions": [
          {"@type": "HowToStep", "text": "Step 1"},
          {"@type": "HowToStep", "name": "Step 2"},
          {"@type": "HowToStep", "description": "Step 3"}
        ]
      }
      </script>
    </head></html>`
  });
  
  const request = new Request('https://worker.test/clip', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: 'https://example.com/test' })
  });
  
  const response = await worker.fetch(request, env);
  const result = await response.json();
  
  assert(result.recipe);
  assert(result.recipe.instructions.length === 3);
  assert(result.recipe.instructions[0] === 'Step 1');
  assert(result.recipe.instructions[1] === 'Step 2');
  assert(result.recipe.instructions[2] === 'Step 3');
  
  global.fetch = originalFetch;
});

// Test 6: Invalid request method
await test('Invalid method returns 404', async () => {
  const request = new Request('https://worker.test/clip', {
    method: 'DELETE'
  });
  
  const response = await worker.fetch(request, env);
  
  assert(response.status === 404);
});

// Test 7: Missing URL in POST request
await test('Missing URL returns error', async () => {
  const request = new Request('https://worker.test/clip', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });
  
  const response = await worker.fetch(request, env);
  const result = await response.json();
  
  assert(response.status === 400 || result.error);
  assert(result.error && result.error.includes('URL'));
});

// Test 8: Recipe from cache
await test('Cached recipe is returned from KV store', async () => {
  const cachedRecipe = {
    name: 'Cached Recipe',
    image: 'https://example.com/cached.jpg',
    ingredients: ['cached ingredient'],
    instructions: ['cached instruction']
  };
  
  const envWithCache = {
    ...env,
    RECIPE_STORE: {
      get: async (key) => {
        if (key === 'recipe:https://example.com/cached') {
          return JSON.stringify({
            data: cachedRecipe,
            scrapedAt: new Date().toISOString()
          });
        }
        return null;
      },
      put: async () => ({ success: true }),
      delete: async () => ({ success: true })
    }
  };
  
  const request = new Request('https://worker.test/clip', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: 'https://example.com/cached' })
  });
  
  const response = await worker.fetch(request, envWithCache);
  const result = await response.json();
  
  assert(result.recipe);
  assert(result.recipe.name === 'Cached Recipe');
  assert(result.fromCache === true);
});

console.log('\n📊 Coverage Gap Test Summary:');
console.log(`   ✅ Passed: ${passedTests}`);
console.log(`   ❌ Failed: ${failedTests}`);
console.log(`   📁 Total: ${passedTests + failedTests}`);

if (failedTests === 0) {
  console.log('\n🎉 All coverage gap tests passed!');
} else {
  console.log('\n⚠️ Some tests failed.');
  process.exit(1);
}
