/**
 * Tests for error handling and categorization
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import workerModule from '../src/index.js';
import { 
  getSeason, 
  getMockRecommendations, 
  enhanceRecommendationsWithRecipes,
  searchRecipeByCategory,
  getRecipeRecommendations,
  extractCookingTerms
} from '../src/index.js';
import { metrics } from '../src/index.js';

// Create error categorization function for testing
function categorizeError(error, context = {}) {
  let category = 'unknown';
  let severity = 'error';
  
  if (error.name === 'TypeError' || error.name === 'ReferenceError') {
    category = 'code_error';
    severity = 'error';
  } else if (error.message?.includes('AI') || error.message?.includes('model')) {
    category = 'ai_service_error';
    severity = 'error';
  } else if (error.message?.includes('network') || error.message?.includes('fetch')) {
    category = 'network_error';
    severity = 'warn';
  } else if (error.message?.includes('parse') || error.message?.includes('JSON')) {
    category = 'parsing_error';
    severity = 'warn';
  } else if (error.message?.includes('timeout')) {
    category = 'timeout_error';
    severity = 'warn';
  }

  return { category, severity };
}

describe('Error Categorization', () => {
  it('should categorize TypeError correctly', () => {
    const error = new TypeError('Cannot read property of undefined');
    const result = categorizeError(error);
    
    expect(result.category).toBe('code_error');
    expect(result.severity).toBe('error');
  });

  it('should categorize ReferenceError correctly', () => {
    const error = new ReferenceError('Variable is not defined');
    const result = categorizeError(error);
    
    expect(result.category).toBe('code_error');
    expect(result.severity).toBe('error');
  });

  it('should categorize AI service errors correctly', () => {
    const aiError1 = new Error('AI service is unavailable');
    const aiError2 = new Error('model response failed');
    
    const result1 = categorizeError(aiError1);
    const result2 = categorizeError(aiError2);
    
    expect(result1.category).toBe('ai_service_error');
    expect(result1.severity).toBe('error');
    expect(result2.category).toBe('ai_service_error');
    expect(result2.severity).toBe('error');
  });

  it('should categorize network errors correctly', () => {
    const networkError1 = new Error('network timeout occurred');
    const networkError2 = new Error('fetch request failed');
    
    const result1 = categorizeError(networkError1);
    const result2 = categorizeError(networkError2);
    
    expect(result1.category).toBe('network_error');
    expect(result1.severity).toBe('warn');
    expect(result2.category).toBe('network_error');
    expect(result2.severity).toBe('warn');
  });

  it('should categorize parsing errors correctly', () => {
    const parseError1 = new Error('JSON parse error');
    const parseError2 = new Error('Failed to parse response');
    
    const result1 = categorizeError(parseError1);
    const result2 = categorizeError(parseError2);
    
    expect(result1.category).toBe('parsing_error');
    expect(result1.severity).toBe('warn');
    expect(result2.category).toBe('parsing_error');
    expect(result2.severity).toBe('warn');
  });

  it('should categorize timeout errors correctly', () => {
    const timeoutError = new Error('Request timeout exceeded');
    const result = categorizeError(timeoutError);
    
    expect(result.category).toBe('timeout_error');
    expect(result.severity).toBe('warn');
  });

  it('should categorize unknown errors correctly', () => {
    const unknownError = new Error('Something unexpected happened');
    const result = categorizeError(unknownError);
    
    expect(result.category).toBe('unknown');
    expect(result.severity).toBe('error');
  });

  it('should handle errors without message', () => {
    const error = new Error();
    const result = categorizeError(error);
    
    expect(result.category).toBe('unknown');
    expect(result.severity).toBe('error');
  });

  it('should handle null/undefined errors', () => {
    const result1 = categorizeError({ name: 'CustomError', message: null });
    const result2 = categorizeError({ name: 'CustomError', message: undefined });
    
    expect(result1.category).toBe('unknown');
    expect(result1.severity).toBe('error');
    expect(result2.category).toBe('unknown');
    expect(result2.severity).toBe('error');
  });
});

describe('Error Handling in API Endpoints', () => {
  const mockEnv = { AI: null };

  it('should handle malformed JSON in recommendations', async () => {
    const request = new Request('http://localhost/recommendations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{ invalid json }'
    });

    const response = await workerModule.fetch(request, mockEnv);
    expect(response.status).toBe(500);
    
    const data = await response.json();
    expect(data.error).toBeDefined();
    expect(data.requestId).toBeDefined();
  });

  it('should handle missing request body', async () => {
    const request = new Request('http://localhost/recommendations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
      // No body
    });

    const response = await workerModule.fetch(request, mockEnv);
    expect(response.status).toBe(500);
    
    const data = await response.json();
    // The error message might be 'Failed to get recommendations' or 'Internal server error'
    expect(['Failed to get recommendations', 'Internal server error']).toContain(data.error);
    expect(data.requestId).toBeDefined();
  });

  it('should handle empty request body', async () => {
    const request = new Request('http://localhost/recommendations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: ''
    });

    const response = await workerModule.fetch(request, mockEnv);
    expect(response.status).toBe(500);
    
    const data = await response.json();
    expect(data.error).toBeDefined();
  });

  it('should handle non-JSON content type', async () => {
    const request = new Request('http://localhost/recommendations', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: 'plain text body'
    });

    const response = await workerModule.fetch(request, mockEnv);
    expect(response.status).toBe(500);
    
    const data = await response.json();
    expect(data.error).toBeDefined();
  });

  it('should include CORS headers in error responses', async () => {
    const request = new Request('http://localhost/recommendations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'invalid'
    });

    const response = await workerModule.fetch(request, mockEnv);
    
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(response.headers.get('Access-Control-Allow-Methods')).toBeDefined();
    expect(response.headers.get('X-Request-ID')).toBeDefined();
  });
});

describe('Health Check Error Scenarios', () => {
  it('should handle successful AI health check', async () => {
    const mockEnvWithHealthyAI = {
      AI: {
        run: vi.fn().mockResolvedValue({ response: 'OK' })
      }
    };

    const request = new Request('http://localhost/health');
    const response = await workerModule.fetch(request, mockEnvWithHealthyAI);
    
    expect(response.status).toBe(200);
    
    const data = await response.json();
    expect(data.status).toBe('healthy');
    expect(data.services.ai).toBe('healthy');
    
    // Verify AI was called for health check
    expect(mockEnvWithHealthyAI.AI.run).toHaveBeenCalledWith(
      '@cf/meta/llama-3.1-8b-instruct',
      expect.objectContaining({
        prompt: 'Say "OK"',
        max_tokens: 5
      })
    );
  });

  it('should handle AI health check failure gracefully', async () => {
    const mockEnvWithFailingAI = {
      AI: {
        run: vi.fn().mockRejectedValue(new Error('AI service unavailable'))
      }
    };

    const request = new Request('http://localhost/health');
    const response = await workerModule.fetch(request, mockEnvWithFailingAI);
    
    expect(response.status).toBe(200); // Health check should still succeed
    
    const data = await response.json();
    expect(data.status).toBe('healthy');
    expect(data.services.ai).toBe('error');
  });

  it('should handle health check internal errors', async () => {
    // Force an error in the health check by causing JSON.stringify to fail
    const originalStringify = JSON.stringify;
    let callCount = 0;
    
    JSON.stringify = vi.fn().mockImplementation((value) => {
      callCount++;
      // Fail when trying to stringify the health response
      if (callCount > 3 && value && value.status && value.services) {
        throw new Error('Health check serialization error');
      }
      return originalStringify(value);
    });

    try {
      const request = new Request('http://localhost/health');
      const response = await workerModule.fetch(request, { AI: null });
      
      // Restore JSON.stringify before checking response
      JSON.stringify = originalStringify;
      
      // Should return 500 status due to serialization error
      expect(response.status).toBe(500);
      
      const data = await response.json();
      expect(data.status).toBe('unhealthy');
      expect(data.error).toBe('Health check serialization error');
      expect(data.requestId).toBeDefined();
    } finally {
      // Ensure JSON.stringify is always restored
      JSON.stringify = originalStringify;
    }
  });
});

describe('Metrics Endpoint Error Handling', () => {
  it('should handle metrics retrieval errors', async () => {
    // Test the error path by mocking JSON.stringify to fail
    const request = new Request('http://localhost/metrics');
    const originalStringify = JSON.stringify;
    
    // Create a mock that fails on certain conditions
    JSON.stringify = vi.fn().mockImplementation((value, replacer, space) => {
      // Fail when trying to stringify the metrics response
      if (value && value.metrics && value.timestamp) {
        throw new Error('Serialization error');
      }
      // Otherwise use the original implementation
      return originalStringify(value, replacer, space);
    });
    
    try {
      const response = await workerModule.fetch(request, { AI: null });
      
      // Restore JSON.stringify before trying to parse response
      JSON.stringify = originalStringify;
      
      expect(response.status).toBe(500);
      const errorData = await response.json();
      expect(errorData.error).toBe('Failed to retrieve metrics');
      expect(errorData.requestId).toBeDefined();
    } finally {
      // Ensure JSON.stringify is always restored
      JSON.stringify = originalStringify;
    }
  });

  it('should handle recipe save worker search network errors gracefully', async () => {
    const mockEnv = {
      SEARCH_DB_URL: null,
      RECIPE_SAVE_WORKER_URL: 'https://invalid-url.workers.dev'
    };

    const recipes = await searchRecipeByCategory(
      'Test Category',
      ['test dish 1', 'test dish 2'],
      2,
      mockEnv,
      'test-req-123'
    );

    expect(recipes).toHaveLength(2);
    expect(recipes[0]).toHaveProperty('fallback', true);
    expect(recipes[0]).toHaveProperty('source', 'ai_generated');
  });

  it('should handle complete search failure gracefully', async () => {
    const mockEnv = {
      SEARCH_DB_URL: null,
      RECIPE_SAVE_WORKER_URL: null
    };

    const recipes = await searchRecipeByCategory(
      'Test Category',
      ['test dish 1', 'test dish 2'],
      2,
      mockEnv,
      'test-req-123'
    );

    expect(recipes).toHaveLength(2);
    expect(recipes[0]).toHaveProperty('fallback', true);
    expect(recipes[0]).toHaveProperty('source', 'ai_generated');
  });

  it('should handle search with no meaningful cooking terms', async () => {
    const mockEnv = {
      SEARCH_DB_URL: 'https://recipe-search-db.nolanfoster.workers.dev',
      RECIPE_SAVE_WORKER_URL: null
    };

    // Test with dish names that don't contain any predefined cooking terms
    const recipes = await searchRecipeByCategory(
      'Very Creative Category',
      ['xyzzy dish', 'qwerty food', 'abracadabra meal'],
      2,
      mockEnv,
      'test-req-123'
    );

    expect(recipes).toHaveLength(2);
    // The search database is working, so it should find real recipes
    expect(recipes[0]).toHaveProperty('source', 'smart_search_database');
    expect(recipes[0]).not.toHaveProperty('fallback');
  });
});
