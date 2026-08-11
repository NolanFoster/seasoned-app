import { defineConfig } from 'vitest/config';
import { thresholdsFor } from '../scripts/coverage-thresholds.mjs';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'json-summary', 'html', 'lcov'],
      exclude: [
        'node_modules/**',
        'dist/**',
        '**/*.test.js',
        '**/*.config.js',
        'coverage/**'
      ],
      // Minimums come from .github/coverage-thresholds.json so local runs and
      // the pull request coverage gate enforce the same numbers.
      thresholds: thresholdsFor('recipe-view-worker')
    }
  }
});