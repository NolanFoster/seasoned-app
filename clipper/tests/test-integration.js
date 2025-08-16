// Comprehensive integration tests to increase code coverage
import worker from '../src/recipe-clipper.js';

console.log('🧪 Running Integration Tests\n');

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
    console.log(`   Stack: ${error.stack}`);
    failedTests++;
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

// Create comprehensive mock environment
const createMockEnv = (overrides = {}) => ({
  RECIPES: {
    get: async (key) => null,
    put: async (key, value) => {},
    delete: async (key) => {},
    ...overrides.RECIPES
  },
  AI: {
    run: async (model, options) => ({
      response: JSON.stringify({
        source: {
          output: [{
            content: [{
              text: JSON.stringify({
                name: 'AI Generated Recipe',
                description: 'A delicious AI-generated recipe',
                image: 'https://example.com/ai-recipe.jpg',
                author: 'AI Chef',
                datePublished: '2024-01-01',
                prepTime: 'PT15M',
                cookTime: 'PT30M', 
                totalTime: 'PT45M',
                recipeYield: '4 servings',
                recipeCategory: 'Main Course',
                recipeCuisine: 'International',
                keywords: 'easy, quick, delicious',
                recipeIngredient: [
                  '2 cups flour',
                  '1 cup sugar',
                  '3 eggs',
                  '1 tsp vanilla'
                ],
                recipeInstructions: [
                  'Preheat oven to 350°F',
                  'Mix dry ingredients',
                  'Add wet ingredients',
                  'Bake for 30 minutes'
                ],
                nutrition: {
                  calories: '250',
                  proteinContent: '5g',
                  fatContent: '10g',
                  carbohydrateContent: '35g'
                },
                aggregateRating: {
                  ratingValue: 4.5,
                  reviewCount: 100
                },
                video: {
                  contentUrl: 'https://example.com/recipe-video.mp4',
                  name: 'Recipe Tutorial'
                }
              })
            }]
          }]
        }
      })
    }),
    ...overrides.AI
  }
});

// Mock request helper
const createRequest = (method, path, body = null) => {
  const url = new URL(`https://worker.example.com${path}`);
  const headers = new Headers({
    'Content-Type': 'application/json'
  });
  
  return {
    method,
    url: url.toString(),
    headers,
    json: async () => body,
    text: async () => JSON.stringify(body)
  };
};

// Mock global fetch for HTML fetching
global.fetch = async (url) => {
  // Return different HTML based on URL for testing different scenarios
  if (url.includes('json-ld-recipe')) {
    return {
      ok: true,
      text: async () => `
        <html>
          <head>
            <title>Recipe with JSON-LD</title>
            <meta name="description" content="A recipe with structured data">
          </head>
          <body>
            <script type="application/ld+json">
            {
              "@context": "https://schema.org",
              "@type": "Recipe",
              "name": "JSON-LD Recipe",
              "image": "https://example.com/jsonld-recipe.jpg",
              "author": {
                "@type": "Person",
                "name": "Chef JSON"
              },
              "datePublished": "2024-01-15",
              "description": "A recipe from JSON-LD",
              "prepTime": "PT20M",
              "cookTime": "PT40M",
              "totalTime": "PT60M",
              "recipeYield": "6 servings",
              "recipeCategory": "Dessert",
              "recipeCuisine": "French",
              "keywords": "chocolate, dessert, french",
              "recipeIngredient": [
                "200g dark chocolate",
                "100g butter",
                "3 eggs",
                "100g sugar"
              ],
              "recipeInstructions": [
                {
                  "@type": "HowToStep",
                  "text": "Melt chocolate and butter"
                },
                {
                  "@type": "HowToStep",
                  "text": "Beat eggs and sugar"
                },
                {
                  "@type": "HowToStep",
                  "text": "Combine and bake"
                }
              ],
              "nutrition": {
                "@type": "NutritionInformation",
                "calories": "350",
                "proteinContent": "8g",
                "fatContent": "20g",
                "carbohydrateContent": "40g"
              },
              "aggregateRating": {
                "@type": "AggregateRating",
                "ratingValue": "4.8",
                "reviewCount": "250"
              }
            }
            </script>
            <div class="recipe-content">
              <h1>JSON-LD Recipe</h1>
              <p class="description">A recipe from JSON-LD</p>
            </div>
          </body>
        </html>
      `
    };
  } else if (url.includes('no-recipe')) {
    return {
      ok: true,
      text: async () => `
        <html>
          <body>
            <h1>Not a Recipe Page</h1>
            <p>This page has no recipe content</p>
          </body>
        </html>
      `
    };
  } else if (url.includes('complex-html')) {
    return {
      ok: true, 
      text: async () => `
        <html>
          <head>
            <meta property="og:description" content="Complex recipe description">
            <meta name="keywords" content="complex, recipe, test">
          </head>
          <body>
            <nav>Navigation menu</nav>
            <div class="ad-banner">Advertisement</div>
            <article class="recipe-wrapper">
              <h1 itemprop="name">Complex HTML Recipe</h1>
              <span itemprop="author">Complex Chef</span>
              <time datetime="2024-01-20">January 20, 2024</time>
              <div itemprop="nutrition">
                <span itemprop="calories">300</span>
                <span itemprop="proteinContent">15g</span>
              </div>
              <div itemprop="aggregateRating">
                <span itemprop="ratingValue">4.2</span>
                <span itemprop="reviewCount">75</span>
              </div>
              <div class="recipe-yield">Makes 8 portions</div>
              <div class="prep-time">Prep: 25 minutes</div>
              <div class="cook-time">Cook: 45 minutes</div>
              <ul class="recipe-ingredients">
                <li>Ingredient 1</li>
                <li>Ingredient 2</li>
                <li>Ingredient 3</li>
              </ul>
              <ol class="recipe-instructions">
                <li>Step one of the recipe</li>
                <li>Step two of the recipe</li>
                <li>Step three of the recipe</li>
              </ol>
            </article>
            <div class="comments">User comments</div>
            <footer>Footer content</footer>
          </body>
        </html>
      `
    };
  } else if (url.includes('fetch-error')) {
    throw new Error('Network error');
  } else {
    // Default HTML response
    return {
      ok: true,
      text: async () => `
        <html>
          <body>
            <h1>Sample Recipe</h1>
            <div class="recipe">
              <p>A basic recipe page</p>
            </div>
          </body>
        </html>
      `
    };
  }
};

// Test cases
await test('Full recipe extraction with AI fallback', async () => {
  const env = createMockEnv();
  const request = createRequest('POST', '/clip', { 
    url: 'https://example.com/sample-recipe' 
  });
  
  const response = await worker.fetch(request, env);
  assert(response.status === 200, 'Should return 200');
  
  const data = await response.json();
  assert(data.name === 'AI Generated Recipe', 'Should extract recipe name');
  assert(data.ingredients.length === 4, 'Should have 4 ingredients');
  assert(data.instructions.length === 4, 'Should have 4 instructions');
  assert(data.nutrition.calories === '250', 'Should have nutrition data');
  assert(data.aggregateRating.ratingValue === 4.5, 'Should have rating');
});

await test('Recipe extraction from JSON-LD', async () => {
  const env = createMockEnv();
  const request = createRequest('POST', '/clip', { 
    url: 'https://example.com/json-ld-recipe' 
  });
  
  const response = await worker.fetch(request, env);
  assert(response.status === 200, 'Should return 200');
  
  const data = await response.json();
  assert(data.name === 'JSON-LD Recipe', 'Should extract from JSON-LD');
  assert(data.author === 'Chef JSON', 'Should extract author');
  assert(data.recipeCategory === 'Dessert', 'Should extract category');
  assert(data.recipeCuisine === 'French', 'Should extract cuisine');
});

await test('No recipe found scenario', async () => {
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
  assert(response.status === 404, 'Should return 404 for no recipe');
});

await test('Complex HTML extraction', async () => {
  const env = createMockEnv();
  const request = createRequest('POST', '/clip', { 
    url: 'https://example.com/complex-html' 
  });
  
  const response = await worker.fetch(request, env);
  assert(response.status === 200, 'Should handle complex HTML');
  
  const data = await response.json();
  assert(data.name === 'AI Generated Recipe', 'Should fall back to AI');
});

await test('Network error handling', async () => {
  const env = createMockEnv();
  const request = createRequest('POST', '/clip', { 
    url: 'https://example.com/fetch-error' 
  });
  
  const response = await worker.fetch(request, env);
  assert(response.status === 500, 'Should return 500 for network error');
});

await test('Recipe caching functionality', async () => {
  let kvStoreData = null;
  const env = createMockEnv({
    RECIPES: {
      get: async (key) => kvStoreData,
      put: async (key, value) => { kvStoreData = value; },
      delete: async (key) => { kvStoreData = null; }
    }
  });
  
  // First request - should save to KV
  const request1 = createRequest('POST', '/clip', { 
    url: 'https://example.com/cacheable-recipe' 
  });
  
  const response1 = await worker.fetch(request1, env);
  assert(response1.status === 200, 'First request should succeed');
  
  const data1 = await response1.json();
  assert(data1.cached === false, 'First request should not be cached');
  assert(data1.savedToKV === true, 'Should save to KV');
  assert(kvStoreData !== null, 'Should have saved data to KV');
  
  // Second request - should return cached
  const request2 = createRequest('POST', '/clip', { 
    url: 'https://example.com/cacheable-recipe' 
  });
  
  const response2 = await worker.fetch(request2, env);
  assert(response2.status === 200, 'Second request should succeed');
  
  const data2 = await response2.json();
  assert(data2.cached === true, 'Second request should be cached');
});

await test('GET /recipes/:id endpoint', async () => {
  const mockRecipe = {
    data: {
      name: 'Stored Recipe',
      ingredients: ['stored ingredient']
    },
    scrapedAt: new Date().toISOString()
  };
  
  const env = createMockEnv({
    RECIPES: {
      get: async (key) => JSON.stringify(mockRecipe)
    }
  });
  
  const request = createRequest('GET', '/recipes/test-recipe-id');
  const response = await worker.fetch(request, env);
  
  assert(response.status === 200, 'Should return 200');
  const data = await response.json();
  assert(data.success === true, 'Should indicate success');
  assert(data.recipe.data.name === 'Stored Recipe', 'Should return recipe data');
});

await test('DELETE /recipes/:id endpoint', async () => {
  let deleted = false;
  const env = createMockEnv({
    RECIPES: {
      delete: async (key) => { 
        deleted = true;
        assert(key === 'test-delete-id', 'Should delete correct key');
      }
    }
  });
  
  const request = createRequest('DELETE', '/recipes/test-delete-id');
  const response = await worker.fetch(request, env);
  
  assert(response.status === 200, 'Should return 200');
  assert(deleted === true, 'Should call delete');
});

await test('PUT /recipes/:id endpoint', async () => {
  let savedKey = null;
  let savedData = null;
  
  const env = createMockEnv({
    RECIPES: {
      put: async (key, value) => { 
        savedKey = key;
        savedData = JSON.parse(value);
      }
    }
  });
  
  const updateData = {
    name: 'Updated Recipe',
    ingredients: ['updated ingredient']
  };
  
  const request = createRequest('PUT', '/recipes/test-update-id', updateData);
  const response = await worker.fetch(request, env);
  
  assert(response.status === 200, 'Should return 200');
  assert(savedKey === 'test-update-id', 'Should save to correct key');
  assert(savedData.data.name === 'Updated Recipe', 'Should save updated data');
  assert(savedData.scrapedAt !== undefined, 'Should include timestamp');
});

await test('Health check endpoint', async () => {
  const env = createMockEnv();
  const request = createRequest('GET', '/health');
  const response = await worker.fetch(request, env);
  
  assert(response.status === 200, 'Should return 200');
  const data = await response.json();
  assert(data.status === 'ok', 'Should return ok status');
  assert(data.service === 'recipe-clipper-worker', 'Should identify service');
});

await test('CORS headers are present', async () => {
  const env = createMockEnv();
  const request = createRequest('OPTIONS', '/clip');
  const response = await worker.fetch(request, env);
  
  assert(response.headers.get('Access-Control-Allow-Origin') === '*', 'Should have CORS origin header');
  assert(response.headers.get('Access-Control-Allow-Methods').includes('POST'), 'Should allow POST');
  assert(response.headers.get('Access-Control-Allow-Headers').includes('Content-Type'), 'Should allow Content-Type header');
});

await test('Invalid JSON in request body', async () => {
  const env = createMockEnv();
  const request = {
    method: 'POST',
    url: 'https://worker.example.com/clip',
    headers: new Headers(),
    json: async () => { throw new Error('Invalid JSON'); }
  };
  
  const response = await worker.fetch(request, env);
  assert(response.status === 500, 'Should return 500 for invalid JSON');
});

await test('AI response with alternative field names', async () => {
  const env = createMockEnv({
    AI: {
      run: async () => ({
        response: JSON.stringify({
          source: {
            output: [{
              content: [{
                text: JSON.stringify({
                  title: 'Alternative Fields Recipe', // title instead of name
                  image_url: 'https://example.com/alt.jpg', // image_url instead of image
                  ingredients: ['alt ingredient 1', 'alt ingredient 2'], // ingredients instead of recipeIngredient
                  instructions: ['alt step 1', 'alt step 2'], // instructions instead of recipeInstructions
                  prep_time: '20 minutes',
                  cook_time: '40 minutes',
                  servings: '4',
                  difficulty: 'Medium'
                })
              }]
            }]
          }
        })
      })
    }
  });
  
  const request = createRequest('POST', '/clip', { 
    url: 'https://example.com/alternative-fields' 
  });
  
  const response = await worker.fetch(request, env);
  assert(response.status === 200, 'Should handle alternative field names');
  
  const data = await response.json();
  assert(data.name === 'Alternative Fields Recipe', 'Should map title to name');
  assert(data.image === 'https://example.com/alt.jpg', 'Should map image_url to image');
  assert(data.ingredients.length === 2, 'Should map ingredients');
  assert(data.recipeYield === '4', 'Should map servings to recipeYield');
});

await test('Recipe with complex nutrition formats', async () => {
  const env = createMockEnv({
    AI: {
      run: async () => ({
        response: JSON.stringify({
          source: {
            output: [{
              content: [{
                text: JSON.stringify({
                  name: 'Nutrition Test Recipe',
                  image: 'https://example.com/nutrition.jpg',
                  recipeIngredient: ['test ingredient'],
                  recipeInstructions: ['test step'],
                  nutrition: {
                    calories: '250 kcal',
                    protein: '15g',
                    fat: '10g',
                    carbs: '30g',
                    fiber: '5g',
                    sugar: '10g',
                    sodium: '500mg'
                  }
                })
              }]
            }]
          }
        })
      })
    }
  });
  
  const request = createRequest('POST', '/clip', { 
    url: 'https://example.com/nutrition-test' 
  });
  
  const response = await worker.fetch(request, env);
  const data = await response.json();
  
  assert(data.nutrition.calories === '250 kcal', 'Should preserve calorie format');
  assert(data.nutrition.proteinContent === '15g', 'Should map protein to proteinContent');
  assert(data.nutrition.fatContent === '10g', 'Should map fat to fatContent');
  assert(data.nutrition.carbohydrateContent === '30g', 'Should map carbs to carbohydrateContent');
  assert(data.nutrition.fiberContent === '5g', 'Should map fiber to fiberContent');
  assert(data.nutrition.sugarContent === '10g', 'Should map sugar to sugarContent');
  assert(data.nutrition.sodiumContent === '500mg', 'Should map sodium to sodiumContent');
});

// Summary
console.log('\n' + '='.repeat(50));
console.log('📊 Integration Test Summary:');
console.log(`   ✅ Passed: ${passedTests}`);
console.log(`   ❌ Failed: ${failedTests}`);
console.log(`   📁 Total: ${passedTests + failedTests}`);

if (failedTests === 0) {
  console.log('\n🎉 All integration tests passed!');
  process.exit(0);
} else {
  console.log('\n⚠️  Some integration tests failed.');
  process.exit(1);
}