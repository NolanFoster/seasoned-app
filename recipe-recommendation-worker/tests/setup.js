// Test setup for vitest
import { vi } from 'vitest';

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
  AI: null, // Testing without AI binding for now
  ENVIRONMENT: 'test'
});

global.createMockContext = () => ({
  waitUntil: vi.fn(),
  passThroughOnException: vi.fn()
});

// Reset mocks before each test
beforeEach(() => {
  vi.clearAllMocks();
});