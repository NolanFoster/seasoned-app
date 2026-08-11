import { defineConfig } from 'vitest/config';
import { thresholdsFor } from '../scripts/coverage-thresholds.mjs';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node', // Using node environment instead of miniflare to avoid dependency issues
    // Test file patterns
    include: [
      'tests/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'json-summary', 'html', 'lcov'],
      // Only include source files in coverage
      include: ['src/**/*.{js,ts}'],
      exclude: [
        'node_modules/',
        'tests/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/mockData.js'
      ],
      // Minimums come from .github/coverage-thresholds.json so local runs and
      // the pull request coverage gate enforce the same numbers.
      thresholds: thresholdsFor('recipe-feeder')
    },
    // Test environment configuration
    testTimeout: 10000,
    hookTimeout: 10000
  }
});