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

// Common assertions
export const assertCorsHeaders = (response) => {
  expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
  expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET, POST, OPTIONS');
  expect(response.headers.get('Access-Control-Allow-Headers')).toBe('Content-Type');
};

export const assertJsonResponse = (response) => {
  expect(response.headers.get('Content-Type')).toBe('application/json');
};
