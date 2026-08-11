import { defineConfig } from 'vitest/config'
import path from 'path'
import { thresholdsFor } from '../scripts/coverage-thresholds.mjs'

export default defineConfig({
  test: {
    globals: true,
    environment: 'miniflare',
    environmentOptions: {
      wranglerConfigPath: './wrangler.toml',
      packagePath: true,
      wranglerConfigEnv: 'preview'
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'json-summary', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'tests/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/mockData.js'
      ],
      // Minimums come from .github/coverage-thresholds.json so local runs and
      // the pull request coverage gate enforce the same numbers.
      thresholds: thresholdsFor('ai-image-generation-worker')
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src')
    }
  }
})