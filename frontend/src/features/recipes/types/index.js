// Recipe-related types and interfaces

export const RECIPE_SOURCES = {
  CLIPPED: 'clipped',
  AI_GENERATED: 'ai_generated',
  MANUAL: 'manual'
};

export const RECIPE_STATUS = {
  LOADING: 'loading',
  LOADED: 'loaded',
  ERROR: 'error',
  SAVING: 'saving',
  SAVED: 'saved'
};

export const RECIPE_CATEGORIES = {
  BREAKFAST: 'breakfast',
  LUNCH: 'lunch',
  DINNER: 'dinner',
  DESSERT: 'dessert',
  SNACK: 'snack',
  BEVERAGE: 'beverage'
};

// Default recipe structure
export const DEFAULT_RECIPE = {
  id: null,
  name: '',
  description: '',
  ingredients: [],
  instructions: [],
  prepTime: '',
  cookTime: '',
  recipeYield: '',
  image: null,
  source: RECIPE_SOURCES.MANUAL,
  category: RECIPE_CATEGORIES.DINNER,
  createdAt: null,
  updatedAt: null
};

// Recipe validation schema
export const RECIPE_VALIDATION = {
  name: {
    required: true,
    minLength: 1,
    maxLength: 100
  },
  description: {
    maxLength: 500
  },
  ingredients: {
    minItems: 1
  },
  instructions: {
    minItems: 1
  },
  prepTime: {
    pattern: /^\d+(\s+(min|hour|hours|mins))?$/
  },
  cookTime: {
    pattern: /^\d+(\s+(min|hour|hours|mins))?$/
  }
};
