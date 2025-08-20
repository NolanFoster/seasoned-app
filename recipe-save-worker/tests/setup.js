// Setup for Vitest tests
import { vi } from 'vitest';

// Mock Cloudflare Workers environment
global.crypto = {
  randomUUID: () => `uuid-${Date.now()}-${Math.random()}`
};

// Mock console methods if needed
global.console = {
  ...console,
  log: vi.fn(console.log),
  error: vi.fn(console.error),
  warn: vi.fn(console.warn)
};