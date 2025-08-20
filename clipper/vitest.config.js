import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  test: {
    globals: true,
    environment: 'happy-dom',
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
    exclude: ['tests/test-integration.js'],
    setupFiles: ['./tests/setup-test-env.js'],
    testTimeout: 30000,
    hookTimeout: 30000
  }
});