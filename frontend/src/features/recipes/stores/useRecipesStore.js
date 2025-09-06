import { useState, useCallback } from 'react';
import { generateRecipeId, validateRecipe } from '../utils/index.js';

// Initial state
const initialState = {
  recipes: [],
  selectedRecipe: null,
  editingRecipe: null,
  isLoading: false,
  isSaving: false,
  error: null,
  categories: [],
  recipesByCategory: new Map(),
  searchCache: new Map()
};

/**
 * Custom hook for recipe state management
 */
export const useRecipesStore = () => {
  const [state, setState] = useState(initialState);

  // Actions
  const actions = {
    // Set loading state
    setLoading: useCallback((isLoading) => {
      setState(prev => ({ ...prev, isLoading }));
    }, []),

    // Set error state
    setError: useCallback((error) => {
      setState(prev => ({ ...prev, error }));
    }, []),

    // Clear error
    clearError: useCallback(() => {
      setState(prev => ({ ...prev, error: null }));
    }, []),

    // Set recipes
    setRecipes: useCallback((recipes) => {
      setState(prev => ({
        ...prev,
        recipes,
        error: null
      }));
    }, []),

    // Add a new recipe
    addRecipe: useCallback((recipeData) => {
      const validation = validateRecipe(recipeData);
      if (!validation.isValid) {
        setState(prev => ({ ...prev, error: validation.errors }));
        return false;
      }

      const newRecipe = {
        ...recipeData,
        id: generateRecipeId(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      setState(prev => ({
        ...prev,
        recipes: [...prev.recipes, newRecipe],
        error: null
      }));
      return true;
    }, []),

    // Update an existing recipe
    updateRecipe: useCallback((recipeId, updates) => {
      const validation = validateRecipe({ ...updates });
      if (!validation.isValid) {
        setState(prev => ({ ...prev, error: validation.errors }));
        return false;
      }

      setState(prev => ({
        ...prev,
        recipes: prev.recipes.map(recipe =>
          recipe.id === recipeId
            ? { ...recipe, ...updates, updatedAt: new Date().toISOString() }
            : recipe
        ),
        error: null
      }));
      return true;
    }, []),

    // Delete a recipe
    deleteRecipe: useCallback((recipeId) => {
      setState(prev => ({
        ...prev,
        recipes: prev.recipes.filter(recipe => recipe.id !== recipeId),
        selectedRecipe: prev.selectedRecipe?.id === recipeId ? null : prev.selectedRecipe,
        editingRecipe: prev.editingRecipe?.id === recipeId ? null : prev.editingRecipe
      }));
    }, []),

    // Select a recipe
    selectRecipe: useCallback((recipe) => {
      setState(prev => ({ ...prev, selectedRecipe: recipe }));
    }, []),

    // Clear selected recipe
    clearSelectedRecipe: useCallback(() => {
      setState(prev => ({ ...prev, selectedRecipe: null }));
    }, []),

    // Set editing recipe
    setEditingRecipe: useCallback((recipe) => {
      setState(prev => ({ ...prev, editingRecipe: recipe }));
    }, []),

    // Clear editing recipe
    clearEditingRecipe: useCallback(() => {
      setState(prev => ({ ...prev, editingRecipe: null }));
    }, []),

    // Set saving state
    setSaving: useCallback((isSaving) => {
      setState(prev => ({ ...prev, isSaving }));
    }, []),

    // Set categories
    setCategories: useCallback((categories) => {
      setState(prev => ({ ...prev, categories }));
    }, []),

    // Set recipes by category
    setRecipesByCategory: useCallback((recipesByCategory) => {
      setState(prev => ({ ...prev, recipesByCategory }));
    }, []),

    // Add to search cache
    addToSearchCache: useCallback((query, results) => {
      setState(prev => ({
        ...prev,
        searchCache: new Map(prev.searchCache).set(query, results)
      }));
    }, []),

    // Get from search cache
    getFromSearchCache: useCallback((query) => {
      return state.searchCache.get(query);
    }, [state.searchCache]),

    // Clear search cache
    clearSearchCache: useCallback(() => {
      setState(prev => ({ ...prev, searchCache: new Map() }));
    }, []),

    // Reset to initial state
    reset: useCallback(() => {
      setState(initialState);
    }, [])
  };

  return {
    ...state,
    ...actions
  };
};
