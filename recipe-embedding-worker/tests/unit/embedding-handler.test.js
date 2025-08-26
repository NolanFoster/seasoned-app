import { describe, it, expect } from 'vitest';
import { handleEmbedding } from '../../src/handlers/embedding-handler.js';

describe('Embedding Handler', () => {
  const mockRecipe = {
    id: 'test-recipe-id',
    url: 'https://example.com/recipe',
    scrapedAt: '2024-01-01T00:00:00Z',
    data: {
      name: 'Test Recipe',
      description: 'A delicious test recipe',
      ingredients: ['1 cup flour', '2 eggs'],
      instructions: ['Mix ingredients', 'Bake for 30 minutes'],
      recipeYield: '4 servings',
      totalTime: '45 minutes'
    }
  };

  it('should process recipes and generate embeddings', async () => {
    const request = createMockRequest('/embed', 'POST', {});
    const env = getMockEnv();
    const corsHeaders = getMockCorsHeaders();

    // Mock KV list response
    env.RECIPE_STORAGE.list.mockResolvedValue({
      keys: [{ name: 'recipe-1' }, { name: 'recipe-2' }],
      list_complete: true
    });

    // Mock recipe data retrieval
    env.RECIPE_STORAGE.get.mockResolvedValue(JSON.stringify(mockRecipe));

    // Mock vectorize query (no existing embeddings)
    env.RECIPE_VECTORS.query.mockResolvedValue({ matches: [] });

    // Mock AI embedding generation
    env.AI.run.mockResolvedValue({
      data: [[0.1, 0.2, 0.3, 0.4, 0.5]]
    });

    // Mock vectorize upsert
    env.RECIPE_VECTORS.upsert.mockResolvedValue(true);

    const response = await handleEmbedding(request, env, corsHeaders);
    const data = await parseResponse(response);

    expect(response.status).toBe(200);
    expect(data.message).toBe('Embedding generation completed');
    expect(data.processed).toBe(2);
    expect(data.errors).toBe(0);
    expect(env.AI.run).toHaveBeenCalledWith('@cf/baai/bge-small-en-v1.5', {
      text: expect.stringContaining('Test Recipe')
    });
  });

  it('should skip recipes that already have embeddings', async () => {
    const request = createMockRequest('/embed', 'POST', {});
    const env = getMockEnv();
    const corsHeaders = getMockCorsHeaders();

    // Mock KV list response
    env.RECIPE_STORAGE.list.mockResolvedValue({
      keys: [{ name: 'recipe-1' }],
      list_complete: true
    });

    // Mock vectorize query to return existing embeddings (individual check)
    env.RECIPE_VECTORS.query.mockResolvedValue({
      matches: [{ id: 'recipe-1' }],
      cursor: null
    });

    const response = await handleEmbedding(request, env, corsHeaders);
    const data = await parseResponse(response);

    expect(response.status).toBe(200);
    expect(data.message).toBe('Embedding generation completed');
    expect(data.processed).toBe(0);
    expect(data.skipped).toBe(1);
    expect(data.details[0].reason).toBe('already_has_embedding');
    expect(env.AI.run).not.toHaveBeenCalled();
  });

  it('should handle empty recipe storage', async () => {
    const request = createMockRequest('/embed', 'POST', {});
    const env = getMockEnv();
    const corsHeaders = getMockCorsHeaders();

    // Mock empty KV list response
    env.RECIPE_STORAGE.list.mockResolvedValue({
      keys: [],
      list_complete: true
    });

    const response = await handleEmbedding(request, env, corsHeaders);
    const data = await parseResponse(response);

    expect(response.status).toBe(200);
    expect(data.message).toBe('No recipes found in storage');
    expect(data.processed).toBe(0);
  });

  it('should handle scheduled requests', async () => {
    const request = createMockRequest('/embed', 'POST', { scheduled: true });
    const env = getMockEnv();
    const corsHeaders = getMockCorsHeaders();

    // Mock empty KV list response for simplicity
    env.RECIPE_STORAGE.list.mockResolvedValue({
      keys: [],
      list_complete: true
    });

    const response = await handleEmbedding(request, env, corsHeaders);
    const data = await parseResponse(response);

    expect(response.status).toBe(200);
    expect(data.message).toBe('No recipes found in storage');
  });

  it('should handle AI embedding generation failures', async () => {
    const request = createMockRequest('/embed', 'POST', {});
    const env = getMockEnv();
    const corsHeaders = getMockCorsHeaders();

    // Mock KV list response
    env.RECIPE_STORAGE.list.mockResolvedValue({
      keys: [{ name: 'recipe-1' }],
      list_complete: true
    });

    // Mock recipe data retrieval
    env.RECIPE_STORAGE.get.mockResolvedValue(JSON.stringify(mockRecipe));

    // Mock vectorize query (no existing embeddings)
    env.RECIPE_VECTORS.query.mockResolvedValue({ matches: [] });

    // Mock AI failure
    env.AI.run.mockRejectedValue(new Error('AI service unavailable'));

    const response = await handleEmbedding(request, env, corsHeaders);
    const data = await parseResponse(response);

    expect(response.status).toBe(200);
    expect(data.processed).toBe(0);
    expect(data.errors).toBe(1);
  });

  it('should handle malformed recipe data', async () => {
    const request = createMockRequest('/embed', 'POST', {});
    const env = getMockEnv();
    const corsHeaders = getMockCorsHeaders();

    // Mock KV list response
    env.RECIPE_STORAGE.list.mockResolvedValue({
      keys: [{ name: 'recipe-1' }],
      list_complete: true
    });

    // Mock recipe data retrieval with null data
    env.RECIPE_STORAGE.get.mockResolvedValue(null);

    const response = await handleEmbedding(request, env, corsHeaders);
    const data = await parseResponse(response);

    expect(response.status).toBe(200);
    expect(data.processed).toBe(0);
    expect(data.skipped).toBe(1);
  });

  it('should handle errors gracefully', async () => {
    const request = createMockRequest('/embed', 'POST', {});
    const env = getMockEnv();
    const corsHeaders = getMockCorsHeaders();

    // Mock KV list to throw error
    env.RECIPE_STORAGE.list.mockRejectedValue(new Error('KV error'));

    const response = await handleEmbedding(request, env, corsHeaders);
    const data = await parseResponse(response);

    // The getRecipeKeys function now throws errors instead of returning empty array
    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to access recipe storage');
    expect(data.details).toBe('KV error');
  });

  it('should include CORS headers', async () => {
    const request = createMockRequest('/embed', 'POST', {});
    const env = getMockEnv();
    const corsHeaders = getMockCorsHeaders();

    // Mock empty KV list response
    env.RECIPE_STORAGE.list.mockResolvedValue({
      keys: [],
      list_complete: true
    });

    const response = await handleEmbedding(request, env, corsHeaders);

    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(response.headers.get('Content-Type')).toBe('application/json');
  });
});
