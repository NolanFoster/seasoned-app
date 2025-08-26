// Global test setup
import { vi } from 'vitest';

// No external mocks needed

// Mock console methods to avoid test output pollution
vi.spyOn(console, 'log').mockImplementation(() => {});
vi.spyOn(console, 'warn').mockImplementation(() => {});
vi.spyOn(console, 'error').mockImplementation(() => {});

// Global test environment setup
global.fetch = fetch;
global.Request = Request;
global.Response = Response;
global.URL = URL;

// Mock environment variables for tests
global.getMockEnv = () => ({
  ENVIRONMENT: 'test',
  RECIPE_STORAGE: {
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    list: vi.fn()
  },
  RECIPE_VECTORS: {
    query: vi.fn(),
    upsert: vi.fn(),
    getByIds: vi.fn(),
    deleteByIds: vi.fn()
  },
  AI: {
    run: vi.fn()
  }
});

// Mock CORS headers
global.getMockCorsHeaders = () => ({
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
});

// Helper to create mock requests
global.createMockRequest = (path = '/', method = 'GET', body = null) => {
  const url = `https://example.com${path}`;
  const init = { method };

  if (body) {
    init.body = JSON.stringify(body);
    init.headers = { 'Content-Type': 'application/json' };
  }

  return new Request(url, init);
};

// Helper to parse response
global.parseResponse = async (response) => {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};
