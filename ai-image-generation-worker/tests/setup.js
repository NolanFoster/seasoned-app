/**
 * Test setup configuration
 */

import { vi } from 'vitest';

// Global test setup
global.console = {
  ...console,
  error: vi.fn(),
  warn: vi.fn(),
  log: vi.fn()
};