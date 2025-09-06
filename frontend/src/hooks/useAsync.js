import { useState, useEffect, useCallback } from 'react';

/**
 * Custom hook for handling async operations
 */
export const useAsync = (asyncFunction, dependencies = []) => {
  const [state, setState] = useState({
    data: null,
    loading: false,
    error: null
  });

  const execute = useCallback(async (...args) => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    
    try {
      const data = await asyncFunction(...args);
      setState({ data, loading: false, error: null });
      return data;
    } catch (error) {
      setState({ data: null, loading: false, error });
      throw error;
    }
  }, dependencies);

  useEffect(() => {
    execute();
  }, [execute]);

  return {
    ...state,
    execute
  };
};
