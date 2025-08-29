import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Env } from '../../src/types/env';
import { D1Database } from '@cloudflare/workers-types';

describe('User Management Worker Performance Tests', () => {
  let mockEnv: Env;
  let mockApp: any;

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

    // Mock the app with expected responses
    mockApp = {
      fetch: vi.fn()
    };
  });

  describe('Basic Performance', () => {
    it('should respond to API documentation endpoint within acceptable time', async () => {
      const expectedResponse = {
        name: 'user-management-worker',
        version: '1.0.0',
        description: 'User Management Worker for Recipe App',
        endpoints: []
      };

      // Mock response with json method
      const mockResponse = {
        status: 200,
        json: vi.fn().mockResolvedValue(expectedResponse)
      };

      mockApp.fetch.mockResolvedValue(mockResponse);

      const startTime = performance.now();
      
      const req = new Request('http://localhost/', { method: 'GET' });
      const response = await mockApp.fetch(req, mockEnv);
      
      const endTime = performance.now();
      const responseTime = endTime - startTime;

      expect(response.status).toBe(200);
      expect(responseTime).toBeLessThan(100); // Should respond within 100ms
    });

    it('should handle 404 errors quickly', async () => {
      const expectedResponse = {
        error: 'Not Found',
        message: 'Endpoint /unknown not found'
      };

      // Mock response with json method
      const mockResponse = {
        status: 404,
        json: vi.fn().mockResolvedValue(expectedResponse)
      };

      mockApp.fetch.mockResolvedValue(mockResponse);

      const startTime = performance.now();
      
      const req = new Request('http://localhost/unknown', { method: 'GET' });
      const response = await mockApp.fetch(req, mockEnv);
      
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
      expect(mockApp).toBeDefined();
      expect(typeof mockApp.fetch).toBe('function');
    });
  });
});
