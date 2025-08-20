import { defineConfig } from 'vitest/config';
import { Miniflare } from 'miniflare';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    environmentOptions: {
      miniflare: {
        kvNamespaces: ['RECIPES_DB']
      }
    },
    coverage: {
      reporter: ['text', 'lcov', 'html'],
      exclude: [
        'tests/**',
        'test-*.js',
        'setup-kv.js',
        'vitest.config.js',
        'wrangler.toml'
      ],
      include: ['worker.js'],
      thresholds: {
        branches: 85,
        functions: 85,
        lines: 85,
        statements: 85
      }
    },
    testTimeout: 20000,
    setupFiles: ['./tests/setup.js'],
    pool: 'forks' // Use forks for better isolation with Miniflare
  }
});