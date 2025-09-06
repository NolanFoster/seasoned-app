// Search-related types and interfaces

export const SEARCH_STATUS = {
  IDLE: 'idle',
  SEARCHING: 'searching',
  SUCCESS: 'success',
  ERROR: 'error'
};

export const SEARCH_TYPES = {
  RECIPES: 'recipes',
  INGREDIENTS: 'ingredients',
  CATEGORIES: 'categories',
  ALL: 'all'
};

export const SEARCH_FILTERS = {
  CUISINE: 'cuisine',
  DIETARY: 'dietary',
  COOKING_TIME: 'cooking_time',
  DIFFICULTY: 'difficulty',
  RATING: 'rating'
};

// Default search state
export const DEFAULT_SEARCH_STATE = {
  query: '',
  results: [],
  status: SEARCH_STATUS.IDLE,
  filters: {},
  sortBy: 'relevance',
  page: 1,
  totalResults: 0,
  hasMore: false
};

// Search validation
export const SEARCH_VALIDATION = {
  query: {
    minLength: 1,
    maxLength: 100
  },
  page: {
    min: 1,
    max: 1000
  }
};
