import { useEffect, useCallback } from 'react';
import { useRecipesStore } from '../stores/useRecipesStore.js';
import * as recipeAPI from '../../../api/recipes';

/**
 * Hook for managing recipes with API integration
 */
export const useRecipes = () => {
  const recipesStore = useRecipesStore();

  // Note: loadRecipes should be called explicitly when needed

  // Load recipes from API
  const loadRecipes = useCallback(async () => {
    try {
      recipesStore.setLoading(true);
      recipesStore.clearError();
      
      const recipes = await recipeAPI.fetchRecipes();
      recipesStore.setRecipes(recipes);
    } catch (error) {
      recipesStore.setError(error.message);
    } finally {
      recipesStore.setLoading(false);
    }
  }, [recipesStore]);

  // Save recipe to API
  const saveRecipe = useCallback(async (recipeData) => {
    try {
      recipesStore.setSaving(true);
      recipesStore.clearError();
      
      const savedRecipe = await recipeAPI.saveRecipe(recipeData);
      recipesStore.addRecipe(savedRecipe);
      return savedRecipe;
    } catch (error) {
      recipesStore.setError(error.message);
      throw error;
    } finally {
      recipesStore.setSaving(false);
    }
  }, [recipesStore]);

  // Update recipe in API
  const updateRecipe = useCallback(async (recipeId, updates) => {
    try {
      recipesStore.setSaving(true);
      recipesStore.clearError();
      
      const updatedRecipe = await recipeAPI.updateRecipe(recipeId, updates);
      recipesStore.updateRecipe(recipeId, updatedRecipe);
      return updatedRecipe;
    } catch (error) {
      recipesStore.setError(error.message);
      throw error;
    } finally {
      recipesStore.setSaving(false);
    }
  }, [recipesStore]);

  // Delete recipe from API
  const deleteRecipe = useCallback(async (recipeId) => {
    try {
      recipesStore.setLoading(true);
      recipesStore.clearError();
      
      await recipeAPI.deleteRecipe(recipeId);
      recipesStore.deleteRecipe(recipeId);
    } catch (error) {
      recipesStore.setError(error.message);
      throw error;
    } finally {
      recipesStore.setLoading(false);
    }
  }, [recipesStore]);

  // Search recipes
  const searchRecipes = useCallback(async (query) => {
    if (!query.trim()) return [];

    // Check cache first
    const cachedResults = recipesStore.getFromSearchCache(query);
    if (cachedResults) {
      return cachedResults;
    }

    try {
      recipesStore.setLoading(true);
      recipesStore.clearError();
      
      const results = await recipeAPI.searchRecipes(query);
      recipesStore.addToSearchCache(query, results);
      return results;
    } catch (error) {
      recipesStore.setError(error.message);
      return [];
    } finally {
      recipesStore.setLoading(false);
    }
  }, [recipesStore]);

  // Clip recipe from URL
  const clipRecipe = useCallback(async (url) => {
    try {
      recipesStore.setLoading(true);
      recipesStore.clearError();
      
      const clippedRecipe = await recipeAPI.clipRecipe(url);
      return clippedRecipe;
    } catch (error) {
      recipesStore.setError(error.message);
      throw error;
    } finally {
      recipesStore.setLoading(false);
    }
  }, [recipesStore]);

  // Generate AI recipe
  const generateAIRecipe = useCallback(async (recipeData) => {
    try {
      recipesStore.setLoading(true);
      recipesStore.clearError();
      
      const generatedRecipe = await recipeAPI.generateAIRecipe(recipeData);
      return generatedRecipe;
    } catch (error) {
      recipesStore.setError(error.message);
      throw error;
    } finally {
      recipesStore.setLoading(false);
    }
  }, [recipesStore]);

  return {
    // State
    recipes: recipesStore.recipes,
    selectedRecipe: recipesStore.selectedRecipe,
    editingRecipe: recipesStore.editingRecipe,
    isLoading: recipesStore.isLoading,
    isSaving: recipesStore.isSaving,
    error: recipesStore.error,
    categories: recipesStore.categories,
    recipesByCategory: recipesStore.recipesByCategory,

    // Actions
    loadRecipes,
    saveRecipe,
    updateRecipe,
    deleteRecipe,
    searchRecipes,
    clipRecipe,
    generateAIRecipe,
    selectRecipe: recipesStore.selectRecipe,
    clearSelectedRecipe: recipesStore.clearSelectedRecipe,
    setEditingRecipe: recipesStore.setEditingRecipe,
    clearEditingRecipe: recipesStore.clearEditingRecipe,
    clearError: recipesStore.clearError,
    setCategories: recipesStore.setCategories,
    setRecipesByCategory: recipesStore.setRecipesByCategory,
    clearSearchCache: recipesStore.clearSearchCache,
    setRecipes: recipesStore.setRecipes,
    addRecipe: recipesStore.addRecipe
  };
};
