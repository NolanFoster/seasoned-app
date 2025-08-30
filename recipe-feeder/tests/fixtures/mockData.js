/**
 * Mock data for testing the recipe feeder worker
 */

export const mockRecipes = [
  { name: 'chocolate-chip-cookies' },
  { name: 'beef-stir-fry' },
  { name: 'caesar-salad' },
  { name: 'chicken-parmesan' },
  { name: 'vegetarian-pasta' },
  { name: 'banana-bread' },
  { name: 'fish-tacos' },
  { name: 'mushroom-risotto' },
  { name: 'apple-pie' },
  { name: 'grilled-salmon' }
];

export const mockVectorResults = {
  existingRecipe: {
    matches: [
      {
        id: 'chocolate-chip-cookies',
        score: 0.95,
        metadata: { recipeId: 'chocolate-chip-cookies' }
      }
    ]
  },
  missingRecipe: {
    matches: []
  },
  errorResult: null
};

export const mockKVResponses = {
  fullBatch: {
    keys: mockRecipes.slice(0, 5),
    cursor: 'next-cursor-123',
    list_complete: false
  },
  lastBatch: {
    keys: mockRecipes.slice(5),
    cursor: null,
    list_complete: true
  },
  emptyBatch: {
    keys: [],
    cursor: null,
    list_complete: true
  }
};

export const mockEnvironments = {
  development: {
    ENVIRONMENT: 'development',
    BATCH_SIZE: '50',
    RECIPE_STORAGE: {},
    RECIPE_VECTORS: {},
    EMBEDDING_QUEUE: {}
  },
  staging: {
    ENVIRONMENT: 'staging',
    BATCH_SIZE: '75',
    RECIPE_STORAGE: {},
    RECIPE_VECTORS: {},
    EMBEDDING_QUEUE: {}
  },
  production: {
    ENVIRONMENT: 'production',
    BATCH_SIZE: '100',
    RECIPE_STORAGE: {},
    RECIPE_VECTORS: {},
    EMBEDDING_QUEUE: {}
  }
};

export const mockQueueMessages = mockRecipes.map(recipe => ({
  body: recipe.name
}));

export const mockStats = {
  successful: {
    scanned: 10,
    existsInVector: 3,
    missingFromVector: 7,
    queued: 7,
    errors: 0,
    processingTimeMs: 1234
  },
  withErrors: {
    scanned: 10,
    existsInVector: 2,
    missingFromVector: 6,
    queued: 4,
    errors: 2,
    processingTimeMs: 2345
  },
  empty: {
    scanned: 0,
    existsInVector: 0,
    missingFromVector: 0,
    queued: 0,
    errors: 0,
    processingTimeMs: 123
  }
};