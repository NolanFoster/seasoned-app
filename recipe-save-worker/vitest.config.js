import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      reporter: ['text', 'lcov', 'html'],
      exclude: [
        'tests/**',
        'vitest.config.js',
        'wrangler.toml'
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
    setupFiles: ['./tests/setup.js']
  }
});