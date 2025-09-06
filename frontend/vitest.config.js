import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/setupTests.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'src/setupTests.js',
        'src/main.jsx',
        '**/*.test.{js,jsx}',
        '**/*.spec.{js,jsx}',
        '**/__tests__/**',
        '**/coverage/**',
        '**/dist/**',
        '**/.{idea,git,cache,output,temp}/**',
        '**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build}.config.*'
      ],
      thresholds: {
        global: {
          branches: 60,
          functions: 60,
          lines: 60,
          statements: 60
        }
      }
    },
    include: [
      'src/**/*.{test,spec}.{js,jsx}',
      'src/**/__tests__/**/*.{js,jsx}'
    ],
    exclude: [
      'node_modules',
      'dist',
      '.git',
      '.cache'
    ]
  },
  resolve: {
    alias: {
      '@': '/src',
      '@features': '/src/features',
      '@components': '/src/components',
      '@hooks': '/src/hooks',
      '@utils': '/src/utils',
      '@api': '/src/api'
    }
  },
  define: {
    'import.meta.env': {
      VITE_API_URL: 'https://test-api.example.com',
      VITE_CLIPPER_API_URL: 'https://test-clipper-api.example.com',
      VITE_SEARCH_DB_URL: 'https://test-search-api.example.com',
      VITE_RECIPE_VIEW_URL: 'https://test-recipe-view-api.example.com',
      VITE_RECIPE_GENERATION_URL: 'https://test-recipe-generation-api.example.com'
    }
  }
});
