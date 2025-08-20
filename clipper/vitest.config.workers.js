import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
  test: {
    pool: '@cloudflare/vitest-pool-workers',
    poolOptions: {
      workers: {
        wrangler: {
          configPath: './wrangler.toml'
        }
      }
    },
    include: ['tests/**/*.worker.test.js'],
    testTimeout: 30000,
    hookTimeout: 30000
  }
});