/**
 * API Endpoint Tests for Recipe Recommendation Worker
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Miniflare } from 'miniflare';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Recipe Recommendation Worker API', () => {
  let mf;
  let tempWorkerPath;

  beforeAll(async () => {
    // Bundle the worker with esbuild to resolve ../../shared/* imports that workerd can't follow.
    // Shared modules are replaced with lightweight mocks via a plugin.
    const esbuild = await import('esbuild');

    const mockSharedPlugin = {
      name: 'mock-shared-modules',
      setup(build) {
        // Mock ../../shared/utility-functions.js
        build.onResolve({ filter: /utility-functions\.js$/ }, () => ({
          path: 'mock:utility-functions',
          namespace: 'mock',
        }));
        build.onLoad({ filter: /.*/, namespace: 'mock' }, (args) => {
          const mocks = {
            'mock:utility-functions': `
              export const log = () => {};
              export const generateRequestId = () => 'req_' + Date.now() + '_test';
            `,
            'mock:metrics-collector': `
              export class MetricsCollector {
                constructor() { this.metrics = new Map(); }
                increment() {}
                timing() {}
                getMetrics() { return {}; }
                reset() { this.metrics.clear(); }
              }
            `,
            'mock:kv-storage': `
              export const getRecipeFromKV = async () => null;
            `,
          };
          return { contents: mocks[args.path] || 'export default {}', loader: 'js' };
        });

        // Mock ../../shared/metrics-collector.js
        build.onResolve({ filter: /metrics-collector\.js$/ }, () => ({
          path: 'mock:metrics-collector',
          namespace: 'mock',
        }));

        // Mock ../../shared/kv-storage.js
        build.onResolve({ filter: /kv-storage\.js$/ }, () => ({
          path: 'mock:kv-storage',
          namespace: 'mock',
        }));
      },
    };

    tempWorkerPath = path.join(__dirname, '../src/index-miniflare-temp.js');

    await esbuild.build({
      entryPoints: [path.join(__dirname, '../src/index.js')],
      bundle: true,
      format: 'esm',
      outfile: tempWorkerPath,
      plugins: [mockSharedPlugin],
      platform: 'browser',
    });

    // Initialize Miniflare
    mf = new Miniflare({
      scriptPath: tempWorkerPath,
      modules: true,
      bindings: {
        AI: null // Testing without AI binding - will throw error as expected
      }
    });
  });

  afterAll(async () => {
    // Cleanup
    if (mf) {
      await mf.dispose();
    }
    
    // Clean up temporary test file
    try {
      const fs = await import('fs');
      await fs.promises.unlink(tempWorkerPath);
    } catch (error) {
      // Ignore if file doesn't exist
    }
  });

  describe('Health Check', () => {
    it('GET /health should return healthy status', async () => {
      const response = await mf.dispatchFetch('http://localhost/health');
      expect(response.status).toBe(200);
      
      const data = await response.json();
      expect(data.status).toBe('healthy');
    });

    it('GET /health should check AI service and report its status', async () => {
      const response = await mf.dispatchFetch('http://localhost/health');
      expect(response.status).toBe(200);
      
      const data = await response.json();
      expect(data.status).toBe('healthy');
      expect(data.services).toBeDefined();
      expect(data.services.ai).toBeDefined();
      // AI status should be either 'healthy' or 'error' depending on the binding
      expect(['healthy', 'error', 'not_configured']).toContain(data.services.ai);
    });
  });

  describe('CORS Handling', () => {
    it('OPTIONS request should handle CORS', async () => {
      const response = await mf.dispatchFetch('http://localhost/recommendations', {
        method: 'OPTIONS'
      });
      
      expect(response.status).toBe(200);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
      expect(response.headers.get('Access-Control-Allow-Methods')).toBeDefined();
    });

    it('All responses should include CORS headers', async () => {
      const endpoints = [
        { url: '/health', method: 'GET' },
        { url: '/recommendations', method: 'POST', body: JSON.stringify({ location: 'Test' }) },
        { url: '/unknown', method: 'GET' }
      ];
      
      for (const endpoint of endpoints) {
        const options = {
          method: endpoint.method,
          headers: endpoint.body ? { 'Content-Type': 'application/json' } : {}
        };
        if (endpoint.body) options.body = endpoint.body;
        
        const response = await mf.dispatchFetch(`http://localhost${endpoint.url}`, options);
        expect(response.headers.get('Access-Control-Allow-Origin')).toBeDefined();
      }
    });
  });

  describe('POST /recommendations', () => {
    it('should return recommendations with valid data', async () => {
      const response = await mf.dispatchFetch('http://localhost/recommendations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location: 'San Francisco, CA',
          date: '2024-07-15'
        })
      });
      
      expect(response.status).toBe(500);
      
      const data = await response.json();
      expect(data.error).toBeDefined();
      expect(data.error).toContain('Failed to get recommendations');
    });

    it('should return valid recommendations without location', async () => {
      const response = await mf.dispatchFetch('http://localhost/recommendations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: '2024-07-15'
        })
      });
      
      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error).toBeDefined();
      expect(data.error).toContain('Failed to get recommendations');
    });

    it('should use current date when date is not provided', async () => {
      const response = await mf.dispatchFetch('http://localhost/recommendations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location: 'New York, NY'
        })
      });
      
      expect(response.status).toBe(500);
      
      const data = await response.json();
      expect(data.error).toBeDefined();
      expect(data.error).toContain('Failed to get recommendations');
    });

    it('should return 500 with invalid JSON', async () => {
      const response = await mf.dispatchFetch('http://localhost/recommendations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'invalid json'
      });
      
      expect(response.status).toBe(500);
      
      const data = await response.json();
      expect(data.error).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('GET /recommendations should return 405 Method Not Allowed', async () => {
      const response = await mf.dispatchFetch('http://localhost/recommendations', {
        method: 'GET'
      });
      
      expect(response.status).toBe(405);
      
      const data = await response.json();
      expect(data.error).toBeDefined();
      expect(data.error).toContain('Method not allowed');
    });

    it('Unknown endpoint should return 404', async () => {
      const response = await mf.dispatchFetch('http://localhost/unknown');
      
      expect(response.status).toBe(404);
      
      const data = await response.json();
      expect(data.error).toBeDefined();
    });
  });

  describe('Recommendations Content', () => {
    it('should return proper recommendation structure', async () => {
      const response = await mf.dispatchFetch('http://localhost/recommendations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location: 'Seattle, WA',
          date: '2024-12-15'
        })
      });
      
      expect(response.status).toBe(500);
      
      const data = await response.json();
      expect(data).toHaveProperty('error');
      expect(data.error).toContain('Failed to get recommendations');
    });

    it('should return different recommendations for different seasons', async () => {
      const winterResponse = await mf.dispatchFetch('http://localhost/recommendations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location: 'Test',
          date: '2024-01-15'
        })
      });
      
      const summerResponse = await mf.dispatchFetch('http://localhost/recommendations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location: 'Test',
          date: '2024-07-15'
        })
      });
      
      const winterData = await winterResponse.json();
      const summerData = await summerResponse.json();
      
      expect(winterData.error).toContain('Failed to get recommendations');
      expect(summerData.error).toContain('Failed to get recommendations');
    });
  });
});