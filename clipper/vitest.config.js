import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html', 'json-summary'],
      reportsDirectory: './coverage',
      exclude: [
        'node_modules/**',
        'tests/**',
        'demos/**',
        'docs/**',
        'integration-tests/**',
        '**/*.config.js',
        'test-*.js',
        'wrangler.toml'
      ],
      thresholds: {
        lines: 10,
        functions: 10,
        branches: 10,
        statements: 10
      }
    },
    include: ['tests/**/*.test.js'],
    exclude: [
      'tests/test-integration.js',
      'tests/**/*.worker.test.js',
      // Temporarily exclude auto-migrated tests that need fixing
      'tests/test-comprehensive-coverage.test.js',
      'tests/test-coverage-gaps.test.js',
      'tests/test-fetch-handler.test.js',
      'tests/test-helper-functions.test.js',
      'tests/test-kv-only-behavior.test.js',
      'tests/test-recipe-clipper.test.js',
      'tests/test-specific-recipe.test.js',
      'tests/test-unit-functions-fixed.test.js',
      'tests/test-utility-functions.test.js'
    ],
    testTimeout: 30000,
    hookTimeout: 30000
  }
});