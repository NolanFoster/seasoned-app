// Load crypto polyfill for Node.js test environment
import './setup-crypto-polyfill.js';

// Comprehensive test suite to achieve 85% code coverage
import worker from '../src/recipe-clipper.js';
import { extractRecipeFromAIResponse } from '../src/recipe-clipper.js';

console.log('🧪 Running Comprehensive Coverage Tests\n');

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

// Create proper mock environment
const createMockEnv = (overrides = {}) => ({
  RECIPE_STORAGE: {
    get: async (key) => null,
    put: async (key, value) => { return { success: true }; },
    delete: async (key) => { return { success: true }; },
    ...(overrides.RECIPE_STORAGE || overrides.RECIPES || {})
  },
  SAVE_WORKER_URL: 'https://recipe-save-worker.example.com',
  AI: {
    run: async (model, options) => {
      // Return properly formatted AI response
      return {
        response: JSON.stringify({
          source: {
            output: [{
              content: [{
                text: JSON.stringify({
                  name: 'Mock Recipe',
                  description: 'A mock recipe for testing',
                  image: 'https://example.com/recipe.jpg',
                  author: 'Test Chef',
                  datePublished: '2024-01-01',
                  prepTime: 'PT15M',
                  cookTime: 'PT30M',
                  totalTime: 'PT45M',
                  recipeYield: '4 servings',
                  recipeCategory: 'Main Course',
                  recipeCuisine: 'American',
                  keywords: 'test, mock, recipe',
                  recipeIngredient: ['ingredient 1', 'ingredient 2'],
                  recipeInstructions: ['step 1', 'step 2'],
                  nutrition: {
                    calories: '250',
                    proteinContent: '10g',
                    fatContent: '15g'
                  },
                  aggregateRating: {
                    ratingValue: 4.5,
                    reviewCount: 100
                  },
                  video: {
                    contentUrl: 'https://example.com/video.mp4'
                  }
                })
              }]
            }]
          }
        })
      };
    },
    ...overrides.AI
  }
});

// Mock fetch for HTML responses
global.fetch = async (url) => {
  // Handle recipe save worker
  if (url.includes('recipe-save-worker')) {
    return {
      ok: true,
      json: async () => ({ success: true, id: 'test-recipe-id' })
    };
  }
  
  if (url.includes('error')) {
    throw new Error('Fetch error');
  }
  
  if (url.includes('json-ld')) {
    return {
      ok: true,
      text: async () => `
        <html>
          <script type="application/ld+json">
          {
            "@context": "https://schema.org",
            "@type": "Recipe",
            "name": "JSON-LD Recipe",
            "image": "https://example.com/jsonld.jpg",
            "recipeIngredient": ["ingredient 1", "ingredient 2"],
            "recipeInstructions": "Mix and cook"
          }
          </script>
        </html>
      `
    };
  }
  
  if (url.includes('no-recipe')) {
    return {
      ok: true,
      text: async () => '<html><body>No recipe here</body></html>'
    };
  }
  
  if (url.includes('bad-response')) {
    return {
      ok: false,
      text: async () => 'Bad response'
    };
  }
  
  // Default response
  return {
    ok: true,
    text: async () => `
      <html>
        <head>
          <meta name="description" content="Test recipe description">
          <meta name="keywords" content="test, recipe">
        </head>
        <body>
          <div class="recipe">
            <h1>Test Recipe</h1>
            <div class="ingredients">
              <li>Ingredient 1</li>
              <li>Ingredient 2</li>
            </div>
            <div class="instructions">
              <li>Step 1</li>
              <li>Step 2</li>
            </div>
          </div>
        </body>
      </html>
    `
  };
};

// Helper to create mock requests
const createRequest = (method, path, body = null) => ({
  method,
  url: `https://worker.example.com${path}`,
  headers: new Headers({ 'Content-Type': 'application/json' }),
  json: async () => body
});

// Test all main endpoints
await test('OPTIONS request returns CORS headers', async () => {
  const env = createMockEnv();
  const request = createRequest('OPTIONS', '/clip');
  const response = await worker.fetch(request, env);
  
  assert(response.status === 200);
  assert(response.headers.get('Access-Control-Allow-Origin') === '*');
});

await test('GET /health returns ok status', async () => {
  const env = createMockEnv();
  const request = createRequest('GET', '/health');
  const response = await worker.fetch(request, env);
  
  assert(response.status === 200);
  const data = await response.json();
  assert(data.status === 'healthy');
  assert(data.service === 'recipe-clipper');
});

await test('POST /clip with missing URL returns 400', async () => {
  const env = createMockEnv();
  const request = createRequest('POST', '/clip', {});
  const response = await worker.fetch(request, env);
  
  assert(response.status === 400);
});

await test('POST /clip with valid URL extracts recipe', async () => {
  const env = createMockEnv();
  const request = createRequest('POST', '/clip', { 
    url: 'https://example.com/recipe' 
  });
  const response = await worker.fetch(request, env);
  
  assert(response.status === 200);
  const data = await response.json();
  assert(data.name === 'Mock Recipe');
  assert(data.ingredients.length === 2);
  assert(data.savedToKV === true);
});

await test('POST /clip with cached recipe returns from cache', async () => {
  const cachedRecipe = {
    name: 'Cached Recipe',
    ingredients: ['cached ingredient'],
    instructions: ['cached instruction'],
    recipeIngredient: ['cached ingredient'],
    recipeInstructions: [{ "@type": "HowToStep", text: 'cached instruction' }],
    image: 'https://example.com/cached.jpg',
    source_url: 'https://example.com/cached'
  };
  
  const env = createMockEnv({
    RECIPE_STORAGE: {
      get: async () => JSON.stringify(cachedRecipe)
    }
  });
  
  const request = createRequest('POST', '/clip', { 
    url: 'https://example.com/cached' 
  });
  const response = await worker.fetch(request, env);
  
  assert(response.status === 200);
  const data = await response.json();
  assert(data.name === 'Cached Recipe');
  assert(data.fromCache === true);
});

await test('POST /clip with JSON-LD recipe falls back to AI when incomplete', async () => {
  const env = createMockEnv();
  const request = createRequest('POST', '/clip', { 
    url: 'https://example.com/json-ld' 
  });
  const response = await worker.fetch(request, env);
  
  assert(response.status === 200);
  const data = await response.json();
  // Should use AI extraction when JSON-LD is incomplete (string instructions)
  assert(data.name === 'Mock Recipe'); // From AI mock
  assert(data.image === 'https://example.com/recipe.jpg'); // From AI mock
});

await test('POST /clip with no recipe returns error', async () => {
  const env = createMockEnv({
    AI: {
      run: async () => ({
        response: JSON.stringify({
          source: {
            output: [{
              content: [{
                text: 'null'
              }]
            }]
          }
        })
      })
    }
  });
  
  const request = createRequest('POST', '/clip', { 
    url: 'https://example.com/no-recipe' 
  });
  const response = await worker.fetch(request, env);
  
  assert(response.status === 404); // No recipe found
});

await test('POST /clip handles fetch errors', async () => {
  const env = createMockEnv();
  const request = createRequest('POST', '/clip', { 
    url: 'https://example.com/error' 
  });
  const response = await worker.fetch(request, env);
  
  assert(response.status === 500);
});

// These tests are for recipe management endpoints that the clipper doesn't have
// The clipper only has /clip, /health, and / endpoints
/*
await test('GET /recipes/:id returns recipe from KV', async () => {
  const storedRecipe = {
    data: { name: 'Stored Recipe' },
    scrapedAt: new Date().toISOString()
  };
  
  const env = createMockEnv({
    RECIPES: {
      get: async () => JSON.stringify(storedRecipe)
    }
  });
  
  const request = createRequest('GET', '/recipes/test-id');
  const response = await worker.fetch(request, env);
  
  assert(response.status === 200);
  const data = await response.json();
  assert(data.success === true);
  assert(data.recipe.data.name === 'Stored Recipe');
});

await test('GET /recipes/:id returns 404 for missing recipe', async () => {
  const env = createMockEnv();
  const request = createRequest('GET', '/recipes/missing');
  const response = await worker.fetch(request, env);
  
  assert(response.status === 404);
});

await test('DELETE /recipes/:id deletes recipe', async () => {
  let deleted = false;
  const env = createMockEnv({
    RECIPES: {
      delete: async () => { deleted = true; }
    }
  });
  
  const request = createRequest('DELETE', '/recipes/test-id');
  const response = await worker.fetch(request, env);
  
  assert(response.status === 200);
  assert(deleted === true);
});

await test('PUT /recipes/:id updates recipe', async () => {
  let updated = null;
  const env = createMockEnv({
    RECIPES: {
      put: async (key, value) => { 
        updated = JSON.parse(value);
      }
    }
  });
  
  const request = createRequest('PUT', '/recipes/test-id', {
    name: 'Updated Recipe'
  });
  const response = await worker.fetch(request, env);
  
  assert(response.status === 200);
  assert(updated.data.name === 'Updated Recipe');
});
*/

await test('Unknown route returns 404', async () => {
  const env = createMockEnv();
  const request = createRequest('GET', '/unknown');
  const response = await worker.fetch(request, env);
  
  assert(response.status === 404);
});

// Test extractRecipeFromAIResponse function directly
await test('extractRecipeFromAIResponse handles all field mappings', async () => {
  const response = {
    response: JSON.stringify({
      source: {
        output: [{
          content: [{
            text: JSON.stringify({
              title: 'Test Recipe', // title -> name
              image_url: 'https://example.com/image.jpg', // image_url -> image
              ingredients: ['ingredient 1'], // ingredients -> recipeIngredient
              instructions: 'Step 1\nStep 2', // string instructions
              prepTime: 'PT15M', // Standard field name
              cookTime: 'PT30M', // Standard field name
              servings: '4', // servings -> recipeYield
              nutrition: {
                calories: '250 cal',
                protein: '10g', // protein -> proteinContent
                fat: '5g', // fat -> fatContent
                carbs: '30g' // carbs -> carbohydrateContent
              }
            })
          }]
        }]
      }
    })
  };
  
  const result = extractRecipeFromAIResponse(response, 'https://example.com');
  assert(result.name === 'Test Recipe');
  assert(result.image === 'https://example.com/image.jpg');
  assert(result.ingredients.length === 1);
  assert(result.instructions.length === 2);
  assert(result.prepTime === 'PT15M');
  assert(result.cookTime === 'PT30M');
  assert(result.recipeYield === '4');
  assert(result.nutrition.calories === '250 cal');
  assert(result.nutrition.proteinContent === '10g');
  assert(result.nutrition.fatContent === '5g');
  assert(result.nutrition.carbohydrateContent === '30g');
});

await test('extractRecipeFromAIResponse handles array fields', async () => {
  const response = {
    response: JSON.stringify({
      source: {
        output: [{
          content: [{
            text: JSON.stringify({
              name: 'Array Test',
              image: ['https://example.com/1.jpg', 'https://example.com/2.jpg'],
              recipeIngredient: ['ingredient 1', 'ingredient 2'],
              recipeInstructions: ['step 1', 'step 2'],
              recipeYield: ['4 servings', '8 portions'],
              keywords: ['test', 'array']
            })
          }]
        }]
      }
    })
  };
  
  const result = extractRecipeFromAIResponse(response, 'https://example.com');
  assert(result.image === 'https://example.com/1.jpg');
  assert(result.recipeYield === '4 servings');
  assert(result.keywords === 'test, array');
});

await test('extractRecipeFromAIResponse handles object fields', async () => {
  const response = {
    response: JSON.stringify({
      source: {
        output: [{
          content: [{
            text: JSON.stringify({
              name: 'Object Test',
              image: 'https://example.com/image.jpg',
              author: { name: 'Chef Test' },
              recipeIngredient: ['ingredient'],
              recipeInstructions: [
                { '@type': 'HowToStep', text: 'Step 1' },
                { name: 'Step 2' }
              ]
            })
          }]
        }]
      }
    })
  };
  
  const result = extractRecipeFromAIResponse(response, 'https://example.com');
  assert(result.image === 'https://example.com/image.jpg');
  assert(result.author === 'Chef Test');
  assert(result.instructions.length === 2);
  assert(result.recipeInstructions[0].text === 'Step 1');
  assert(result.recipeInstructions[1].text === 'Step 2');
});

await test('extractRecipeFromAIResponse validates required fields', async () => {
  const response = {
    response: JSON.stringify({
      source: {
        output: [{
          content: [{
            text: JSON.stringify({
              name: 'Missing Fields',
              // Missing required fields: image, recipeIngredient, recipeInstructions
            })
          }]
        }]
      }
    })
  };
  
  const result = extractRecipeFromAIResponse(response, 'https://example.com');
  assert(result === null);
});

await test('extractRecipeFromAIResponse handles malformed response', async () => {
  const response = {
    response: JSON.stringify({
      source: {
        output: [{
          content: [{
            text: '{ invalid json'
          }]
        }]
      }
    })
  };
  
  const result = extractRecipeFromAIResponse(response, 'https://example.com');
  assert(result === null);
});

await test('extractRecipeFromAIResponse handles empty response', async () => {
  const response = {};
  const result = extractRecipeFromAIResponse(response, 'https://example.com');
  assert(result === null);
});

await test('extractRecipeFromAIResponse handles null response', async () => {
  const response = {
    response: JSON.stringify({
      source: {
        output: [{
          content: [{
            text: 'null'
          }]
        }]
      }
    })
  };
  
  const result = extractRecipeFromAIResponse(response, 'https://example.com');
  assert(result === null);
});

// Test error scenarios
await test('Handle JSON parse errors in request body', async () => {
  const env = createMockEnv();
  const request = {
    method: 'POST',
    url: 'https://worker.example.com/clip',
    headers: new Headers(),
    json: async () => { throw new Error('Invalid JSON'); }
  };
  
  const response = await worker.fetch(request, env);
  assert(response.status === 500);
});

await test('Handle KV storage errors gracefully', async () => {
  const env = createMockEnv({
    RECIPE_STORAGE: {
      get: async () => { throw new Error('KV error'); },
      put: async () => { throw new Error('KV error'); }
    }
  });
  
  const request = createRequest('POST', '/clip', { 
    url: 'https://example.com/recipe' 
  });
  const response = await worker.fetch(request, env);
  
  // Should still succeed even if KV get fails
  assert(response.status === 200);
  const data = await response.json();
  // KV get error is logged but doesn't affect save (which uses external service)
  assert(data.savedToKV === true);
});

await test('Handle bad HTTP response', async () => {
  const env = createMockEnv();
  const request = createRequest('POST', '/clip', { 
    url: 'https://example.com/bad-response' 
  });
  const response = await worker.fetch(request, env);
  
  assert(response.status === 500);
});

// Summary
console.log('\n' + '='.repeat(50));
console.log('📊 Comprehensive Coverage Test Summary:');
console.log(`   ✅ Passed: ${passedTests}`);
console.log(`   ❌ Failed: ${failedTests}`);
console.log(`   📁 Total: ${passedTests + failedTests}`);

if (failedTests === 0) {
  console.log('\n🎉 All comprehensive tests passed!');
  process.exit(0);
} else {
  console.log('\n⚠️  Some comprehensive tests failed.');
  process.exit(1);
}