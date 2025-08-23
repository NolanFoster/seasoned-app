import { describe, it, expect, vi, beforeEach } from 'vitest';
import app from '../../src/index';
import { Env } from '../../src/types/env';

describe('User Management Worker Performance Tests', () => {
  let mockEnv: Env;

  beforeEach(() => {
    mockEnv = {
      USER_DB: {
        prepare: vi.fn(),
        batch: vi.fn(),
        exec: vi.fn(),
        dump: vi.fn()
      } as unknown as D1Database,
      ENVIRONMENT: 'preview'
    };
  });

  describe('Basic Performance', () => {
    it('should respond to API documentation endpoint within acceptable time', async () => {
      const startTime = performance.now();
      
      const req = new Request('http://localhost/', { method: 'GET' });
      const response = await app.fetch(req, mockEnv);
      
      const endTime = performance.now();
      const responseTime = endTime - startTime;

      expect(response.status).toBe(200);
      expect(responseTime).toBeLessThan(100); // Should respond within 100ms
    });

    it('should handle 404 errors quickly', async () => {
      const startTime = performance.now();
      
      const req = new Request('http://localhost/unknown', { method: 'GET' });
      const response = await app.fetch(req, mockEnv);
      
      const endTime = performance.now();
      const responseTime = endTime - startTime;

      expect(response.status).toBe(404);
      expect(responseTime).toBeLessThan(50); // Should handle errors quickly
    });
  });

  describe('Environment Setup', () => {
    it('should have proper environment configuration', () => {
      expect(mockEnv.USER_DB).toBeDefined();
      expect(mockEnv.ENVIRONMENT).toBe('preview');
    });

    it('should have app instance with required methods', () => {
      expect(app).toBeDefined();
      expect(typeof app.fetch).toBe('function');
    });
  });
});
