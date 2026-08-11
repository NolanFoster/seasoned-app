import { defineConfig } from 'vitest/config';
import { thresholdsFor } from '../scripts/coverage-thresholds.mjs';

export default defineConfig({
  test: {
    include: ['**/*.test.js', 'test-image-service.js'],
    environment: 'node',
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'json-summary', 'html', 'lcov'],
      // Only the modules other workers import. The `test-*.js` files at the root
      // are standalone runner scripts rather than sources under test.
      include: ['*.js'],
      exclude: [
        'node_modules/**',
        '__tests__/**',
        'coverage/**',
        'test-*.js',
        'example-*.js',
        '*.config.js'
      ],
      // Minimums come from .github/coverage-thresholds.json so local runs and
      // the pull request coverage gate enforce the same numbers.
      thresholds: thresholdsFor('shared')
    }
  }
});
