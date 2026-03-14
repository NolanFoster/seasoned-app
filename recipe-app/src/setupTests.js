import '@testing-library/jest-dom';

// Stub env vars (import.meta.env → process.env via babel plugin)
process.env.VITE_API_URL = 'https://test-api.example.com';
process.env.VITE_CLIPPER_API_URL = 'https://test-clipper.example.com';
process.env.VITE_SEARCH_DB_URL = 'https://test-search.example.com';
process.env.VITE_RECIPE_GENERATION_URL = 'https://test-gen.example.com';
process.env.VITE_AUTH_WORKER_URL = 'https://test-auth.example.com';

// Default fetch mock — individual tests override as needed
global.fetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve({}),
  })
);

beforeEach(() => {
  global.fetch.mockClear();
  // Cancel pending debounce timers so they don't leak into subsequent tests
  jest.clearAllTimers();
});
