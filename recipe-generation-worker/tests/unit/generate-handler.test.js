import { describe, it, expect, beforeEach, vi } from 'vitest';
import { handleGenerate } from '../../src/handlers/generate-handler.js';
import { mockEnv, createPostRequest, assertCorsHeaders, assertJsonResponse } from '../setup.js';

describe('Generate Handler - Unit Tests', () => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Recipe Generation', () => {
    it('should accept valid POST requests', async () => {
      const requestBody = {
        ingredients: ['chicken', 'rice'],
        cuisine: 'italian'
      };

      const request = createPostRequest('/generate', requestBody);
      const response = await handleGenerate(request, mockEnv, corsHeaders);

      expect(response.status).toBe(200);
      assertJsonResponse(response);
      assertCorsHeaders(response);

      const data = await response.json();
      expect(data.message).toBe('Recipe generation endpoint - implementation coming soon');
      expect(data.requestData).toEqual(requestBody);
      expect(data.environment).toBe('test');
    });

    it('should handle complex request with all optional fields', async () => {
      const requestBody = {
        ingredients: ['chicken', 'rice', 'vegetables'],
        cuisine: 'asian',
        dietary: ['gluten-free', 'low-sodium'],
        servings: 4
      };

      const request = createPostRequest('/generate', requestBody);
      const response = await handleGenerate(request, mockEnv, corsHeaders);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.requestData).toEqual(requestBody);
    });

    it('should handle minimal request with only ingredients', async () => {
      const requestBody = {
        ingredients: ['pasta']
      };

      const request = createPostRequest('/generate', requestBody);
      const response = await handleGenerate(request, mockEnv, corsHeaders);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.requestData).toEqual(requestBody);
    });
  });

  describe('Content-Type validation', () => {
    it('should reject requests without Content-Type header', async () => {
      const request = new Request('https://test.com/generate', {
        method: 'POST',
        body: JSON.stringify({ ingredients: ['chicken'] })
      });

      const response = await handleGenerate(request, mockEnv, corsHeaders);

      expect(response.status).toBe(400);
      assertJsonResponse(response);
      assertCorsHeaders(response);
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

      const response = await handleGenerate(request, mockEnv, corsHeaders);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Content-Type must be application/json');
    });

    it('should accept Content-Type with charset', async () => {
      const requestBody = { ingredients: ['chicken'] };
      const request = new Request('https://test.com/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8'
        },
        body: JSON.stringify(requestBody)
      });

      const response = await handleGenerate(request, mockEnv, corsHeaders);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.requestData).toEqual(requestBody);
    });
  });

  describe('Error handling', () => {
    it('should handle malformed JSON gracefully', async () => {
      const request = new Request('https://test.com/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: 'invalid json {'
      });

      const response = await handleGenerate(request, mockEnv, corsHeaders);

      expect(response.status).toBe(500);
      assertJsonResponse(response);
      assertCorsHeaders(response);
      const data = await response.json();
      expect(data.error).toBe('Failed to process recipe generation request');
      expect(data.details).toBeDefined();
    });

    it('should handle empty JSON object', async () => {
      const request = createPostRequest('/generate', {});
      const response = await handleGenerate(request, mockEnv, corsHeaders);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.requestData).toEqual({});
    });

    it('should log errors to console', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const request = new Request('https://test.com/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: 'invalid json'
      });

      await handleGenerate(request, mockEnv, corsHeaders);

      expect(consoleSpy).toHaveBeenCalledWith(
        'Error processing recipe generation request:',
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  describe('Environment handling', () => {
    it('should use development environment when ENVIRONMENT is not set', async () => {
      const requestBody = { ingredients: ['chicken'] };
      const request = createPostRequest('/generate', requestBody);
      const response = await handleGenerate(request, {}, corsHeaders);

      const data = await response.json();
      expect(data.environment).toBe('development');
    });

    it('should use provided environment variable', async () => {
      const requestBody = { ingredients: ['chicken'] };
      const request = createPostRequest('/generate', requestBody);
      const response = await handleGenerate(request, mockEnv, corsHeaders);

      const data = await response.json();
      expect(data.environment).toBe('test');
    });
  });
});
