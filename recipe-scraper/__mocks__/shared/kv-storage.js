/**
 * Mock for shared/kv-storage.js
 */

export const generateRecipeId = jest.fn().mockImplementation(async (url) => {
  // Simple mock that returns a consistent hash for testing
  return 'mock-hash-' + Buffer.from(url).toString('base64').replace(/[^a-zA-Z0-9]/g, '').substring(0, 16);
});

export const saveRecipeToKV = jest.fn().mockResolvedValue(true);

export const getRecipeFromKV = jest.fn().mockResolvedValue(null);

export const listRecipesFromKV = jest.fn().mockResolvedValue({
  recipes: [],
  total: 0,
  cursor: null
});

export const deleteRecipeFromKV = jest.fn().mockResolvedValue(true);