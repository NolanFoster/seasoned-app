// Test HTML extraction functions to increase coverage
import worker from '../src/recipe-clipper.js';

console.log('🧪 Running HTML Extraction Tests\n');

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

// Mock comprehensive HTML pages with various recipe formats
const htmlPages = {
  complexRecipe: `
    <html>
      <head>
        <meta name="description" content="A complex recipe with all metadata">
        <meta name="keywords" content="recipe, cooking, test">
        <meta property="og:description" content="OpenGraph description">
        <meta property="article:published_time" content="2024-01-15T10:00:00Z">
        <meta property="article:tag" content="dessert">
      </head>
      <body>
        <article itemscope itemtype="https://schema.org/Recipe">
          <h1 itemprop="name">Complex Recipe Title</h1>
          <span itemprop="author">Chef Author</span>
          <div itemprop="description">Recipe description text</div>
          <time datetime="2024-01-15" itemprop="datePublished">January 15, 2024</time>
          
          <div itemprop="nutrition" itemscope itemtype="https://schema.org/NutritionInformation">
            <span itemprop="calories">300 calories</span>
            <span itemprop="proteinContent">20g</span>
            <span itemprop="fatContent">15g</span>
            <span itemprop="carbohydrateContent">30g</span>
            <span itemprop="fiberContent">5g</span>
            <span itemprop="sugarContent">10g</span>
            <span itemprop="sodiumContent">500mg</span>
          </div>
          
          <div itemprop="aggregateRating" itemscope itemtype="https://schema.org/AggregateRating">
            <span itemprop="ratingValue">4.7</span>
            <span itemprop="reviewCount">150</span>
          </div>
          
          <div itemprop="video" itemscope itemtype="https://schema.org/VideoObject">
            <meta itemprop="contentUrl" content="https://example.com/recipe-video.mp4">
            <meta itemprop="name" content="Recipe Video">
            <meta itemprop="description" content="Video tutorial">
          </div>
          
          <span itemprop="recipeYield">8 servings</span>
          <span itemprop="recipeCategory">Main Course</span>
          <span itemprop="recipeCuisine">Italian</span>
          
          <div class="prep-time">
            <span itemprop="prepTime" content="PT30M">Prep: 30 minutes</span>
          </div>
          <div class="cook-time">
            <span itemprop="cookTime" content="PT1H">Cook: 1 hour</span>
          </div>
          <div class="total-time">
            <span itemprop="totalTime" content="PT1H30M">Total: 1 hour 30 minutes</span>
          </div>
          
          <ul class="recipe-ingredients">
            <li itemprop="recipeIngredient">2 cups flour</li>
            <li itemprop="recipeIngredient">1 cup sugar</li>
            <li itemprop="recipeIngredient">3 eggs</li>
          </ul>
          
          <ol class="recipe-instructions">
            <li itemprop="recipeInstructions">Preheat oven to 350°F</li>
            <li itemprop="recipeInstructions">Mix dry ingredients</li>
            <li itemprop="recipeInstructions">Add wet ingredients and bake</li>
          </ol>
        </article>
      </body>
    </html>
  `,
  
  jsonLdMultiple: `
    <html>
      <head>
        <script type="application/ld+json">
        {
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "WebPage",
              "name": "Recipe Page"
            },
            {
              "@type": "Recipe",
              "name": "JSON-LD Graph Recipe",
              "image": ["https://example.com/1.jpg", "https://example.com/2.jpg"],
              "author": {
                "@type": "Person",
                "name": "JSON Chef"
              },
              "datePublished": "2024-01-20",
              "description": "Recipe from @graph",
              "prepTime": "PT20M",
              "cookTime": "PT40M", 
              "totalTime": "PT1H",
              "keywords": ["keyword1", "keyword2", "keyword3"],
              "recipeYield": ["4 servings", "8 portions"],
              "recipeCategory": "Dessert",
              "recipeCuisine": "French",
              "recipeIngredient": [
                "ingredient 1",
                "ingredient 2"
              ],
              "recipeInstructions": [
                {
                  "@type": "HowToStep",
                  "name": "Step 1",
                  "text": "First step text"
                },
                {
                  "@type": "HowToStep", 
                  "text": "Second step text"
                }
              ],
              "nutrition": {
                "@type": "NutritionInformation",
                "calories": "250 calories",
                "proteinContent": "10g"
              },
              "aggregateRating": {
                "@type": "AggregateRating",
                "ratingValue": "4.5",
                "reviewCount": "200"
              },
              "video": {
                "@type": "VideoObject",
                "name": "Tutorial",
                "contentUrl": "https://example.com/video.mp4"
              }
            }
          ]
        }
        </script>
      </head>
      <body>
        <h1>Recipe with JSON-LD in @graph</h1>
      </body>
    </html>
  `,
  
  multipleJsonLd: `
    <html>
      <head>
        <script type="application/ld+json">
        {
          "@context": "https://schema.org",
          "@type": "WebSite",
          "name": "Recipe Site"
        }
        </script>
        <script type="application/ld+json">
        {
          "@context": "https://schema.org",
          "@type": "Recipe",
          "name": "Second Script Recipe",
          "image": "https://example.com/recipe2.jpg",
          "recipeIngredient": ["ingredient A", "ingredient B"],
          "recipeInstructions": "Simple instructions"
        }
        </script>
      </head>
      <body>
        <h1>Multiple JSON-LD scripts</h1>
      </body>
    </html>
  `,
  
  alternativeFormats: `
    <html>
      <body>
        <div class="recipe-wrapper">
          <h2 class="recipe-name">Alternative Format Recipe</h2>
          <div class="recipe-author">Alternative Chef</div>
          <div class="recipe-description">Alternative description</div>
          <div class="recipe-yield">Serves 6</div>
          <div class="recipe-category">Appetizer</div>
          <div class="recipe-cuisine">Mexican</div>
          <div class="prep-time">Preparation Time: 15 minutes</div>
          <div class="cook-time">Cooking Time: 25 minutes</div>
          <div class="total-time">Total: 40 minutes</div>
          <div class="recipe-rating">
            <span class="rating-value">4.8</span>
            <span class="review-count">75 reviews</span>
          </div>
          <ul class="ingredients-list">
            <li>Alternative ingredient 1</li>
            <li>Alternative ingredient 2</li>
          </ul>
          <div class="directions">
            <div class="step">Alternative step 1</div>
            <div class="step">Alternative step 2</div>
          </div>
        </div>
      </body>
    </html>
  `,
  
  minimalRecipe: `
    <html>
      <body>
        <h1>Minimal Recipe</h1>
        <p>Just a basic recipe with minimal info</p>
        <ul>
          <li>Basic ingredient</li>
        </ul>
        <ol>
          <li>Basic instruction</li>
        </ol>
      </body>
    </html>
  `,
  
  withAds: `
    <html>
      <body>
        <nav class="navigation">Navigation menu</nav>
        <div class="ad-banner">Advertisement</div>
        <div class="social-share">Share buttons</div>
        <article class="recipe">
          <h1>Recipe with Ads</h1>
          <div class="recipe-content">
            <ul class="ingredients">
              <li>Clean ingredient</li>
            </ul>
            <ol class="instructions">
              <li>Clean instruction</li>
            </ol>
          </div>
        </article>
        <div class="comments">User comments section</div>
        <footer>Footer content</footer>
      </body>
    </html>
  `
};

// Create mock environment with various AI responses
const createMockEnv = (aiResponse = null) => ({
  RECIPES: {
    get: async () => null,
    put: async () => ({ success: true }),
    delete: async () => ({ success: true })
  },
  AI: {
    run: async () => {
      if (aiResponse) return aiResponse;
      
      return {
        response: {
          source: {
            output: [{
              content: [{
                text: JSON.stringify({
                  name: 'AI Extracted Recipe',
                  image: 'https://example.com/ai.jpg',
                  recipeIngredient: ['AI ingredient'],
                  recipeInstructions: ['AI instruction']
                })
              }]
            }]
          }
        }
      };
    }
  }
});

// Mock fetch
global.fetch = async (url) => {
  const path = new URL(url).pathname;
  
  if (path.includes('complex')) {
    return { ok: true, text: async () => htmlPages.complexRecipe };
  } else if (path.includes('jsonld-graph')) {
    return { ok: true, text: async () => htmlPages.jsonLdMultiple };
  } else if (path.includes('multiple-jsonld')) {
    return { ok: true, text: async () => htmlPages.multipleJsonLd };
  } else if (path.includes('alternative')) {
    return { ok: true, text: async () => htmlPages.alternativeFormats };
  } else if (path.includes('minimal')) {
    return { ok: true, text: async () => htmlPages.minimalRecipe };
  } else if (path.includes('with-ads')) {
    return { ok: true, text: async () => htmlPages.withAds };
  } else if (path.includes('large')) {
    // Test truncation
    return { ok: true, text: async () => '<html>' + 'x'.repeat(200000) + '</html>' };
  }
  
  return { ok: true, text: async () => '<html><body>Default</body></html>' };
};

const createRequest = (url) => ({
  method: 'POST',
  url: 'https://worker.example.com/clip',
  headers: new Headers({ 'Content-Type': 'application/json' }),
  json: async () => ({ url })
});

// Tests
await test('Extract from complex HTML with all metadata', async () => {
  const env = createMockEnv();
  const request = createRequest('https://example.com/complex');
  const response = await worker.fetch(request, env);
  
  assert(response.status === 200);
  const data = await response.json();
  assert(data.name === 'AI Extracted Recipe');
});

await test('Extract from JSON-LD in @graph array', async () => {
  const env = createMockEnv();
  const request = createRequest('https://example.com/jsonld-graph');
  const response = await worker.fetch(request, env);
  
  assert(response.status === 200);
  const data = await response.json();
  assert(data.name === 'JSON-LD Graph Recipe');
  assert(data.author === 'JSON Chef');
  assert(data.recipeCategory === 'Dessert');
  assert(data.nutrition.calories === '250 calories');
  assert(data.aggregateRating.ratingValue === 4.5);
  assert(data.video.contentUrl === 'https://example.com/video.mp4');
});

await test('Extract from multiple JSON-LD scripts', async () => {
  const env = createMockEnv();
  const request = createRequest('https://example.com/multiple-jsonld');
  const response = await worker.fetch(request, env);
  
  assert(response.status === 200);
  const data = await response.json();
  assert(data.name === 'Second Script Recipe');
});

await test('Extract from alternative HTML formats', async () => {
  const env = createMockEnv();
  const request = createRequest('https://example.com/alternative');
  const response = await worker.fetch(request, env);
  
  assert(response.status === 200);
  const data = await response.json();
  // Should fall back to AI since no structured data
  assert(data.name === 'AI Extracted Recipe');
});

await test('Extract from minimal recipe', async () => {
  const env = createMockEnv();
  const request = createRequest('https://example.com/minimal');
  const response = await worker.fetch(request, env);
  
  assert(response.status === 200);
  const data = await response.json();
  assert(data.name === 'AI Extracted Recipe');
});

await test('Clean HTML with ads and navigation', async () => {
  const env = createMockEnv();
  const request = createRequest('https://example.com/with-ads');
  const response = await worker.fetch(request, env);
  
  assert(response.status === 200);
  const data = await response.json();
  assert(data.name === 'AI Extracted Recipe');
});

await test('Handle large HTML truncation', async () => {
  const env = createMockEnv();
  const request = createRequest('https://example.com/large');
  const response = await worker.fetch(request, env);
  
  assert(response.status === 200);
  const data = await response.json();
  assert(data.name === 'AI Extracted Recipe');
});

await test('Handle recipe with time conversions', async () => {
  const env = createMockEnv({
    response: {
      source: {
        output: [{
          content: [{
            text: JSON.stringify({
              name: 'Time Test Recipe',
              image: 'https://example.com/time.jpg',
              recipeIngredient: ['ingredient'],
              recipeInstructions: ['instruction'],
              prepTime: '45 mins',
              cookTime: '1 hr 30 min',
              totalTime: '2 hours 15 minutes'
            })
          }]
        }]
      }
    }
  });
  
  const request = createRequest('https://example.com/time-test');
  const response = await worker.fetch(request, env);
  
  assert(response.status === 200);
  const data = await response.json();
  assert(data.prepTime === 'PT45M');
  assert(data.cookTime === 'PT1H30M');
  assert(data.totalTime === 'PT2H15M');
});

await test('Handle all nutrition field mappings', async () => {
  const env = createMockEnv({
    response: {
      source: {
        output: [{
          content: [{
            text: JSON.stringify({
              name: 'Nutrition Test',
              image: 'https://example.com/nutrition.jpg',
              recipeIngredient: ['ingredient'],
              recipeInstructions: ['instruction'],
              nutrition: {
                calories: '300 kcal',
                protein: '25g',
                fat: '10g',
                saturatedFat: '3g',
                unsaturatedFat: '7g',
                transFat: '0g',
                carbs: '40g',
                fiber: '8g',
                sugar: '15g',
                sodium: '600mg',
                cholesterol: '50mg'
              }
            })
          }]
        }]
      }
    }
  });
  
  const request = createRequest('https://example.com/nutrition-complete');
  const response = await worker.fetch(request, env);
  
  assert(response.status === 200);
  const data = await response.json();
  assert(data.nutrition.calories === '300 kcal');
  assert(data.nutrition.proteinContent === '25g');
  assert(data.nutrition.fatContent === '10g');
  assert(data.nutrition.saturatedFatContent === '3g');
  assert(data.nutrition.unsaturatedFatContent === '7g');
  assert(data.nutrition.transFatContent === '0g');
  assert(data.nutrition.carbohydrateContent === '40g');
  assert(data.nutrition.fiberContent === '8g');
  assert(data.nutrition.sugarContent === '15g');
  assert(data.nutrition.sodiumContent === '600mg');
  assert(data.nutrition.cholesterolContent === '50mg');
});

await test('Handle various instruction formats', async () => {
  const env = createMockEnv({
    response: {
      source: {
        output: [{
          content: [{
            text: JSON.stringify({
              name: 'Instruction Test',
              image: 'https://example.com/instruction.jpg',
              recipeIngredient: ['ingredient'],
              recipeInstructions: [
                'Simple string instruction',
                { text: 'Object with text' },
                { name: 'Object with name' },
                { '@type': 'HowToStep', text: 'Typed instruction' },
                {
                  '@type': 'HowToSection',
                  name: 'Section Name',
                  itemListElement: [
                    { text: 'Section step 1' },
                    { text: 'Section step 2' }
                  ]
                }
              ]
            })
          }]
        }]
      }
    }
  });
  
  const request = createRequest('https://example.com/instruction-formats');
  const response = await worker.fetch(request, env);
  
  assert(response.status === 200);
  const data = await response.json();
  assert(data.instructions.length >= 4);
  assert(data.recipeInstructions.every(inst => inst['@type'] === 'HowToStep'));
});

// Summary
console.log('\n' + '='.repeat(50));
console.log('📊 HTML Extraction Test Summary:');
console.log(`   ✅ Passed: ${passedTests}`);
console.log(`   ❌ Failed: ${failedTests}`);
console.log(`   📁 Total: ${passedTests + failedTests}`);

if (failedTests === 0) {
  console.log('\n🎉 All HTML extraction tests passed!');
  process.exit(0);
} else {
  console.log('\n⚠️  Some HTML extraction tests failed.');
  process.exit(1);
}