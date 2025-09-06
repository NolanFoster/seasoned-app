// Recipe API functions

const API_URL = import.meta.env?.VITE_API_URL || 'https://test-api.example.com';
const CLIPPER_API_URL = import.meta.env?.VITE_CLIPPER_API_URL || 'https://test-clipper-api.example.com';
const SEARCH_DB_URL = import.meta.env?.VITE_SEARCH_DB_URL || 'https://test-search-api.example.com';
const RECIPE_VIEW_URL = import.meta.env?.VITE_RECIPE_VIEW_URL || 'https://test-recipe-view-api.example.com';
const RECIPE_GENERATION_URL = import.meta.env?.VITE_RECIPE_GENERATION_URL || 'https://test-recipe-generation-api.example.com';

/**
 * Fetch all recipes from the API
 */
export const fetchRecipes = async () => {
  try {
    const response = await fetch(`${API_URL}/recipes`);
    if (!response.ok) {
      throw new Error(`Failed to fetch recipes: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching recipes:', error);
    throw error;
  }
};

/**
 * Save a recipe to the API
 */
export const saveRecipe = async (recipeData) => {
  try {
    const response = await fetch(`${API_URL}/recipes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(recipeData),
    });

    if (!response.ok) {
      throw new Error(`Failed to save recipe: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error saving recipe:', error);
    throw error;
  }
};

/**
 * Update a recipe in the API
 */
export const updateRecipe = async (recipeId, recipeData) => {
  try {
    const response = await fetch(`${API_URL}/recipes/${recipeId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(recipeData),
    });

    if (!response.ok) {
      throw new Error(`Failed to update recipe: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error updating recipe:', error);
    throw error;
  }
};

/**
 * Delete a recipe from the API
 */
export const deleteRecipe = async (recipeId) => {
  try {
    const response = await fetch(`${API_URL}/recipes/${recipeId}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      throw new Error(`Failed to delete recipe: ${response.statusText}`);
    }

    return true;
  } catch (error) {
    console.error('Error deleting recipe:', error);
    throw error;
  }
};

/**
 * Search recipes
 */
export const searchRecipes = async (query) => {
  try {
    const response = await fetch(`${SEARCH_DB_URL}/search?q=${encodeURIComponent(query)}`);
    if (!response.ok) {
      throw new Error(`Failed to search recipes: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error searching recipes:', error);
    throw error;
  }
};

/**
 * Clip a recipe from URL
 */
export const clipRecipe = async (url) => {
  try {
    const response = await fetch(`${CLIPPER_API_URL}/clip`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url }),
    });

    if (!response.ok) {
      throw new Error(`Failed to clip recipe: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error clipping recipe:', error);
    throw error;
  }
};

/**
 * Generate AI recipe
 */
export const generateAIRecipe = async (recipeData) => {
  try {
    const response = await fetch(`${RECIPE_GENERATION_URL}/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(recipeData),
    });

    if (!response.ok) {
      throw new Error(`Failed to generate recipe: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error generating recipe:', error);
    throw error;
  }
};

/**
 * Get recipe by ID
 */
export const getRecipeById = async (recipeId) => {
  try {
    const response = await fetch(`${API_URL}/recipes/${recipeId}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch recipe: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching recipe:', error);
    throw error;
  }
};

/**
 * Get recipes by category
 */
export const getRecipesByCategory = async (category) => {
  try {
    const response = await fetch(`${API_URL}/recipes?category=${encodeURIComponent(category)}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch recipes by category: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching recipes by category:', error);
    throw error;
  }
};
