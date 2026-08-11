import { defineConfig } from 'vitest/config';
import { thresholdsFor } from '../scripts/coverage-thresholds.mjs';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'json-summary', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: [
        'node_modules/',
        'dist/',
        'tests/',
        '**/*.d.ts'
      ],
      // Minimums come from .github/coverage-thresholds.json so local runs and
      // the pull request coverage gate enforce the same numbers.
      thresholds: thresholdsFor('user-management-worker')
    }
  }
});
