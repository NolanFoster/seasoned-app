import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['**/*.test.js', 'test-image-service.js'],
    environment: 'node',
    globals: true,
  },
});