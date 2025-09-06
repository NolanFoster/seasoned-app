import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useSearch } from '../hooks/useSearch';
import * as recipeAPI from '../../../api/recipes';

// Mock the API
vi.mock('../../../api/recipes');

describe('useSearch Hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should initialize with empty state', () => {
    const { result } = renderHook(() => useSearch());
    
    expect(result.current.query).toBe('');
    expect(result.current.results).toEqual([]);
    expect(result.current.isSearching).toBe(false);
    expect(result.current.hasResults).toBe(false);
  });

  it('should search recipes with debouncing', async () => {
    const mockResults = [
      { id: '1', name: 'Search Result 1' },
      { id: '2', name: 'Search Result 2' }
    ];
    
    recipeAPI.searchRecipes.mockResolvedValue(mockResults);
    
    const { result } = renderHook(() => useSearch());
    
    act(() => {
      result.current.search('test query');
    });
    
    // Should be loading immediately
    expect(result.current.isSearching).toBe(true);
    
    // Fast-forward time to trigger debounced search
    act(() => {
      vi.advanceTimersByTime(300);
    });
    
    await act(async () => {
      // Wait for async operations
    });
    
    expect(recipeAPI.searchRecipes).toHaveBeenCalledWith('test query');
    expect(result.current.results).toEqual(mockResults);
    expect(result.current.isSearching).toBe(false);
    expect(result.current.hasResults).toBe(true);
  });

  it('should clear search results', () => {
    const { result } = renderHook(() => useSearch());
    
    // Set some results first
    act(() => {
      result.current.setResults([{ id: '1', name: 'Test' }]);
    });
    
    expect(result.current.hasResults).toBe(true);
    
    // Clear search
    act(() => {
      result.current.clearSearch();
    });
    
    expect(result.current.query).toBe('');
    expect(result.current.results).toEqual([]);
    expect(result.current.hasResults).toBe(false);
  });

  it('should handle search error', async () => {
    const errorMessage = 'Search failed';
    recipeAPI.searchRecipes.mockRejectedValue(new Error(errorMessage));
    
    const { result } = renderHook(() => useSearch());
    
    act(() => {
      result.current.search('test query');
    });
    
    act(() => {
      vi.advanceTimersByTime(300);
    });
    
    await act(async () => {
      // Wait for async operations
    });
    
    expect(result.current.error).toBe(errorMessage);
    expect(result.current.results).toEqual([]);
    expect(result.current.isSearching).toBe(false);
  });

  it('should not search with empty query', () => {
    const { result } = renderHook(() => useSearch());
    
    act(() => {
      result.current.search('');
    });
    
    act(() => {
      vi.advanceTimersByTime(300);
    });
    
    expect(recipeAPI.searchRecipes).not.toHaveBeenCalled();
    expect(result.current.results).toEqual([]);
  });

  it('should sort results correctly', () => {
    const { result } = renderHook(() => useSearch());
    
    const mockResults = [
      { id: '1', name: 'Zebra Recipe' },
      { id: '2', name: 'Apple Recipe' },
      { id: '3', name: 'Banana Recipe' }
    ];
    
    act(() => {
      result.current.setResults(mockResults);
    });
    
    act(() => {
      result.current.sortResults('name');
    });
    
    expect(result.current.results[0].name).toBe('Apple Recipe');
    expect(result.current.results[1].name).toBe('Banana Recipe');
    expect(result.current.results[2].name).toBe('Zebra Recipe');
  });
});
