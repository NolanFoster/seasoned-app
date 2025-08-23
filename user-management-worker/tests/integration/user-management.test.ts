import { describe, it, expect, vi, beforeEach } from 'vitest';
import app from '../../src/index';
import { Env } from '../../src/types/env';

describe('User Management Integration Tests', () => {
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

  describe('Basic API Structure', () => {
    it('should have proper API documentation endpoint', async () => {
      const req = new Request('http://localhost/', { method: 'GET' });
      const response = await app.fetch(req, mockEnv);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.name).toBe('user-management-worker');
      expect(data.version).toBe('1.0.0');
      expect(data.endpoints).toBeInstanceOf(Array);
    });

    it('should handle 404 errors properly', async () => {
      const req = new Request('http://localhost/unknown', { method: 'GET' });
      const response = await app.fetch(req, mockEnv);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Not Found');
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
