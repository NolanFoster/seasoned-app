import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useRecipes } from '../hooks/useRecipes';
import * as recipeAPI from '../../../api/recipes';

// Mock the API
vi.mock('../../../api/recipes');

describe('useRecipes Hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize with empty state', () => {
    const { result } = renderHook(() => useRecipes());
    
    expect(result.current.recipes).toEqual([]);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBe(null);
    expect(typeof result.current.loadRecipes).toBe('function');
  });

  it('should load recipes successfully', async () => {
    const mockRecipes = [
      { id: '1', name: 'Test Recipe 1' },
      { id: '2', name: 'Test Recipe 2' }
    ];
    
    recipeAPI.fetchRecipes.mockResolvedValue(mockRecipes);
    
    const { result } = renderHook(() => useRecipes());
    
    await act(async () => {
      await result.current.loadRecipes();
    });
    
    expect(result.current.recipes).toEqual(mockRecipes);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBe(null);
  });

  it('should handle load recipes error', async () => {
    const errorMessage = 'Failed to load recipes';
    recipeAPI.fetchRecipes.mockRejectedValue(new Error(errorMessage));
    
    const { result } = renderHook(() => useRecipes());
    
    await act(async () => {
      await result.current.loadRecipes();
    });
    
    expect(result.current.recipes).toEqual([]);
    expect(result.current.error).toBe(errorMessage);
    expect(result.current.isLoading).toBe(false);
  });

  it('should save recipe successfully', async () => {
    const mockRecipe = { name: 'New Recipe', ingredients: ['ingredient1'] };
    const savedRecipe = { id: '1', ...mockRecipe };
    
    recipeAPI.saveRecipe.mockResolvedValue(savedRecipe);
    
    const { result } = renderHook(() => useRecipes());
    
    await act(async () => {
      const saved = await result.current.saveRecipe(mockRecipe);
      expect(saved).toEqual(savedRecipe);
    });
    
    expect(result.current.recipes).toContain(savedRecipe);
  });

  it('should select and clear recipe', () => {
    const { result } = renderHook(() => useRecipes());
    const mockRecipe = { id: '1', name: 'Test Recipe' };
    
    act(() => {
      result.current.selectRecipe(mockRecipe);
    });
    
    expect(result.current.selectedRecipe).toEqual(mockRecipe);
    
    act(() => {
      result.current.clearSelectedRecipe();
    });
    
    expect(result.current.selectedRecipe).toBe(null);
  });

  it('should delete recipe', () => {
    const { result } = renderHook(() => useRecipes());
    const mockRecipes = [
      { id: '1', name: 'Recipe 1' },
      { id: '2', name: 'Recipe 2' }
    ];
    
    act(() => {
      result.current.setRecipes(mockRecipes);
    });
    
    act(() => {
      result.current.deleteRecipe('1');
    });
    
    expect(result.current.recipes).toHaveLength(1);
    expect(result.current.recipes[0].id).toBe('2');
  });
});
