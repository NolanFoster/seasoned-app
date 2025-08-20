import { describe, it, expect, beforeAll } from 'vitest';
import { env, createExecutionContext, waitOnExecutionContext, SELF } from 'cloudflare:test';
import worker from '../src/recipe-clipper.js';

// Declare fetch mock (required for the module syntax)
const { fetchMock } = import.meta;

describe('Recipe Clipper Worker', () => {
  beforeAll(() => {
    // Enable fetch mocking
    fetchMock.activate();
    fetchMock.disableNetConnect();
  });

  describe('Basic functionality', () => {
    it('should handle OPTIONS requests', async () => {
      const request = new Request('http://localhost/clip', {
        method: 'OPTIONS'
      });

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);
      
      expect(response.status).toBe(200);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    });

    it('should reject POST without URL', async () => {
      const request = new Request('http://localhost/clip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);
      
      expect(response.status).toBe(400);
      expect(await response.text()).toBe('URL is required');
    });

    it('should handle health check', async () => {
      const request = new Request('http://localhost/health');

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);
      
      expect(response.status).toBe(200);
      const result = await response.json();
      expect(result.status).toBe('healthy');
    });
  });

  describe('Recipe clipping', () => {
    it('should clip a recipe from URL', async () => {
      // Mock the fetch for recipe URL
      const recipeUrl = fetchMock.get('https://example.com/test-recipe');
      recipeUrl.intercept({ path: '/' }).reply(200, `
        <html>
          <head>
            <title>Test Recipe</title>
            <meta property="og:description" content="A delicious test recipe">
          </head>
          <body>
            <h1>Test Recipe</h1>
            <div class="recipe">
              <div class="ingredients">
                <ul>
                  <li>1 cup flour</li>
                  <li>2 eggs</li>
                </ul>
              </div>
              <div class="instructions">
                <ol>
                  <li>Mix ingredients</li>
                  <li>Bake at 350F</li>
                </ol>
              </div>
            </div>
          </body>
        </html>
      `, {
        headers: { 'Content-Type': 'text/html' }
      });

      // Mock the save worker endpoint
      const saveWorker = fetchMock.get(env.SAVE_WORKER_URL);
      saveWorker.intercept({ path: /\/recipe\/.+/ }).reply(200, {
        success: false,
        message: 'Recipe not found'
      });

      const request = new Request('http://localhost/clip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'https://example.com/test-recipe' })
      });

      const ctx = createExecutionContext();
      const response = await worker.fetch(request, env, ctx);
      await waitOnExecutionContext(ctx);
      
      expect(response.status).toBe(200);
      const result = await response.json();
      expect(result.success).toBe(true);
      expect(result.recipe).toBeDefined();
      expect(result.recipe.name).toBeTruthy();
    });
  });
});