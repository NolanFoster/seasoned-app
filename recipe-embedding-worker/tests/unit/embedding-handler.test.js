import { describe, it, expect, beforeEach } from 'vitest';
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

  it('should handle recipe with no valid text for embedding', async () => {
    // Create a recipe that will generate no meaningful text for embedding
    const recipeWithNoText = {
      data: {
        // No name or title
        // No description
        ingredients: [
          '',           // Empty string
          '   ',        // Whitespace only
          null,         // Null
          undefined     // Undefined
        ],
        instructions: [
          '',           // Empty string
          '   ',        // Whitespace only
          null,         // Null
          undefined     // Undefined
        ]
        // No other fields
      }
    };

    mockEnv.RECIPE_STORAGE.get.mockResolvedValue(JSON.stringify(recipeWithNoText));
    mockEnv.RECIPE_VECTORS.query.mockResolvedValue({ matches: [] });

    const result = await processEmbeddingMessage('test-recipe-id', mockEnv);

    expect(result.success).toBe(false);
    expect(result.reason).toBe('no_embedding_text');
  });

  it('should handle AI binding error in generateEmbedding', async () => {
    const validRecipe = {
      data: {
        name: 'Valid Recipe',
        description: 'A valid recipe for testing AI errors',
        ingredients: ['1 cup flour', '2 eggs'],
        instructions: ['Mix ingredients', 'Bake for 30 minutes']
      }
    };

    mockEnv.RECIPE_STORAGE.get.mockResolvedValue(JSON.stringify(validRecipe));
    mockEnv.RECIPE_VECTORS.query.mockResolvedValue({ matches: [] });

    // Mock AI binding to throw an error
    mockEnv.AI.run.mockRejectedValue(new Error('AI service unavailable'));

    const result = await processEmbeddingMessage('test-recipe-id', mockEnv);

    expect(result.success).toBe(false);
    expect(result.reason).toBe('embedding_generation_failed');
  });

  it('should handle AI response with invalid data structure', async () => {
    mockEnv.RECIPE_STORAGE.get.mockResolvedValue(JSON.stringify(mockRecipe));
    mockEnv.RECIPE_VECTORS.query.mockResolvedValue({ matches: [] });

    // Mock AI response with invalid structure
    mockEnv.AI.run.mockResolvedValue({
      data: 'invalid-data' // Should be an array
    });

    const result = await processEmbeddingMessage('test-recipe-id', mockEnv);

    expect(result.success).toBe(false);
    expect(result.reason).toBe('embedding_generation_failed');
  });

  it('should handle AI response with empty data array', async () => {
    mockEnv.RECIPE_STORAGE.get.mockResolvedValue(JSON.stringify(mockRecipe));
    mockEnv.RECIPE_VECTORS.query.mockResolvedValue({ matches: [] });

    // Mock AI response with empty data array
    mockEnv.AI.run.mockResolvedValue({
      data: []
    });

    const result = await processEmbeddingMessage('test-recipe-id', mockEnv);

    expect(result.success).toBe(false);
    expect(result.reason).toBe('embedding_generation_failed');
  });

  it('should handle AI response with null data', async () => {
    mockEnv.RECIPE_STORAGE.get.mockResolvedValue(JSON.stringify(mockRecipe));
    mockEnv.RECIPE_VECTORS.query.mockResolvedValue({ matches: [] });

    // Mock AI response with null data
    mockEnv.AI.run.mockResolvedValue({
      data: null
    });

    const result = await processEmbeddingMessage('test-recipe-id', mockEnv);

    expect(result.success).toBe(false);
    expect(result.reason).toBe('embedding_generation_failed');
  });

  it('should handle AI response with undefined data', async () => {
    mockEnv.RECIPE_STORAGE.get.mockResolvedValue(JSON.stringify(mockRecipe));
    mockEnv.RECIPE_VECTORS.query.mockResolvedValue({ matches: [] });

    // Mock AI response with undefined data
    mockEnv.AI.run.mockResolvedValue({
      data: undefined
    });

    const result = await processEmbeddingMessage('test-recipe-id', mockEnv);

    expect(result.success).toBe(false);
    expect(result.reason).toBe('embedding_generation_failed');
  });

  it('should handle AI response with non-array first element', async () => {
    mockEnv.RECIPE_STORAGE.get.mockResolvedValue(JSON.stringify(mockRecipe));
    mockEnv.RECIPE_VECTORS.query.mockResolvedValue({ matches: [] });

    // Mock AI response with non-array first element
    mockEnv.AI.run.mockResolvedValue({
      data: ['not-an-array']
    });

    const result = await processEmbeddingMessage('test-recipe-id', mockEnv);

    expect(result.success).toBe(false);
    expect(result.reason).toBe('embedding_generation_failed');
  });

  it('should handle recipe with string keywords', async () => {
    const recipeWithStringKeywords = {
      data: {
        name: 'Test Recipe',
        description: 'A delicious test recipe',
        keywords: 'test, recipe, delicious' // String instead of array
      }
    };

    mockEnv.RECIPE_STORAGE.get.mockResolvedValue(JSON.stringify(recipeWithStringKeywords));
    mockEnv.RECIPE_VECTORS.query.mockResolvedValue({ matches: [] });
    mockEnv.AI.run.mockResolvedValue({
      data: [[0.1, 0.2, 0.3, 0.4, 0.5]]
    });
    mockEnv.RECIPE_VECTORS.upsert.mockResolvedValue(true);

    const result = await processEmbeddingMessage('test-recipe-id', mockEnv);

    expect(result.success).toBe(true);
    expect(mockEnv.AI.run).toHaveBeenCalledWith('@cf/baai/bge-small-en-v1.5', {
      text: expect.stringContaining('Keywords: test, recipe, delicious')
    });
  });

  it('should handle recipe with missing optional fields gracefully', async () => {
    const minimalRecipe = {
      data: {
        name: 'Minimal Recipe'
        // Missing description, ingredients, instructions, etc.
      }
    };

    mockEnv.RECIPE_STORAGE.get.mockResolvedValue(JSON.stringify(minimalRecipe));
    mockEnv.RECIPE_VECTORS.query.mockResolvedValue({ matches: [] });
    mockEnv.AI.run.mockResolvedValue({
      data: [[0.1, 0.2, 0.3, 0.4, 0.5]]
    });
    mockEnv.RECIPE_VECTORS.upsert.mockResolvedValue(true);

    const result = await processEmbeddingMessage('test-recipe-id', mockEnv);

    expect(result.success).toBe(true);
    expect(mockEnv.AI.run).toHaveBeenCalledWith('@cf/baai/bge-small-en-v1.5', {
      text: expect.stringContaining('Minimal Recipe')
    });
  });

  it('should handle recipe with empty arrays gracefully', async () => {
    const recipeWithEmptyArrays = {
      data: {
        name: 'Empty Arrays Recipe',
        description: 'A recipe with empty arrays',
        ingredients: [],
        instructions: []
      }
    };

    mockEnv.RECIPE_STORAGE.get.mockResolvedValue(JSON.stringify(recipeWithEmptyArrays));
    mockEnv.RECIPE_VECTORS.query.mockResolvedValue({ matches: [] });
    mockEnv.AI.run.mockResolvedValue({
      data: [[0.1, 0.2, 0.3, 0.4, 0.5]]
    });
    mockEnv.RECIPE_VECTORS.upsert.mockResolvedValue(true);

    const result = await processEmbeddingMessage('test-recipe-id', mockEnv);

    expect(result.success).toBe(true);
    expect(mockEnv.AI.run).toHaveBeenCalledWith('@cf/baai/bge-small-en-v1.5', {
      text: expect.stringContaining('Empty Arrays Recipe')
    });

    // Verify empty arrays don't add text
    const callArgs = mockEnv.AI.run.mock.calls[0][1];
    expect(callArgs.text).not.toContain('Ingredients:');
    expect(callArgs.text).not.toContain('Instructions:');
  });

  it('should handle recipe with mixed data types in arrays', async () => {
    const recipeWithMixedTypes = {
      data: {
        name: 'Mixed Types Recipe',
        description: 'A recipe with mixed data types',
        ingredients: [
          '1 cup flour',
          { text: '2 eggs' },
          { name: '3 tbsp oil' }
        ],
        instructions: [
          'Mix ingredients',
          { text: 'Bake for 30 minutes' }
        ]
      }
    };

    mockEnv.RECIPE_STORAGE.get.mockResolvedValue(JSON.stringify(recipeWithMixedTypes));
    mockEnv.RECIPE_VECTORS.query.mockResolvedValue({ matches: [] });
    mockEnv.AI.run.mockResolvedValue({
      data: [[0.1, 0.2, 0.3, 0.4, 0.5]]
    });
    mockEnv.RECIPE_VECTORS.upsert.mockResolvedValue(true);

    const result = await processEmbeddingMessage('test-recipe-id', mockEnv);

    expect(result.success).toBe(true);
    expect(mockEnv.AI.run).toHaveBeenCalledWith('@cf/baai/bge-small-en-v1.5', {
      text: expect.stringContaining('Mixed Types Recipe')
    });

    // Verify mixed types are handled correctly
    const callArgs = mockEnv.AI.run.mock.calls[0][1];
    expect(callArgs.text).toContain('1 cup flour, 2 eggs, 3 tbsp oil');
    expect(callArgs.text).toContain('Mix ingredients Bake for 30 minutes');
  });

  it('should handle vectorize storage errors in storeEmbedding', async () => {
    mockEnv.RECIPE_STORAGE.get.mockResolvedValue(JSON.stringify(mockRecipe));
    mockEnv.RECIPE_VECTORS.query.mockResolvedValue({ matches: [] });
    mockEnv.AI.run.mockResolvedValue({
      data: [[0.1, 0.2, 0.3, 0.4, 0.5]]
    });

    // Mock vectorize upsert to throw error
    mockEnv.RECIPE_VECTORS.upsert.mockRejectedValue(new Error('Vectorize storage error'));

    await expect(processEmbeddingMessage('test-recipe-id', mockEnv)).rejects.toThrow('Vectorize storage error');
  });

  it('should handle checkExistingEmbedding with getByIds failure', async () => {
    // Mock getByIds to fail, forcing fallback to query method
    mockEnv.RECIPE_VECTORS.getByIds.mockRejectedValue(new Error('getByIds failed'));
    mockEnv.RECIPE_VECTORS.query.mockResolvedValue({ matches: [] });
    mockEnv.RECIPE_STORAGE.get.mockResolvedValue(JSON.stringify(mockRecipe));
    mockEnv.AI.run.mockResolvedValue({
      data: [[0.1, 0.2, 0.3, 0.4, 0.5]]
    });
    mockEnv.RECIPE_VECTORS.upsert.mockResolvedValue(true);

    const result = await processEmbeddingMessage('test-recipe-id', mockEnv);

    expect(result.success).toBe(true);
    // Verify that getByIds was called and failed, then query was used as fallback
    expect(mockEnv.RECIPE_VECTORS.getByIds).toHaveBeenCalledWith(['test-recipe-id']);
    expect(mockEnv.RECIPE_VECTORS.query).toHaveBeenCalled();
  });

  it('should handle checkExistingEmbedding with query failure', async () => {
    // Mock both getByIds and query to fail
    mockEnv.RECIPE_VECTORS.getByIds.mockRejectedValue(new Error('getByIds failed'));
    mockEnv.RECIPE_VECTORS.query.mockRejectedValue(new Error('query failed'));
    mockEnv.RECIPE_STORAGE.get.mockResolvedValue(JSON.stringify(mockRecipe));
    mockEnv.AI.run.mockResolvedValue({
      data: [[0.1, 0.2, 0.3, 0.4, 0.5]]
    });
    mockEnv.RECIPE_VECTORS.upsert.mockResolvedValue(true);

    const result = await processEmbeddingMessage('test-recipe-id', mockEnv);

    expect(result.success).toBe(true);
    // Even though both checks failed, we assume no existing embedding and proceed
    expect(mockEnv.RECIPE_VECTORS.getByIds).toHaveBeenCalledWith(['test-recipe-id']);
    expect(mockEnv.RECIPE_VECTORS.query).toHaveBeenCalled();
  });

  it('should handle recipe with all optional fields populated', async () => {
    const fullRecipe = {
      url: 'https://example.com/full-recipe',
      scrapedAt: '2024-01-01T00:00:00Z',
      data: {
        name: 'Full Recipe',
        description: 'A complete recipe with all fields',
        ingredients: [
          { text: '1 cup flour' },
          { text: '2 eggs' },
          { text: '3 tbsp oil' }
        ],
        instructions: [
          { text: 'Mix dry ingredients' },
          { text: 'Add wet ingredients' },
          { text: 'Bake for 30 minutes' }
        ],
        recipeYield: '4 servings',
        totalTime: '45 minutes',
        prepTime: '15 minutes',
        cookTime: '30 minutes',
        keywords: ['baking', 'dessert', 'homemade'],
        recipeCategory: 'Dessert',
        recipeCuisine: 'American',
        image: 'https://example.com/recipe-image.jpg'
      }
    };

    mockEnv.RECIPE_STORAGE.get.mockResolvedValue(JSON.stringify(fullRecipe));
    mockEnv.RECIPE_VECTORS.query.mockResolvedValue({ matches: [] });
    mockEnv.AI.run.mockResolvedValue({
      data: [[0.1, 0.2, 0.3, 0.4, 0.5]]
    });
    mockEnv.RECIPE_VECTORS.upsert.mockResolvedValue(true);

    const result = await processEmbeddingMessage('test-recipe-id', mockEnv);

    expect(result.success).toBe(true);
    expect(mockEnv.AI.run).toHaveBeenCalledWith('@cf/baai/bge-small-en-v1.5', {
      text: expect.stringContaining('Full Recipe')
    });

    // Verify all fields are included in the embedding text
    const callArgs = mockEnv.AI.run.mock.calls[0][1];
    expect(callArgs.text).toContain('Full Recipe');
    expect(callArgs.text).toContain('A complete recipe with all fields');
    expect(callArgs.text).toContain('1 cup flour, 2 eggs, 3 tbsp oil');
    expect(callArgs.text).toContain('Mix dry ingredients Add wet ingredients Bake for 30 minutes');
    expect(callArgs.text).toContain('Serves: 4 servings');
    expect(callArgs.text).toContain('Cook time: 45 minutes');
    expect(callArgs.text).toContain('Keywords: baking, dessert, homemade');
  });

  it('should handle recipe with very long text that gets truncated', async () => {
    const longRecipe = {
      data: {
        name: 'Very Long Recipe Name That Exceeds Normal Length',
        description: 'A'.repeat(1000), // Very long description
        ingredients: Array.from({ length: 50 }, (_, i) => `Ingredient ${i + 1}`),
        instructions: Array.from({ length: 100 }, (_, i) => `Step ${i + 1}: ${'A'.repeat(100)}`)
      }
    };

    mockEnv.RECIPE_STORAGE.get.mockResolvedValue(JSON.stringify(longRecipe));
    mockEnv.RECIPE_VECTORS.query.mockResolvedValue({ matches: [] });
    mockEnv.AI.run.mockResolvedValue({
      data: [[0.1, 0.2, 0.3, 0.4, 0.5]]
    });
    mockEnv.RECIPE_VECTORS.upsert.mockResolvedValue(true);

    const result = await processEmbeddingMessage('test-recipe-id', mockEnv);

    expect(result.success).toBe(true);
    expect(mockEnv.AI.run).toHaveBeenCalledWith('@cf/baai/bge-small-en-v1.5', {
      text: expect.any(String)
    });

    // Verify the text is truncated to reasonable length (8000 chars)
    const callArgs = mockEnv.AI.run.mock.calls[0][1];
    expect(callArgs.text.length).toBeLessThanOrEqual(8000);
    expect(callArgs.text).toContain('Very Long Recipe Name');
  });

  it('should handle recipe with special characters and unicode', async () => {
    const unicodeRecipe = {
      data: {
        name: 'Recipe with 🍕 🍰 🥗 special characters',
        description: 'A recipe with emojis and unicode: café, naïve, résumé',
        ingredients: [
          '1 cup flour 🥖',
          '2 eggs 🥚',
          '3 tbsp oil 🫒'
        ],
        instructions: [
          'Mix ingredients 🥄',
          'Bake for 30 minutes ⏰'
        ]
      }
    };

    mockEnv.RECIPE_STORAGE.get.mockResolvedValue(JSON.stringify(unicodeRecipe));
    mockEnv.RECIPE_VECTORS.query.mockResolvedValue({ matches: [] });
    mockEnv.AI.run.mockResolvedValue({
      data: [[0.1, 0.2, 0.3, 0.4, 0.5]]
    });
    mockEnv.RECIPE_VECTORS.upsert.mockResolvedValue(true);

    const result = await processEmbeddingMessage('test-recipe-id', mockEnv);

    expect(result.success).toBe(true);
    expect(mockEnv.AI.run).toHaveBeenCalledWith('@cf/baai/bge-small-en-v1.5', {
      text: expect.stringContaining('Recipe with 🍕 🍰 🥗 special characters')
    });

    // Verify unicode characters are preserved
    const callArgs = mockEnv.AI.run.mock.calls[0][1];
    expect(callArgs.text).toContain('🍕');
    expect(callArgs.text).toContain('café');
    expect(callArgs.text).toContain('🥖');
  });

  it('should handle recipe with mixed data types in ingredients', async () => {
    const recipeWithMixedTypes = {
      data: {
        name: 'Mixed Types Recipe',
        description: 'A recipe with mixed data types in ingredients',
        ingredients: [
          '1 cup flour',
          { text: '2 eggs' },
          { name: '3 tbsp oil' }
        ],
        instructions: ['Mix ingredients', 'Bake for 30 minutes']
      }
    };

    mockEnv.RECIPE_STORAGE.get.mockResolvedValue(JSON.stringify(recipeWithMixedTypes));
    mockEnv.RECIPE_VECTORS.query.mockResolvedValue({ matches: [] });
    mockEnv.AI.run.mockResolvedValue({
      data: [[0.1, 0.2, 0.3, 0.4, 0.5]]
    });
    mockEnv.RECIPE_VECTORS.upsert.mockResolvedValue(true);

    const result = await processEmbeddingMessage('test-recipe-id', mockEnv);

    expect(result.success).toBe(true);
    expect(mockEnv.AI.run).toHaveBeenCalledWith('@cf/baai/bge-small-en-v1.5', {
      text: expect.stringContaining('Mixed Types Recipe')
    });

    // Verify mixed types are handled correctly
    const callArgs = mockEnv.AI.run.mock.calls[0][1];
    expect(callArgs.text).toContain('1 cup flour, 2 eggs, 3 tbsp oil');
    expect(callArgs.text).toContain('Mix ingredients Bake for 30 minutes');
  });

  it('should handle recipe with mixed data types in instructions', async () => {
    const recipeWithMixedTypes = {
      data: {
        name: 'Mixed Types Instructions Recipe',
        description: 'A recipe with mixed data types in instructions',
        instructions: [
          'Mix ingredients',
          { text: 'Bake for 30 minutes' }
        ],
        ingredients: ['1 cup flour', '2 eggs', '3 tbsp oil']
      }
    };

    mockEnv.RECIPE_STORAGE.get.mockResolvedValue(JSON.stringify(recipeWithMixedTypes));
    mockEnv.RECIPE_VECTORS.query.mockResolvedValue({ matches: [] });
    mockEnv.AI.run.mockResolvedValue({
      data: [[0.1, 0.2, 0.3, 0.4, 0.5]]
    });
    mockEnv.RECIPE_VECTORS.upsert.mockResolvedValue(true);

    const result = await processEmbeddingMessage('test-recipe-id', mockEnv);

    expect(result.success).toBe(true);
    expect(mockEnv.AI.run).toHaveBeenCalledWith('@cf/baai/bge-small-en-v1.5', {
      text: expect.stringContaining('Mixed Types Instructions Recipe')
    });

    // Verify mixed types are handled correctly
    const callArgs = mockEnv.AI.run.mock.calls[0][1];
    expect(callArgs.text).toContain('Mix ingredients Bake for 30 minutes');
    expect(callArgs.text).toContain('1 cup flour, 2 eggs, 3 tbsp oil');
  });

  it('should handle recipe with whitespace-only ingredients that get filtered', async () => {
    const recipeWithWhitespaceIngredients = {
      data: {
        name: 'Whitespace Recipe',
        description: 'A recipe with whitespace-only ingredients',
        ingredients: [
          '   ',        // Whitespace only
          '\t\n',       // Tab and newline
          '  \n  '      // Mixed whitespace
        ],
        instructions: ['Mix ingredients', 'Bake for 30 minutes']
      }
    };

    mockEnv.RECIPE_STORAGE.get.mockResolvedValue(JSON.stringify(recipeWithWhitespaceIngredients));
    mockEnv.RECIPE_VECTORS.query.mockResolvedValue({ matches: [] });
    mockEnv.AI.run.mockResolvedValue({
      data: [[0.1, 0.2, 0.3, 0.4, 0.5]]
    });
    mockEnv.RECIPE_VECTORS.upsert.mockResolvedValue(true);

    const result = await processEmbeddingMessage('test-recipe-id', mockEnv);

    expect(result.success).toBe(true);
    expect(mockEnv.AI.run).toHaveBeenCalledWith('@cf/baai/bge-small-en-v1.5', {
      text: expect.stringContaining('Whitespace Recipe')
    });

    // Verify that whitespace-only ingredients don't add text
    const callArgs = mockEnv.AI.run.mock.calls[0][1];
    expect(callArgs.text).not.toContain('Ingredients:');
    expect(callArgs.text).toContain('Mix ingredients Bake for 30 minutes');
  });

  it('should handle recipe with yield and cook time', async () => {
    const recipeWithYieldAndTime = {
      data: {
        name: 'Yield and Time Recipe',
        description: 'A recipe with yield and cook time information',
        ingredients: ['1 cup flour', '2 eggs', '3 tbsp oil'],
        instructions: ['Mix ingredients', 'Bake for 30 minutes'],
        recipeYield: '4 servings',
        totalTime: '45 minutes'
      }
    };

    mockEnv.RECIPE_STORAGE.get.mockResolvedValue(JSON.stringify(recipeWithYieldAndTime));
    mockEnv.RECIPE_VECTORS.query.mockResolvedValue({ matches: [] });
    mockEnv.AI.run.mockResolvedValue({
      data: [[0.1, 0.2, 0.3, 0.4, 0.5]]
    });
    mockEnv.RECIPE_VECTORS.upsert.mockResolvedValue(true);

    const result = await processEmbeddingMessage('test-recipe-id', mockEnv);

    expect(result.success).toBe(true);
    expect(mockEnv.AI.run).toHaveBeenCalledWith('@cf/baai/bge-small-en-v1.5', {
      text: expect.stringContaining('Yield and Time Recipe')
    });

    // Verify that yield and cook time are included
    const callArgs = mockEnv.AI.run.mock.calls[0][1];
    expect(callArgs.text).toContain('Serves: 4 servings');
    expect(callArgs.text).toContain('Cook time: 45 minutes');
    expect(callArgs.text).toContain('1 cup flour, 2 eggs, 3 tbsp oil');
    expect(callArgs.text).toContain('Mix ingredients Bake for 30 minutes');
  });

  it('should handle recipe with whitespace-only ingredients that get filtered', async () => {
    const recipeWithWhitespaceIngredients = {
      data: {
        name: 'Whitespace Recipe',
        description: 'A recipe with whitespace-only ingredients',
        ingredients: [
          '   ',        // Whitespace only
          '\t\n',       // Tab and newline
          '  \n  '      // Mixed whitespace
        ],
        instructions: ['Mix ingredients', 'Bake for 30 minutes']
      }
    };

    mockEnv.RECIPE_STORAGE.get.mockResolvedValue(JSON.stringify(recipeWithWhitespaceIngredients));
    mockEnv.RECIPE_VECTORS.query.mockResolvedValue({ matches: [] });
    mockEnv.AI.run.mockResolvedValue({
      data: [[0.1, 0.2, 0.3, 0.4, 0.5]]
    });
    mockEnv.RECIPE_VECTORS.upsert.mockResolvedValue(true);

    const result = await processEmbeddingMessage('test-recipe-id', mockEnv);

    expect(result.success).toBe(true);
    expect(mockEnv.AI.run).toHaveBeenCalledWith('@cf/baai/bge-small-en-v1.5', {
      text: expect.stringContaining('Whitespace Recipe')
    });

    // Verify that whitespace-only ingredients don't add text
    const callArgs = mockEnv.AI.run.mock.calls[0][1];
    expect(callArgs.text).not.toContain('Ingredients:');
  });

  it('should handle recipe with minimal valid data', async () => {
    const minimalRecipe = {
      data: {
        name: 'Minimal Valid Recipe',
        description: 'Just a name and description'
        // No ingredients, instructions, or other fields
      }
    };

    mockEnv.RECIPE_STORAGE.get.mockResolvedValue(JSON.stringify(minimalRecipe));
    mockEnv.RECIPE_VECTORS.query.mockResolvedValue({ matches: [] });
    mockEnv.AI.run.mockResolvedValue({
      data: [[0.1, 0.2, 0.3, 0.4, 0.5]]
    });
    mockEnv.RECIPE_VECTORS.upsert.mockResolvedValue(true);

    const result = await processEmbeddingMessage('test-recipe-id', mockEnv);

    expect(result.success).toBe(true);
    expect(mockEnv.AI.run).toHaveBeenCalledWith('@cf/baai/bge-small-en-v1.5', {
      text: expect.stringContaining('Minimal Valid Recipe')
    });

    // Verify minimal text is generated
    const callArgs = mockEnv.AI.run.mock.calls[0][1];
    expect(callArgs.text).toContain('Minimal Valid Recipe');
    expect(callArgs.text).toContain('Just a name and description');
  });

  it('should handle recipe with missing url and image fields', async () => {
    const recipeWithoutUrlImage = {
      data: {
        name: 'No URL Recipe',
        description: 'A recipe without URL or image',
        ingredients: ['1 cup flour', '2 eggs'],
        instructions: ['Mix ingredients', 'Bake for 30 minutes']
        // Missing url, image, scrapedAt fields
      }
    };

    mockEnv.RECIPE_STORAGE.get.mockResolvedValue(JSON.stringify(recipeWithoutUrlImage));
    mockEnv.RECIPE_VECTORS.query.mockResolvedValue({ matches: [] });
    mockEnv.AI.run.mockResolvedValue({
      data: [[0.1, 0.2, 0.3, 0.4, 0.5]]
    });
    mockEnv.RECIPE_VECTORS.upsert.mockResolvedValue(true);

    const result = await processEmbeddingMessage('test-recipe-id', mockEnv);

    expect(result.success).toBe(true);
    expect(mockEnv.AI.run).toHaveBeenCalledWith('@cf/baai/bge-small-en-v1.5', {
      text: expect.stringContaining('No URL Recipe')
    });

    // Verify that the upsert call handles missing fields gracefully
    expect(mockEnv.RECIPE_VECTORS.upsert).toHaveBeenCalledWith([{
      id: 'test-recipe-id',
      values: [0.1, 0.2, 0.3, 0.4, 0.5],
      metadata: expect.objectContaining({
        title: 'No URL Recipe',
        url: '',
        image: '',
        scrapedAt: ''
      })
    }]);
  });

  it('should handle recipe with very long description that gets truncated', async () => {
    const recipeWithLongDescription = {
      data: {
        name: 'Long Description Recipe',
        description: 'A'.repeat(10000), // Very long description that will be truncated
        ingredients: ['1 cup flour', '2 eggs'],
        instructions: ['Mix ingredients', 'Bake for 30 minutes']
      }
    };

    mockEnv.RECIPE_STORAGE.get.mockResolvedValue(JSON.stringify(recipeWithLongDescription));
    mockEnv.RECIPE_VECTORS.query.mockResolvedValue({ matches: [] });
    mockEnv.AI.run.mockResolvedValue({
      data: [[0.1, 0.2, 0.3, 0.4, 0.5]]
    });
    mockEnv.RECIPE_VECTORS.upsert.mockResolvedValue(true);

    const result = await processEmbeddingMessage('test-recipe-id', mockEnv);

    expect(result.success).toBe(true);
    expect(mockEnv.AI.run).toHaveBeenCalledWith('@cf/baai/bge-small-en-v1.5', {
      text: expect.any(String)
    });

    // Verify the text is truncated to reasonable length (8000 chars)
    const callArgs = mockEnv.AI.run.mock.calls[0][1];
    expect(callArgs.text.length).toBeLessThanOrEqual(8000);
    expect(callArgs.text).toContain('Long Description Recipe');
  });

  it('should handle recipe with alternative field names', async () => {
    const recipeWithAltFields = {
      data: {
        title: 'Alternative Fields Recipe', // title instead of name
        description: 'A recipe with alternative field names',
        ingredients: ['1 cup flour', '2 eggs', '3 tbsp oil'],
        instructions: ['Mix ingredients', 'Bake for 30 minutes'],
        yield: '6 servings', // yield instead of recipeYield
        cookTime: '25 minutes' // cookTime instead of totalTime
      }
    };

    mockEnv.RECIPE_STORAGE.get.mockResolvedValue(JSON.stringify(recipeWithAltFields));
    mockEnv.RECIPE_VECTORS.query.mockResolvedValue({ matches: [] });
    mockEnv.AI.run.mockResolvedValue({
      data: [[0.1, 0.2, 0.3, 0.4, 0.5]]
    });
    mockEnv.RECIPE_VECTORS.upsert.mockResolvedValue(true);

    const result = await processEmbeddingMessage('test-recipe-id', mockEnv);

    expect(result.success).toBe(true);
    expect(mockEnv.AI.run).toHaveBeenCalledWith('@cf/baai/bge-small-en-v1.5', {
      text: expect.stringContaining('Alternative Fields Recipe')
    });

    // Verify that alternative field names are handled correctly
    const callArgs = mockEnv.AI.run.mock.calls[0][1];
    expect(callArgs.text).toContain('Alternative Fields Recipe');
    expect(callArgs.text).toContain('Serves: 6 servings');
    expect(callArgs.text).toContain('Cook time: 25 minutes');
  });

  it('should handle recipe with array keywords', async () => {
    const recipeWithArrayKeywords = {
      data: {
        name: 'Array Keywords Recipe',
        description: 'A recipe with array keywords',
        ingredients: ['1 cup flour', '2 eggs', '3 tbsp oil'],
        instructions: ['Mix ingredients', 'Bake for 30 minutes'],
        keywords: ['baking', 'dessert', 'easy']
      }
    };

    mockEnv.RECIPE_STORAGE.get.mockResolvedValue(JSON.stringify(recipeWithArrayKeywords));
    mockEnv.RECIPE_VECTORS.query.mockResolvedValue({ matches: [] });
    mockEnv.AI.run.mockResolvedValue({
      data: [[0.1, 0.2, 0.3, 0.4, 0.5]]
    });
    mockEnv.RECIPE_VECTORS.upsert.mockResolvedValue(true);

    const result = await processEmbeddingMessage('test-recipe-id', mockEnv);

    expect(result.success).toBe(true);
    expect(mockEnv.AI.run).toHaveBeenCalledWith('@cf/baai/bge-small-en-v1.5', {
      text: expect.stringContaining('Array Keywords Recipe')
    });

    // Verify that array keywords are handled correctly
    const callArgs = mockEnv.AI.run.mock.calls[0][1];
    expect(callArgs.text).toContain('Keywords: baking, dessert, easy');
  });

  it('should handle recipe with nested data structure', async () => {
    const recipeWithNestedData = {
      data: {
        name: 'Nested Data Recipe',
        description: 'A recipe with nested data structure',
        ingredients: ['1 cup flour', '2 eggs', '3 tbsp oil'],
        instructions: ['Mix ingredients', 'Bake for 30 minutes']
      }
    };

    mockEnv.RECIPE_STORAGE.get.mockResolvedValue(JSON.stringify(recipeWithNestedData));
    mockEnv.RECIPE_VECTORS.query.mockResolvedValue({ matches: [] });
    mockEnv.AI.run.mockResolvedValue({
      data: [[0.1, 0.2, 0.3, 0.4, 0.5]]
    });
    mockEnv.RECIPE_VECTORS.upsert.mockResolvedValue(true);

    const result = await processEmbeddingMessage('test-recipe-id', mockEnv);

    expect(result.success).toBe(true);
    expect(mockEnv.AI.run).toHaveBeenCalledWith('@cf/baai/bge-small-en-v1.5', {
      text: expect.stringContaining('Nested Data Recipe')
    });

    // Verify that nested data structure is handled correctly
    const callArgs = mockEnv.AI.run.mock.calls[0][1];
    expect(callArgs.text).toContain('Nested Data Recipe');
    expect(callArgs.text).toContain('1 cup flour, 2 eggs, 3 tbsp oil');
    expect(callArgs.text).toContain('Mix ingredients Bake for 30 minutes');
  });
});
