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
        'tests/**',
        'example.js'
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
      '../../shared/utility-functions.js': path.resolve(__dirname, '../shared/utility-functions.js'),
      '../../shared/metrics-collector.js': path.resolve(__dirname, '../shared/metrics-collector.js')
    }
  }
});