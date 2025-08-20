// Test setup for vitest
import { vi } from 'vitest';

// Mock fetch globally
global.fetch = vi.fn();

// Mock console methods during tests
global.console = {
  ...console,
  log: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn()
};

// Setup common test utilities
global.createMockRequest = (method = 'GET', url = 'https://example.com', options = {}) => {
  return new Request(url, {
    method,
    headers: new Headers(options.headers || {}),
    body: options.body ? JSON.stringify(options.body) : undefined,
    ...options
  });
};

global.createMockEnv = () => ({
  CLIPPED_RECIPE_KV: createMockKVNamespace(),
  RECIPE_METADATA_KV: createMockKVNamespace(),
  RECIPE_IMAGE_KV: createMockKVNamespace(),
  RECIPE_SAVER: {
    idFromName: vi.fn().mockReturnValue('test-do-id'),
    get: vi.fn().mockReturnValue({
      fetch: vi.fn()
    })
  },
  RECIPE_IMAGES: createMockR2Bucket(),
  SEARCH_DB_URL: 'https://test-search-db.workers.dev',
  IMAGE_DOMAIN: 'https://test-images.domain.com',
  FDC_API_KEY: 'test-api-key',
  ENVIRONMENT: 'test'
});

global.createMockKVNamespace = () => ({
  get: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
  list: vi.fn().mockResolvedValue({ keys: [] }),
  getWithMetadata: vi.fn()
});

global.createMockR2Bucket = () => ({
  put: vi.fn().mockResolvedValue({ key: 'test-key' }),
  get: vi.fn().mockResolvedValue(null),
  delete: vi.fn().mockResolvedValue(true),
  list: vi.fn().mockResolvedValue({ objects: [] })
});

global.createMockContext = () => ({
  waitUntil: vi.fn(),
  passThroughOnException: vi.fn()
});

// Reset mocks before each test
beforeEach(() => {
  vi.clearAllMocks();
});