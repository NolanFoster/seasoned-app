import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'json-summary', 'lcov', 'html'],
      exclude: [
        'test/**',
        'vitest.config.js',
        'wrangler.toml',
        'setup.js'
      ],
      include: ['src/**/*.js'],
      thresholds: {
        branches: 80,
        functions: 80,
        lines: 80,
        statements: 80
      }
    },
    testTimeout: 20000,
    setupFiles: ['./test/setup.js']
  }
});