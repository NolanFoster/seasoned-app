import '@testing-library/jest-dom';

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(), // deprecated
    removeListener: jest.fn(), // deprecated
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

// Mock canvas for seasoning background
HTMLCanvasElement.prototype.getContext = jest.fn(() => ({
  clearRect: jest.fn(),
  beginPath: jest.fn(),
  moveTo: jest.fn(),
  lineTo: jest.fn(),
  arc: jest.fn(),
  fill: jest.fn(),
  fillStyle: '',
  translate: jest.fn(),
  rotate: jest.fn(),
  save: jest.fn(),
  restore: jest.fn(),
  bezierCurveTo: jest.fn(),
  quadraticCurveTo: jest.fn(),
  closePath: jest.fn(),
}));

// Global alert/confirm mocks and clearing between tests
if (!global.alert) global.alert = jest.fn();
if (!global.confirm) global.confirm = jest.fn();

beforeEach(() => {
  global.alert && global.alert.mockClear && global.alert.mockClear();
  global.confirm && global.confirm.mockClear && global.confirm.mockClear();

  // Ensure main.jsx executes fresh when required within tests that rely on it
  try {
    const mainPath = require.resolve('./main.jsx');
    delete require.cache[mainPath];
  } catch (_) {
    // ignore if not resolvable in this test context
  }
});

// Mock import.meta.env -> process.env for tests
process.env.VITE_API_URL = 'https://test-api.example.com';
process.env.VITE_CLIPPER_API_URL = 'https://test-clipper-api.example.com';
process.env.VITE_SEARCH_DB_URL = 'https://test-search-db.example.com';
process.env.VITE_RECOMMENDATION_API_URL = 'https://test-recommendation-api.example.com';