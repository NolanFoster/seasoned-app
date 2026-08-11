import { defineConfig } from 'vitest/config';
import path from 'path';
// @ts-expect-error -- plain ESM helper shared across the monorepo, no types needed
import { thresholdsFor } from '../scripts/coverage-thresholds.mjs';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node', // Changed from 'miniflare' to fix timeout issues
    // environmentOptions: {
    //   wranglerConfigPath: './wrangler.toml',
    //   packagePath: true,
    //   wranglerConfigEnv: 'preview'
    // },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'json-summary', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'tests/',
        'src/types/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/mockData.ts',
        '**/*.js',
        'run-test.js'
      ],
      // Minimums come from .github/coverage-thresholds.json so local runs and
      // the pull request coverage gate enforce the same numbers.
      thresholds: thresholdsFor('auth-worker')
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      'cloudflare:email': path.resolve(__dirname, './tests/mocks/cloudflare-email.ts')
    }
  }
});