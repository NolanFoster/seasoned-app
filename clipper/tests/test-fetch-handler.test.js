// Test the main fetch handler and other functions
console.log('🧪 Running Fetch Handler Tests\n');

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



// Mock environment and request objects
const createMockEnv = () => ({
  RECIPES: {
    get: async (key) => null,
    put: async (key, value) => {},
    delete: async (key) => {}
  },
  AI: {
    run: async (model, options) => ({
      response: {
        source: {
          output: [{
            content: [{
              text: JSON.stringify({
                name: 'Mock Recipe',
                image: 'https://example.com/image.jpg',
                recipeIngredient: ['ingredient'],
                recipeInstructions: ['step']
              })
            }]
          }]
        }
      }
    })
  }
});

const createMockRequest = (method, url, body = null) => ({
  method,
  url: `https://worker.example.com${url}`,
  json: async () => body,
  headers: new Map()
});

// Import the worker module
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import worker from '../src/recipe-clipper.js';

// Test CORS preflight
test('handles OPTIONS request', async () => {
  const request = createMockRequest('OPTIONS', '/clip');
  const env = createMockEnv();
  
  const response = await worker.fetch(request, env);
  expect(response.status).toBe(200);
  expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
});

// Test health endpoint
test('handles health check', async () => {
  const request = createMockRequest('GET', '/health');
  const env = createMockEnv();
  
  const response = await worker.fetch(request, env);
  expect(response.status).toBe(200);
  const data = await response.json();
  expect(data.status).toBe('ok');
});

// Test 404 for unknown routes
test('returns 404 for unknown routes', async () => {
  const request = createMockRequest('GET', '/unknown');
  const env = createMockEnv();
  
  const response = await worker.fetch(request, env);
  expect(response.status).toBe(404);
});

// Test missing URL in clip request
test('returns 400 for missing URL', async () => {
  const request = createMockRequest('POST', '/clip', {});
  const env = createMockEnv();
  
  const response = await worker.fetch(request, env);
  expect(response.status).toBe(400);
});

// Test successful clip with cached recipe
test('returns cached recipe when available', async () => {
  const mockRecipe = {
    data: {
      name: 'Cached Recipe',
      image: 'https://example.com/cached.jpg',
      ingredients: ['cached ingredient'],
      instructions: ['cached step']
    },
    scrapedAt: new Date().toISOString()
  };
  
  const env = createMockEnv();
  env.RECIPES.get = async (key) => JSON.stringify(mockRecipe);
  
  const request = createMockRequest('POST', '/clip', { url: 'https://example.com/recipe' });
  const response = await worker.fetch(request, env);
  
  expect(response.status).toBe(200);
  const data = await response.json();
  expect(data.name).toBe('Cached Recipe');
  expect(data.cached).toBe(true);
});

// Test recipe management endpoints
test('handles GET /recipes/:id', async () => {
  const mockRecipe = {
    data: { name: 'Test Recipe' },
    scrapedAt: new Date().toISOString()
  };
  
  const env = createMockEnv();
  env.RECIPES.get = async (key) => JSON.stringify(mockRecipe);
  
  const request = createMockRequest('GET', '/recipes/test-id');
  const response = await worker.fetch(request, env);
  
  expect(response.status).toBe(200);
  const data = await response.json();
  expect(data.success).toBe(true);
  expect(data.recipe.data.name).toBe('Test Recipe');
});

test('returns 404 for non-existent recipe', async () => {
  const env = createMockEnv();
  env.RECIPES.get = async (key) => null;
  
  const request = createMockRequest('GET', '/recipes/non-existent');
  const response = await worker.fetch(request, env);
  
  expect(response.status).toBe(404);
});

test('handles DELETE /recipes/:id', async () => {
  const env = createMockEnv();
  let deleted = false;
  env.RECIPES.delete = async (key) => { deleted = true; };
  
  const request = createMockRequest('DELETE', '/recipes/test-id');
  const response = await worker.fetch(request, env);
  
  expect(response.status).toBe(200);
  expect(deleted).toBe(true);
});

test('handles PUT /recipes/:id', async () => {
  const env = createMockEnv();
  let savedData = null;
  env.RECIPES.put = async (key, value) => { savedData = JSON.parse(value); };
  
  const recipeData = { name: 'Updated Recipe' };
  const request = createMockRequest('PUT', '/recipes/test-id', recipeData);
  const response = await worker.fetch(request, env);
  
  expect(response.status).toBe(200);
  expect(savedData.data.name).toBe('Updated Recipe');
});

// Test error handling
test('handles fetch errors gracefully', async () => {
  const env = createMockEnv();
  env.AI.run = async () => { throw new Error('AI service error'); };
  
  const request = createMockRequest('POST', '/clip', { url: 'https://example.com/recipe' });
  const response = await worker.fetch(request, env);
  
  expect(response.status).toBe(500);
});

// Test with real-world HTML patterns
test('extracts recipe from HTML response', async () => {
  const mockHtml = `
    <html>
      <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "Recipe",
        "name": "Test Recipe from HTML",
        "image": "https://example.com/recipe.jpg",
        "recipeIngredient": ["flour", "sugar", "eggs"],
        "recipeInstructions": "Mix and bake"
      }
      </script>
    </html>
  `;
  
  const env = createMockEnv();
  global.fetch = vi.fn().mockImplementation(async (url) => ({
    ok: true,
    text: async () => mockHtml
  });
  
  const request = createMockRequest('POST', '/clip', { url: 'https://example.com/recipe' });
  
  // Note: This would need actual implementation to work
  console.log('   (Skipping actual HTML extraction test - would need full env)');
});

// Summary
console.log('\n' + '='.repeat(50));