import { useState, useCallback } from 'react';
import { DEFAULT_SEARCH_STATE, SEARCH_STATUS } from '../types/index.js';

/**
 * Custom hook for search state management
 */
export const useSearchStore = () => {
  const [state, setState] = useState(DEFAULT_SEARCH_STATE);

  // Actions
  const actions = {
    // Set search query
    setQuery: useCallback((query) => {
      setState(prev => ({ ...prev, query }));
    }, []),

    // Set search results
    setResults: useCallback((results) => {
      setState(prev => ({ ...prev, results }));
    }, []),

    // Add more results (for pagination)
    addResults: useCallback((newResults) => {
      setState(prev => ({
        ...prev,
        results: [...prev.results, ...newResults]
      }));
    }, []),

    // Set search status
    setStatus: useCallback((status) => {
      setState(prev => ({ ...prev, status }));
    }, []),

    // Set search filters
    setFilters: useCallback((filters) => {
      setState(prev => ({ ...prev, filters }));
    }, []),

    // Update a specific filter
    updateFilter: useCallback((filterKey, filterValue) => {
      setState(prev => ({
        ...prev,
        filters: { ...prev.filters, [filterKey]: filterValue }
      }));
    }, []),

    // Clear all filters
    clearFilters: useCallback(() => {
      setState(prev => ({ ...prev, filters: {} }));
    }, []),

    // Set sort order
    setSortBy: useCallback((sortBy) => {
      setState(prev => ({ ...prev, sortBy }));
    }, []),

    // Set pagination
    setPage: useCallback((page) => {
      setState(prev => ({ ...prev, page }));
    }, []),

    // Set total results
    setTotalResults: useCallback((totalResults) => {
      setState(prev => ({ ...prev, totalResults }));
    }, []),

    // Set has more results
    setHasMore: useCallback((hasMore) => {
      setState(prev => ({ ...prev, hasMore }));
    }, []),

    // Clear search results
    clearResults: useCallback(() => {
      setState(prev => ({
        ...prev,
        results: [],
        status: SEARCH_STATUS.IDLE,
        page: 1,
        totalResults: 0,
        hasMore: false
      }));
    }, []),

    // Reset to initial state
    reset: useCallback(() => {
      setState(DEFAULT_SEARCH_STATE);
    }, []),

    // Set loading state
    setLoading: useCallback((isLoading) => {
      setState(prev => ({
        ...prev,
        status: isLoading ? SEARCH_STATUS.SEARCHING : SEARCH_STATUS.SUCCESS
      }));
    }, []),

    // Set error state
    setError: useCallback((error) => {
      setState(prev => ({
        ...prev,
        status: SEARCH_STATUS.ERROR,
        error
      }));
    }, []),

    // Clear error
    clearError: useCallback(() => {
      setState(prev => ({
        ...prev,
        status: prev.status === SEARCH_STATUS.ERROR ? SEARCH_STATUS.IDLE : prev.status,
        error: null
      }));
    }, [])
  };

  return {
    ...state,
    ...actions
  };
};
