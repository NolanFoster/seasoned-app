import { useCallback, useRef } from 'react';
import { useSearchStore } from '../stores/useSearchStore.js';
import * as recipeAPI from '../../../api/recipes';
import { SEARCH_STATUS } from '../types/index.js';

/**
 * Hook for managing search functionality
 */
export const useSearch = () => {
  const searchStore = useSearchStore();
  const searchTimeoutRef = useRef(null);

  // Debounced search function
  const search = useCallback(async (query, options = {}) => {
    // Clear previous timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    // If query is empty, clear results
    if (!query.trim()) {
      searchStore.clearResults();
      return;
    }

    // Set loading state
    searchStore.setLoading(true);
    searchStore.setQuery(query);
    searchStore.clearError();

    // Debounce the search
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const results = await recipeAPI.searchRecipes(query);
        
        searchStore.setResults(results);
        searchStore.setTotalResults(results.length);
        searchStore.setHasMore(false); // Assuming no pagination for now
        searchStore.setPage(1);
      } catch (error) {
        console.error('Search error:', error);
        searchStore.setError(error.message);
        searchStore.setResults([]);
      } finally {
        searchStore.setLoading(false);
      }
    }, options.debounceMs || 300);
  }, [searchStore]);

  // Clear search
  const clearSearch = useCallback(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    searchStore.clearResults();
  }, [searchStore]);

  // Search with filters
  const searchWithFilters = useCallback(async (query, filters = {}) => {
    searchStore.setFilters(filters);
    await search(query);
  }, [search, searchStore]);

  // Sort results
  const sortResults = useCallback((sortBy) => {
    searchStore.setSortBy(sortBy);
    
    const sortedResults = [...searchStore.results].sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.name?.localeCompare(b.name) || 0;
        case 'cooking_time':
          return (a.cookTime || '').localeCompare(b.cookTime || '');
        case 'rating':
          return (b.rating || 0) - (a.rating || 0);
        case 'date':
          return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
        default:
          return 0;
      }
    });
    
    searchStore.setResults(sortedResults);
  }, [searchStore]);

  // Get search suggestions (mock implementation)
  const getSuggestions = useCallback(async (query) => {
    if (!query.trim()) return [];
    
    // This would typically call a suggestions API
    // For now, return empty array
    return [];
  }, []);

  // Check if search is active
  const isSearching = searchStore.status === SEARCH_STATUS.SEARCHING;
  const hasResults = searchStore.results.length > 0;
  const hasError = searchStore.status === SEARCH_STATUS.ERROR;

  return {
    // State
    query: searchStore.query,
    results: searchStore.results,
    status: searchStore.status,
    filters: searchStore.filters,
    sortBy: searchStore.sortBy,
    page: searchStore.page,
    totalResults: searchStore.totalResults,
    hasMore: searchStore.hasMore,
    error: searchStore.error,
    isSearching,
    hasResults,
    hasError,

    // Actions
    search,
    clearSearch,
    searchWithFilters,
    sortResults,
    getSuggestions,
    setQuery: searchStore.setQuery,
    setResults: searchStore.setResults,
    setFilters: searchStore.setFilters,
    updateFilter: searchStore.updateFilter,
    clearFilters: searchStore.clearFilters,
    setSortBy: searchStore.setSortBy,
    clearError: searchStore.clearError,
    reset: searchStore.reset
  };
};
