import { defineConfig } from 'vitest/config'
import path from 'path'
import { thresholdsFor } from '../scripts/coverage-thresholds.mjs'

export default defineConfig({
  test: {
    globals: true,
    environment: 'miniflare',
        environmentOptions: {
          wranglerConfigPath: './wrangler.test.toml',
          packagePath: true
        },
    // Test file patterns
    include: [
      'tests/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'
    ],
    // Setup files
    setupFiles: ['./tests/setup.js'],
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
        '**/mockData.js',
        'src/index.test.js' // Exclude old test file
      ],
      // Minimums come from .github/coverage-thresholds.json so local runs and
      // the pull request coverage gate enforce the same numbers.
      thresholds: thresholdsFor('recipe-generation-worker')
    },
    // Test environment configuration
    testTimeout: 10000,
    hookTimeout: 10000
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@tests': path.resolve(__dirname, './tests')
    }
  }
})