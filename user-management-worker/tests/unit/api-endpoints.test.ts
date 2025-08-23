import { describe, it, expect, vi, beforeEach } from 'vitest';
import app from '../../src/index';
import { Env } from '../../src/types/env';

describe('User Management Worker API Endpoints', () => {
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

  describe('GET /', () => {
    it('should return API documentation', async () => {
      const req = new Request('http://localhost/', { method: 'GET' });
      const response = await app.fetch(req, mockEnv);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.name).toBe('user-management-worker');
      expect(data.version).toBe('1.0.0');
      expect(data.endpoints).toBeInstanceOf(Array);
      expect(data.endpoints.length).toBeGreaterThan(0);
    });
  });

  describe('404 Handler', () => {
    it('should return 404 for unknown endpoints', async () => {
      const req = new Request('http://localhost/unknown', { method: 'GET' });
      const response = await app.fetch(req, mockEnv);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Not Found');
      expect(data.message).toContain('/unknown');
    });
  });

  describe('basic functionality', () => {
    it('should have proper environment setup', () => {
      expect(mockEnv.USER_DB).toBeDefined();
      expect(mockEnv.ENVIRONMENT).toBe('preview');
    });

    it('should have app instance', () => {
      expect(app).toBeDefined();
      expect(typeof app.fetch).toBe('function');
    });
  });
});
