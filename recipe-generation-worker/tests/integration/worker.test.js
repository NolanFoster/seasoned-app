import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from '../../src/index.js';
import { mockEnv, mockEnvWithoutEnvironment, createMockRequest, createPostRequest, assertCorsHeaders } from '../setup.js';

describe('Recipe Generation Worker - Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('CORS handling', () => {
    it('should handle OPTIONS requests', async () => {
      const request = createMockRequest('/health', { method: 'OPTIONS' });
      const response = await worker.fetch(request, mockEnv);

      expect(response.status).toBe(200);
      assertCorsHeaders(response);
    });

    it('should handle CORS preflight requests', async () => {
      const response = await worker.fetch(new Request('https://example.com/generate', {
        method: 'OPTIONS'
      }));

      expect(response.status).toBe(200);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
      expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET, POST, OPTIONS');
      expect(response.headers.get('Access-Control-Allow-Headers')).toBe('Content-Type');
    });
  });

  describe('404 handling', () => {
    it('should return 404 for unknown routes', async () => {
      const response = await worker.fetch(new Request('https://example.com/unknown', {
        method: 'GET'
      }));

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error).toBe('Not Found');
      expect(data.message).toBe('The requested endpoint does not exist');
    });

    it('should return 404 for POST to unknown routes', async () => {
      const request = createPostRequest('/unknown', { test: 'data' });
      const response = await worker.fetch(request, mockEnv);

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error).toBe('Not Found');
    });
  });

  describe('Environment handling', () => {
    it('should default to development environment when ENVIRONMENT is not set', async () => {
      const request = createMockRequest('/health');
      const response = await worker.fetch(request, mockEnvWithoutEnvironment);
      const data = await response.json();

      expect(data.environment).toBe('development');
    });

    it('should use provided environment variable', async () => {
      const request = createMockRequest('/');
      const response = await worker.fetch(request, mockEnv);
      const data = await response.json();

      expect(data.environment).toBe('test');
    });
  });
});
