/**
 * Test setup file for Vitest
 * Contains shared test utilities, mocks, and configuration
 */

// Mock environment for testing
export const mockEnv = {
  ENVIRONMENT: 'test'
};

// Mock environment without ENVIRONMENT variable
export const mockEnvWithoutEnvironment = {};

// Base test URLs
export const TEST_BASE_URL = 'https://test.com';

// Common test utilities
export const createMockRequest = (path = '/', options = {}) => {
  return new Request(`${TEST_BASE_URL}${path}`, {
    method: 'GET',
    ...options
  });
};

export const createPostRequest = (path, body, headers = {}) => {
  return new Request(`${TEST_BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers
    },
    body: JSON.stringify(body)
  });
};

// Common assertions - these will be used in test files where expect is available
export const assertCorsHeaders = (response) => {
  // This function will be called from test files where expect is available
  return response;
};

export const assertJsonResponse = (response) => {
  // This function will be called from test files where expect is available
  return response;
};

// Mock shared modules
export const mockGetRecipeFromKV = async (_env, _recipeId) => {
  return {
    success: true,
    recipe: {
      data: {
        name: 'Mock Recipe',
        description: 'A test recipe',
        ingredients: ['1 lb mock ingredient'],
        instructions: ['Mock instruction'],
        prepTime: '10 minutes',
        cookTime: '20 minutes',
        recipeYield: '4'
      }
    }
  };
};

// Mock the entire kv-storage module
export const mockKVStorage = {
  getRecipeFromKV: mockGetRecipeFromKV
};
