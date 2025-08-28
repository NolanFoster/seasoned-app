import { describe, it, expect, beforeEach } from 'vitest';
import { handleRoot } from '../../src/handlers/root-handler.js';
import { mockEnv, createMockRequest, assertCorsHeaders, assertJsonResponse } from '../setup.js';

describe('Root Handler - Unit Tests', () => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };

  beforeEach(() => {
    // Reset any mocks if needed
  });

  describe('API Documentation', () => {
    it('should return API documentation JSON', async () => {
      const request = createMockRequest('/');
      const response = await handleRoot(request, mockEnv, corsHeaders);

      expect(response.status).toBe(200);
      assertJsonResponse(response);
      assertCorsHeaders(response);

      const data = await response.json();
      expect(data.service).toBe('Recipe Generation Service');
      expect(data.description).toBe('AI-powered recipe generation and customization');
      expect(data.version).toBe('1.0.0');
      expect(data.environment).toBe('test');
      expect(data.endpoints).toBeDefined();
      expect(data.usage).toBeDefined();
      expect(data.environments).toBeDefined();
    });

    it('should document all available endpoints', async () => {
      const request = createMockRequest('/');
      const response = await handleRoot(request, mockEnv, corsHeaders);
      const data = await response.json();

      expect(data.endpoints['GET /']).toBeDefined();
      expect(data.endpoints['GET /health']).toBeDefined();
      expect(data.endpoints['POST /generate']).toBeDefined();

      expect(data.endpoints['GET /'].description).toBe('API documentation and service information');
      expect(data.endpoints['GET /health'].description).toBe('Health check endpoint to verify service status');
      expect(data.endpoints['POST /generate'].description).toBe('Generate a new recipe based on provided parameters');
    });

    it('should include usage examples', async () => {
      const request = createMockRequest('/');
      const response = await handleRoot(request, mockEnv, corsHeaders);
      const data = await response.json();

      expect(data.usage.healthCheck).toBeDefined();
      expect(data.usage.recipeGeneration).toBeDefined();
      expect(data.usage.healthCheck).toContain('curl');
      expect(data.usage.recipeGeneration).toContain('curl -X POST');
    });

    it('should include environment information', async () => {
      const request = createMockRequest('/');
      const response = await handleRoot(request, mockEnv, corsHeaders);
      const data = await response.json();

      expect(data.environments).toEqual({
        preview: 'For development and testing',
        staging: 'For pre-production validation',
        production: 'For live usage'
      });
    });

    it('should include POST /generate endpoint schema', async () => {
      const request = createMockRequest('/');
      const response = await handleRoot(request, mockEnv, corsHeaders);
      const data = await response.json();

      const generateEndpoint = data.endpoints['POST /generate'];
      expect(generateEndpoint.requestBody).toBeDefined();
      expect(generateEndpoint.requestBody.type).toBe('application/json');
      expect(generateEndpoint.requestBody.schema).toBeDefined();
      expect(generateEndpoint.requestBody.schema.ingredients).toBe('Array of available ingredients');
      expect(generateEndpoint.requestBody.schema.cuisine).toBe('Preferred cuisine style (optional)');
      expect(generateEndpoint.requestBody.schema.dietary).toBe('Array of dietary restrictions (optional)');
      expect(generateEndpoint.requestBody.schema.servings).toBe('Number of servings (optional)');
    });

    it('should handle request with environment variable set', async () => {
      const request = createMockRequest('/');
      const env = { ENVIRONMENT: 'production' };
      const response = await handleRoot(request, env, corsHeaders);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.environment).toBe('production');
    });

    it('should handle request without environment variable set', async () => {
      const request = createMockRequest('/');
      const env = {};
      const response = await handleRoot(request, env, corsHeaders);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.environment).toBe('development');
    });
  });
});
