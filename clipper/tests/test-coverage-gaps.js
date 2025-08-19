// Test to cover specific gaps in coverage
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

// Create environment with necessary mocks
const env = {
  RECIPE_STORE: {
    get: async () => null,
    put: async () => ({ success: true }),
    delete: async () => ({ success: true })
  },
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

// Test with array keywords
await test('JSON-LD with array keywords', async () => {
  global.fetch = async () => ({
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
  });
  
  const request = new Request('https://worker.test/clip', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: 'https://example.com/test' })
  });
  
  const response = await worker.fetch(request, env);
  const result = await response.json();
  
  assert(result.recipe);
  assert(result.recipe.keywords === 'easy, quick');
});

console.log('\n📊 Coverage Gap Test Summary:');
console.log(`   ✅ Passed: ${passedTests}`);
console.log(`   ❌ Failed: ${failedTests}`);
console.log(`   📁 Total: ${passedTests + failedTests}`);
