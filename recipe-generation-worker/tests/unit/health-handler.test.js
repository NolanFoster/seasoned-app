import { describe, it, expect, beforeEach } from 'vitest';
import { handleHealth } from '../../src/handlers/health-handler.js';
import { mockEnv, mockEnvWithoutEnvironment, createMockRequest, assertCorsHeaders, assertJsonResponse } from '../setup.js';

describe('Health Handler - Unit Tests', () => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };

  beforeEach(() => {
    // Reset any mocks if needed
  });

  describe('Health Check', () => {
    it('should return health status', async () => {
      const request = createMockRequest('/health');
      const response = await handleHealth(request, mockEnv, corsHeaders);

      expect(response.status).toBe(200);
      assertJsonResponse(response);
      assertCorsHeaders(response);

      const data = await response.json();
      expect(data.status).toBe('healthy');
      expect(data.environment).toBe('test');
      expect(data.service).toBe('recipe-generation-worker');
      expect(data.timestamp).toBeDefined();
      expect(new Date(data.timestamp)).toBeInstanceOf(Date);
    });

    it('should return development environment when ENVIRONMENT is not set', async () => {
      const request = createMockRequest('/health');
      const response = await handleHealth(request, mockEnvWithoutEnvironment, corsHeaders);
      const data = await response.json();

      expect(data.environment).toBe('development');
    });

    it('should include current timestamp', async () => {
      const beforeTimestamp = new Date();
      const request = createMockRequest('/health');
      const response = await handleHealth(request, mockEnv, corsHeaders);
      const afterTimestamp = new Date();
      const data = await response.json();

      const responseTimestamp = new Date(data.timestamp);
      expect(responseTimestamp.getTime()).toBeGreaterThanOrEqual(beforeTimestamp.getTime());
      expect(responseTimestamp.getTime()).toBeLessThanOrEqual(afterTimestamp.getTime());
    });

    it('should always return healthy status', async () => {
      const request = createMockRequest('/health');
      const response = await handleHealth(request, mockEnv, corsHeaders);
      const data = await response.json();

      expect(data.status).toBe('healthy');
    });

    it('should include service name', async () => {
      const request = createMockRequest('/health');
      const response = await handleHealth(request, mockEnv, corsHeaders);
      const data = await response.json();

      expect(data.service).toBe('recipe-generation-worker');
    });
  });
});
