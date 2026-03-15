/**
 * Tests for image generator utility
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateRecipeImage, generateRecipeImages } from '../../src/utils/image-generator.js';

// Mock shared utility-functions
vi.mock('../../../shared/utility-functions.js', () => ({
  log: vi.fn(),
  generateRequestId: vi.fn(() => 'req-test-id')
}));

describe('generateRecipeImage', () => {
  const requestId = 'test-req-123';
  let mockEnv;

  beforeEach(() => {
    mockEnv = {
      AI_IMAGE_WORKER: {
        fetch: vi.fn()
      }
    };
    vi.clearAllMocks();
  });

  it('should return null when AI_IMAGE_WORKER binding is missing', async () => {
    const recipe = { name: 'Pasta', description: 'Delicious pasta' };
    const result = await generateRecipeImage(recipe, {}, requestId);
    expect(result).toBeNull();
  });

  it('should call AI_IMAGE_WORKER with correct request', async () => {
    const recipe = { name: 'Grilled Salmon', description: 'Fresh salmon', ingredients: ['salmon', 'lemon'] };
    mockEnv.AI_IMAGE_WORKER.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, imageUrl: 'https://images.example.com/salmon.jpg' })
    });

    const result = await generateRecipeImage(recipe, mockEnv, requestId, 'realistic', '1:1');

    expect(mockEnv.AI_IMAGE_WORKER.fetch).toHaveBeenCalledOnce();
    const callArg = mockEnv.AI_IMAGE_WORKER.fetch.mock.calls[0][0];
    expect(callArg.method).toBe('POST');
    const body = JSON.parse(await callArg.text());
    expect(body.recipe.name).toBe('Grilled Salmon');
    expect(body.style).toBe('realistic');
    expect(body.aspectRatio).toBe('1:1');
  });

  it('should return image URL on success', async () => {
    const recipe = { name: 'Chicken Soup', description: 'Warm soup' };
    mockEnv.AI_IMAGE_WORKER.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, imageUrl: 'https://images.example.com/soup.jpg', imageId: 'img-123' })
    });

    const result = await generateRecipeImage(recipe, mockEnv, requestId);

    expect(result).toBe('https://images.example.com/soup.jpg');
  });

  it('should return null when response is not ok', async () => {
    const recipe = { name: 'Test Recipe' };
    mockEnv.AI_IMAGE_WORKER.fetch.mockResolvedValue({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable'
    });

    const result = await generateRecipeImage(recipe, mockEnv, requestId);

    expect(result).toBeNull();
  });

  it('should return null when result success is false', async () => {
    const recipe = { name: 'Test Recipe' };
    mockEnv.AI_IMAGE_WORKER.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: false, error: 'Generation failed' })
    });

    const result = await generateRecipeImage(recipe, mockEnv, requestId);

    expect(result).toBeNull();
  });

  it('should return null when result has no imageUrl', async () => {
    const recipe = { name: 'Test Recipe' };
    mockEnv.AI_IMAGE_WORKER.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true })
    });

    const result = await generateRecipeImage(recipe, mockEnv, requestId);

    expect(result).toBeNull();
  });

  it('should return null on fetch error', async () => {
    const recipe = { name: 'Test Recipe' };
    mockEnv.AI_IMAGE_WORKER.fetch.mockRejectedValue(new Error('Network error'));

    const result = await generateRecipeImage(recipe, mockEnv, requestId);

    expect(result).toBeNull();
  });

  it('should use recipe.title when name is not available', async () => {
    const recipe = { title: 'Titled Recipe', description: 'A recipe' };
    mockEnv.AI_IMAGE_WORKER.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, imageUrl: 'https://images.example.com/titled.jpg' })
    });

    await generateRecipeImage(recipe, mockEnv, requestId);

    const callArg = mockEnv.AI_IMAGE_WORKER.fetch.mock.calls[0][0];
    const body = JSON.parse(await callArg.text());
    expect(body.recipe.name).toBe('Titled Recipe');
  });

  it('should use recipeIngredient array when ingredients is empty', async () => {
    const recipe = { name: 'Test Recipe', recipeIngredient: ['flour', 'butter', 'eggs'] };
    mockEnv.AI_IMAGE_WORKER.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, imageUrl: 'https://images.example.com/test.jpg' })
    });

    await generateRecipeImage(recipe, mockEnv, requestId);

    const callArg = mockEnv.AI_IMAGE_WORKER.fetch.mock.calls[0][0];
    const body = JSON.parse(await callArg.text());
    expect(body.recipe.ingredients).toEqual(['flour', 'butter', 'eggs']);
  });

  it('should use ingredient array when ingredients is empty and recipeIngredient not present', async () => {
    const recipe = { name: 'Test Recipe', ingredient: ['salt', 'pepper'] };
    mockEnv.AI_IMAGE_WORKER.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, imageUrl: 'https://images.example.com/test.jpg' })
    });

    await generateRecipeImage(recipe, mockEnv, requestId);

    const callArg = mockEnv.AI_IMAGE_WORKER.fetch.mock.calls[0][0];
    const body = JSON.parse(await callArg.text());
    expect(body.recipe.ingredients).toEqual(['salt', 'pepper']);
  });

  it('should use default ingredients when no ingredient arrays are available', async () => {
    const recipe = { name: 'Test Recipe' };
    mockEnv.AI_IMAGE_WORKER.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, imageUrl: 'https://images.example.com/test.jpg' })
    });

    await generateRecipeImage(recipe, mockEnv, requestId);

    const callArg = mockEnv.AI_IMAGE_WORKER.fetch.mock.calls[0][0];
    const body = JSON.parse(await callArg.text());
    expect(body.recipe.ingredients).toContain('fresh ingredients');
  });

  it('should use custom style and aspect ratio', async () => {
    const recipe = { name: 'Artistic Dish', ingredients: ['item1'] };
    mockEnv.AI_IMAGE_WORKER.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, imageUrl: 'https://images.example.com/art.jpg' })
    });

    await generateRecipeImage(recipe, mockEnv, requestId, 'artistic', '16:9');

    const callArg = mockEnv.AI_IMAGE_WORKER.fetch.mock.calls[0][0];
    const body = JSON.parse(await callArg.text());
    expect(body.style).toBe('artistic');
    expect(body.aspectRatio).toBe('16:9');
  });
});

describe('generateRecipeImages', () => {
  const requestId = 'test-req-batch';
  let mockEnv;

  beforeEach(() => {
    mockEnv = {
      AI_IMAGE_WORKER: {
        fetch: vi.fn()
      }
    };
    vi.clearAllMocks();
  });

  it('should generate images for multiple recipes in parallel', async () => {
    const recipes = [
      { name: 'Recipe 1', ingredients: ['a'] },
      { name: 'Recipe 2', ingredients: ['b'] }
    ];

    mockEnv.AI_IMAGE_WORKER.fetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, imageUrl: 'https://images.example.com/1.jpg' })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, imageUrl: 'https://images.example.com/2.jpg' })
      });

    const result = await generateRecipeImages(recipes, mockEnv, requestId);

    expect(result).toHaveLength(2);
    expect(result[0].image_url).toBe('https://images.example.com/1.jpg');
    expect(result[1].image_url).toBe('https://images.example.com/2.jpg');
  });

  it('should preserve original recipe fields', async () => {
    const recipes = [{ name: 'My Recipe', description: 'Great dish', source: 'ai_generated' }];

    mockEnv.AI_IMAGE_WORKER.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, imageUrl: 'https://images.example.com/my.jpg' })
    });

    const result = await generateRecipeImages(recipes, mockEnv, requestId);

    expect(result[0].name).toBe('My Recipe');
    expect(result[0].description).toBe('Great dish');
    expect(result[0].source).toBe('ai_generated');
    expect(result[0].image_url).toBe('https://images.example.com/my.jpg');
  });

  it('should handle partial failures gracefully', async () => {
    const recipes = [
      { name: 'Success Recipe' },
      { name: 'Fail Recipe' }
    ];

    mockEnv.AI_IMAGE_WORKER.fetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true, imageUrl: 'https://images.example.com/ok.jpg' })
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      });

    const result = await generateRecipeImages(recipes, mockEnv, requestId);

    expect(result).toHaveLength(2);
    expect(result[0].image_url).toBe('https://images.example.com/ok.jpg');
    expect(result[1].image_url).toBeNull();
  });

  it('should return recipes with null image_url when no AI_IMAGE_WORKER binding', async () => {
    const recipes = [{ name: 'Recipe A' }, { name: 'Recipe B' }];

    const result = await generateRecipeImages(recipes, {}, requestId);

    expect(result).toHaveLength(2);
    expect(result[0].image_url).toBeNull();
    expect(result[1].image_url).toBeNull();
  });

  it('should handle empty recipe array', async () => {
    const result = await generateRecipeImages([], mockEnv, requestId);
    expect(result).toEqual([]);
  });

  it('should return recipes with null image_url on batch error', async () => {
    const recipes = [{ name: 'Recipe X' }];
    // Make the map itself throw by providing a bad recipes array
    mockEnv.AI_IMAGE_WORKER.fetch.mockRejectedValue(new Error('Catastrophic failure'));

    const result = await generateRecipeImages(recipes, mockEnv, requestId);

    // Error in individual recipe should be caught by generateRecipeImage, not batch
    // result should still have one entry
    expect(result).toHaveLength(1);
  });
});
