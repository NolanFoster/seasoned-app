import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock environment variables
Object.defineProperty(import.meta, 'env', {
  value: {
    VITE_API_URL: 'https://test-api.example.com',
    VITE_CLIPPER_API_URL: 'https://test-clipper-api.example.com',
    VITE_SEARCH_DB_URL: 'https://test-search-api.example.com',
    VITE_RECIPE_VIEW_URL: 'https://test-recipe-view-api.example.com',
    VITE_RECIPE_GENERATION_URL: 'https://test-recipe-generation-api.example.com'
  }
});

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock canvas for seasoning background
HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
  clearRect: vi.fn(),
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  arc: vi.fn(),
  fill: vi.fn(),
  fillStyle: '',
  translate: vi.fn(),
  rotate: vi.fn(),
  save: vi.fn(),
  restore: vi.fn(),
  bezierCurveTo: vi.fn(),
  quadraticCurveTo: vi.fn(),
  closePath: vi.fn(),
}));

// Global alert/confirm mocks and clearing between tests
if (!global.alert) global.alert = vi.fn();
if (!global.confirm) global.confirm = vi.fn();

// Global fetch mock - ensures fetch always returns a proper Promise
if (!global.fetch) {
  global.fetch = vi.fn(() => 
    Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
      text: () => Promise.resolve(''),
    })
  );
}

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

beforeEach(() => {
  global.alert && global.alert.mockClear && global.alert.mockClear();
  global.confirm && global.confirm.mockClear && global.confirm.mockClear();
  global.fetch && global.fetch.mockClear && global.fetch.mockClear();

  // Clear all mocks
  vi.clearAllMocks();
});