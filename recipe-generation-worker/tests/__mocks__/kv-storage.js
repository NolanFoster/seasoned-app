/**
 * Mock KV storage module for testing
 */

export async function getRecipeFromKV(_env, _recipeId) {
  return {
    success: true,
    recipe: {
      data: {
        name: 'Mock Recipe',
        description: 'A test recipe',
        ingredients: ['1 lb mock ingredient'],
        instructions: ['Mock instruction'],
        prepTime: '10 minutes',
        cookTime: '20 minutes',
        recipeYield: '4'
      }
    }
  };
}

export async function saveRecipeToKV(_env, _recipeId, _recipeData) {
  return { success: true };
}

export async function deleteRecipeFromKV(_env, _recipeId) {
  return { success: true };
}

export async function recipeExistsInKV(_env, _recipeId) {
  return true;
}

export async function listRecipesFromKV(_env, _options = {}) {
  return {
    success: true,
    recipes: []
  };
}

export async function getRecipeMetadata(_env, _recipeId) {
  return {
    success: true,
    metadata: {
      title: 'Mock Recipe',
      description: 'A test recipe'
    }
  };
}

export function generateRecipeId() {
  return 'mock-recipe-id';
}

export function compressData(data) {
  return data;
}

export function decompressData(compressedData) {
  return compressedData;
}

