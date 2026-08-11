import { defineConfig } from 'vitest/config';
import path from 'path';
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
        'coverage/**',
        'tests/**'
      ],
      // Minimums come from .github/coverage-thresholds.json so local runs and
      // the pull request coverage gate enforce the same numbers. Falling below
      // any of them fails the run — that is the point of the gate.
      thresholds: thresholdsFor('recipe-save-worker')
    },
    include: ['tests/**/*.test.js', 'src/**/*.test.js'],
    setupFiles: ['./tests/setup.js']
  },
  resolve: {
    alias: {
      '../../shared/kv-storage.js': path.resolve(__dirname, '../shared/kv-storage.js'),
      '../../shared/nutrition-calculator.js': path.resolve(__dirname, '../shared/nutrition-calculator.js'),
      '../../shared/utility-functions.js': path.resolve(__dirname, '../shared/utility-functions.js')
    }
  }
});