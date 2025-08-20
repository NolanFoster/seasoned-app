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
    exclude: ['tests/test-integration.js', 'tests/**/*.worker.test.js'],
    testTimeout: 30000,
    hookTimeout: 30000
  }
});