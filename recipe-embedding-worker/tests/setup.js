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

// Helper to create mock queue messages (recipe IDs only)
global.createMockQueueMessage = (recipeId, messageId = 'test-message-id') => ({
  id: messageId,
  body: recipeId, // Just the recipe ID, not JSON
  ack: vi.fn(),
  retry: vi.fn()
});

// Helper to create mock queue batch
global.createMockQueueBatch = (messages) => ({
  messages
});
