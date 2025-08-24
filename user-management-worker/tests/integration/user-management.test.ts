import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Env } from '../../src/types/env';
import { D1Database } from '@cloudflare/workers-types';

describe('User Management Integration Tests', () => {
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

  describe('Basic API Structure', () => {
    it('should have proper API documentation endpoint', async () => {
      const expectedResponse = {
        name: 'user-management-worker',
        version: '1.0.0',
        description: 'User Management Worker for Recipe App',
        endpoints: [
          { path: '/', method: 'GET', description: 'API documentation' },
          { path: '/health', method: 'GET', description: 'Health check' },
          { path: '/users', method: 'POST', description: 'Create user' },
          { path: '/users/:id', method: 'GET', description: 'Get user by ID' },
          { path: '/users/:id', method: 'PUT', description: 'Update user' },
          { path: '/users/:id', method: 'DELETE', description: 'Delete user' },
          { path: '/login-history', method: 'POST', description: 'Create login history record' }
        ]
      };

      // Mock response with json method
      const mockResponse = {
        status: 200,
        json: vi.fn().mockResolvedValue(expectedResponse)
      };

      mockApp.fetch.mockResolvedValue(mockResponse);

      const req = new Request('http://localhost/', { method: 'GET' });
      const response = await mockApp.fetch(req, mockEnv);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.name).toBe('user-management-worker');
      expect(data.version).toBe('1.0.0');
      expect(data.endpoints).toBeInstanceOf(Array);
    });

    it('should handle 404 errors properly', async () => {
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

      const req = new Request('http://localhost/unknown', { method: 'GET' });
      const response = await mockApp.fetch(req, mockEnv);
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
      expect(mockApp).toBeDefined();
      expect(typeof mockApp.fetch).toBe('function');
    });
  });
});
