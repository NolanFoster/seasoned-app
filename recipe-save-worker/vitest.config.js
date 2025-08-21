import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/**',
        'dist/**',
        '**/*.test.js',
        '**/*.config.js',
        'coverage/**',
        'tests/**'
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80
      },
      // Don't fail tests if coverage thresholds are not met
      // This allows coverage reports to be generated and posted even when below threshold
      thresholdAutoUpdate: false
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