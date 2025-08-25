import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index.js';

// Mock environment
const mockEnv = {
  ENVIRONMENT: 'test'
};

describe('Recipe Generation Worker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('CORS handling', () => {
    it('should handle OPTIONS requests', async () => {
      const request = new Request('https://test.com/health', {
        method: 'OPTIONS'
      });

      const response = await worker.fetch(request, mockEnv);

      expect(response.status).toBe(200);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
      expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET, POST, OPTIONS');
      expect(response.headers.get('Access-Control-Allow-Headers')).toBe('Content-Type');
    });
  });

  describe('API Documentation', () => {
    it('should return API documentation JSON on root path', async () => {
      const request = new Request('https://test.com/');
      
      const response = await worker.fetch(request, mockEnv);
      
      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('application/json');
      
      const data = await response.json();
      expect(data.service).toBe('Recipe Generation Service');
      expect(data.description).toBe('AI-powered recipe generation and customization');
      expect(data.version).toBe('1.0.0');
      expect(data.environment).toBe('test');
      expect(data.endpoints).toBeDefined();
      expect(data.usage).toBeDefined();
      expect(data.environments).toBeDefined();
    });

    it('should include CORS headers on API documentation', async () => {
      const request = new Request('https://test.com/');
      
      const response = await worker.fetch(request, mockEnv);
      
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
      expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET, POST, OPTIONS');
    });

    it('should document all available endpoints', async () => {
      const request = new Request('https://test.com/');
      const response = await worker.fetch(request, mockEnv);
      const data = await response.json();
      
      expect(data.endpoints['GET /']).toBeDefined();
      expect(data.endpoints['GET /health']).toBeDefined();
      expect(data.endpoints['POST /generate']).toBeDefined();
      
      expect(data.endpoints['GET /'].description).toBe('API documentation and service information');
      expect(data.endpoints['GET /health'].description).toBe('Health check endpoint to verify service status');
      expect(data.endpoints['POST /generate'].description).toBe('Generate a new recipe based on provided parameters');
    });

    it('should include usage examples', async () => {
      const request = new Request('https://test.com/');
      const response = await worker.fetch(request, mockEnv);
      const data = await response.json();
      
      expect(data.usage.healthCheck).toBeDefined();
      expect(data.usage.recipeGeneration).toBeDefined();
      expect(data.usage.healthCheck).toContain('curl');
      expect(data.usage.recipeGeneration).toContain('curl -X POST');
    });
  });

  describe('Health endpoint', () => {
    it('should return health status on GET /health', async () => {
      const request = new Request('https://test.com/health');
      
      const response = await worker.fetch(request, mockEnv);
      
      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('application/json');
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
      
      const data = await response.json();
      expect(data.status).toBe('healthy');
      expect(data.environment).toBe('test');
      expect(data.service).toBe('recipe-generation-worker');
      expect(data.timestamp).toBeDefined();
      expect(new Date(data.timestamp)).toBeInstanceOf(Date);
    });

    it('should return development environment when ENVIRONMENT is not set', async () => {
      const request = new Request('https://test.com/health');
      const envWithoutEnvironment = {};
      
      const response = await worker.fetch(request, envWithoutEnvironment);
      const data = await response.json();
      
      expect(data.environment).toBe('development');
    });

    it('should reject non-GET requests to health endpoint', async () => {
      const request = new Request('https://test.com/health', {
        method: 'POST'
      });
      
      const response = await worker.fetch(request, mockEnv);
      
      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error).toBe('Not Found');
    });
  });

  describe('Recipe generation endpoint', () => {
    it('should accept POST requests to /generate', async () => {
      const requestBody = {
        ingredients: ['chicken', 'rice'],
        cuisine: 'italian'
      };
      
      const request = new Request('https://test.com/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });
      
      const response = await worker.fetch(request, mockEnv);
      
      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('application/json');
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
      
      const data = await response.json();
      expect(data.message).toBe('Recipe generation endpoint - implementation coming soon');
      expect(data.requestData).toEqual(requestBody);
      expect(data.environment).toBe('test');
    });

    it('should reject requests without Content-Type header', async () => {
      const request = new Request('https://test.com/generate', {
        method: 'POST',
        body: JSON.stringify({ ingredients: ['chicken'] })
      });
      
      const response = await worker.fetch(request, mockEnv);
      
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Content-Type must be application/json');
    });

    it('should reject requests with non-JSON Content-Type', async () => {
      const request = new Request('https://test.com/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain'
        },
        body: 'some text'
      });
      
      const response = await worker.fetch(request, mockEnv);
      
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Content-Type must be application/json');
    });

    it('should handle malformed JSON gracefully', async () => {
      const request = new Request('https://test.com/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: 'invalid json {'
      });
      
      const response = await worker.fetch(request, mockEnv);
      
      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error).toBe('Failed to process recipe generation request');
      expect(data.details).toBeDefined();
    });

    it('should reject non-POST requests to generate endpoint', async () => {
      const request = new Request('https://test.com/generate', {
        method: 'GET'
      });
      
      const response = await worker.fetch(request, mockEnv);
      
      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error).toBe('Not Found');
    });
  });

  describe('404 handling', () => {
    it('should return 404 for unknown routes', async () => {
      const request = new Request('https://test.com/unknown');
      
      const response = await worker.fetch(request, mockEnv);
      
      expect(response.status).toBe(404);
      expect(response.headers.get('Content-Type')).toBe('application/json');
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
      
      const data = await response.json();
      expect(data.error).toBe('Not Found');
      expect(data.message).toBe('The requested endpoint does not exist');
    });

    it('should return 404 for POST to unknown routes', async () => {
      const request = new Request('https://test.com/unknown', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ test: 'data' })
      });
      
      const response = await worker.fetch(request, mockEnv);
      
      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error).toBe('Not Found');
    });
  });

  describe('Error handling', () => {
    it('should handle errors in recipe generation gracefully', async () => {
      // Mock a scenario where JSON parsing fails
      const request = new Request('https://test.com/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: '{"incomplete": json'
      });
      
      const response = await worker.fetch(request, mockEnv);
      
      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error).toBe('Failed to process recipe generation request');
      expect(data.details).toBeDefined();
    });
  });
});