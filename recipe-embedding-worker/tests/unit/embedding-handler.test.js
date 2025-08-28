import { describe, it, expect, beforeEach, vi } from 'vitest';
import { processEmbeddingMessage } from '../../src/handlers/embedding-handler.js';

describe('Embedding Handler - Queue Processing', () => {
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

  let mockEnv;

  beforeEach(() => {
    mockEnv = getMockEnv();
  });

  it('should successfully process a valid recipe ID', async () => {
    // Mock recipe data retrieval
    mockEnv.RECIPE_STORAGE.get.mockResolvedValue(JSON.stringify(mockRecipe));

    // Mock vectorize query (no existing embeddings)
    mockEnv.RECIPE_VECTORS.query.mockResolvedValue({ matches: [] });

    // Mock AI embedding generation
    mockEnv.AI.run.mockResolvedValue({
      data: [[0.1, 0.2, 0.3, 0.4, 0.5]]
    });

    // Mock vectorize upsert
    mockEnv.RECIPE_VECTORS.upsert.mockResolvedValue(true);

    const result = await processEmbeddingMessage('test-recipe-id', mockEnv);

    expect(result.success).toBe(true);
    expect(result.recipeId).toBe('test-recipe-id');
    expect(mockEnv.RECIPE_STORAGE.get).toHaveBeenCalledWith('test-recipe-id');
    expect(mockEnv.AI.run).toHaveBeenCalledWith('@cf/baai/bge-small-en-v1.5', {
      text: expect.stringContaining('Test Recipe')
    });
    expect(mockEnv.RECIPE_VECTORS.upsert).toHaveBeenCalled();
  });

  it('should skip recipes that already have embeddings', async () => {
    // Mock vectorize query to return existing embeddings
    mockEnv.RECIPE_VECTORS.query.mockResolvedValue({
      matches: [{ id: 'test-recipe-id' }]
    });

    const result = await processEmbeddingMessage('test-recipe-id', mockEnv);

    expect(result.success).toBe(false);
    expect(result.reason).toBe('already_has_embedding');
    expect(mockEnv.RECIPE_STORAGE.get).not.toHaveBeenCalled();
    expect(mockEnv.AI.run).not.toHaveBeenCalled();
  });

  it('should handle empty recipe ID', async () => {
    const result = await processEmbeddingMessage('', mockEnv);

    expect(result.success).toBe(false);
    expect(result.reason).toBe('invalid_recipe_id');
    expect(mockEnv.RECIPE_STORAGE.get).not.toHaveBeenCalled();
  });

  it('should handle null recipe ID', async () => {
    const result = await processEmbeddingMessage(null, mockEnv);

    expect(result.success).toBe(false);
    expect(result.reason).toBe('invalid_recipe_id');
    expect(mockEnv.RECIPE_STORAGE.get).not.toHaveBeenCalled();
  });

  it('should handle recipe not found in KV storage', async () => {
    // Mock KV storage to return null (recipe not found)
    mockEnv.RECIPE_STORAGE.get.mockResolvedValue(null);

    const result = await processEmbeddingMessage('test-recipe-id', mockEnv);

    expect(result.success).toBe(false);
    expect(result.reason).toBe('recipe_not_found');
    expect(mockEnv.AI.run).not.toHaveBeenCalled();
  });

  it('should handle recipe with no embedding text', async () => {
    const emptyRecipe = {
      data: {
        // Missing all text fields
      }
    };

    mockEnv.RECIPE_STORAGE.get.mockResolvedValue(JSON.stringify(emptyRecipe));
    mockEnv.RECIPE_VECTORS.query.mockResolvedValue({ matches: [] });

    const result = await processEmbeddingMessage('test-recipe-id', mockEnv);

    expect(result.success).toBe(false);
    expect(result.reason).toBe('no_embedding_text');
    expect(mockEnv.AI.run).not.toHaveBeenCalled();
  });

  it('should handle AI embedding generation failure', async () => {
    mockEnv.RECIPE_STORAGE.get.mockResolvedValue(JSON.stringify(mockRecipe));
    mockEnv.RECIPE_VECTORS.query.mockResolvedValue({ matches: [] });
    mockEnv.AI.run.mockResolvedValue(null); // AI returns null

    const result = await processEmbeddingMessage('test-recipe-id', mockEnv);

    expect(result.success).toBe(false);
    expect(result.reason).toBe('embedding_generation_failed');
    expect(mockEnv.RECIPE_VECTORS.upsert).not.toHaveBeenCalled();
  });

  it('should handle vectorize storage errors gracefully', async () => {
    mockEnv.RECIPE_STORAGE.get.mockResolvedValue(JSON.stringify(mockRecipe));
    mockEnv.RECIPE_VECTORS.query.mockResolvedValue({ matches: [] });
    mockEnv.AI.run.mockResolvedValue({
      data: [[0.1, 0.2, 0.3, 0.4, 0.5]]
    });
    mockEnv.RECIPE_VECTORS.upsert.mockRejectedValue(new Error('Vectorize error'));

    await expect(processEmbeddingMessage('test-recipe-id', mockEnv)).rejects.toThrow('Vectorize error');
  });

  it('should generate proper embedding text from recipe data', async () => {
    mockEnv.RECIPE_STORAGE.get.mockResolvedValue(JSON.stringify(mockRecipe));
    mockEnv.RECIPE_VECTORS.query.mockResolvedValue({ matches: [] });
    mockEnv.AI.run.mockResolvedValue({
      data: [[0.1, 0.2, 0.3, 0.4, 0.5]]
    });
    mockEnv.RECIPE_VECTORS.upsert.mockResolvedValue(true);

    const result = await processEmbeddingMessage('test-recipe-id', mockEnv);

    expect(result.success).toBe(true);
    expect(mockEnv.AI.run).toHaveBeenCalledWith('@cf/baai/bge-small-en-v1.5', {
      text: expect.stringContaining('Test Recipe')
    });
    
    // Verify the embedding text contains key recipe information
    const callArgs = mockEnv.AI.run.mock.calls[0][1];
    expect(callArgs.text).toContain('Test Recipe');
    expect(callArgs.text).toContain('A delicious test recipe');
    expect(callArgs.text).toContain('1 cup flour, 2 eggs');
    expect(callArgs.text).toContain('Mix ingredients Bake for 30 minutes');
    expect(callArgs.text).toContain('Serves: 4 servings');
    expect(callArgs.text).toContain('Cook time: 45 minutes');
  });

  it('should handle recipe data with nested structure', async () => {
    const nestedRecipe = {
      url: 'https://example.com/recipe',
      scrapedAt: '2024-01-01T00:00:00Z',
      data: {
        name: 'Nested Recipe',
        description: 'Recipe with nested data structure',
        ingredients: [
          { text: '1 cup flour' },
          { text: '2 eggs' }
        ],
        instructions: [
          { text: 'Mix ingredients' },
          { text: 'Bake for 30 minutes' }
        ]
      }
    };

    mockEnv.RECIPE_STORAGE.get.mockResolvedValue(JSON.stringify(nestedRecipe));
    mockEnv.RECIPE_VECTORS.query.mockResolvedValue({ matches: [] });
    mockEnv.AI.run.mockResolvedValue({
      data: [[0.1, 0.2, 0.3, 0.4, 0.5]]
    });
    mockEnv.RECIPE_VECTORS.upsert.mockResolvedValue(true);

    const result = await processEmbeddingMessage('test-recipe-id', mockEnv);

    expect(result.success).toBe(true);
    expect(mockEnv.AI.run).toHaveBeenCalledWith('@cf/baai/bge-small-en-v1.5', {
      text: expect.stringContaining('Nested Recipe')
    });
    
    // Verify nested structure is handled correctly
    const callArgs = mockEnv.AI.run.mock.calls[0][1];
    expect(callArgs.text).toContain('1 cup flour, 2 eggs');
    expect(callArgs.text).toContain('Mix ingredients Bake for 30 minutes');
  });
});
