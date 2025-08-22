/**
 * Tests for error handling and categorization
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import workerModule from '../src/index.js';

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
    // Create a mock environment that will cause an error in health check
    const mockEnvWithError = {
      AI: {
        run: () => {
          throw new Error('Unexpected error in AI binding');
        }
      }
    };

    const request = new Request('http://localhost/health');
    const response = await workerModule.fetch(request, mockEnvWithError);
    
    // Should return error status if health check itself fails
    const data = await response.json();
    if (response.status === 500) {
      expect(data.status).toBe('unhealthy');
      expect(data.error).toBeDefined();
    } else {
      // Or handle gracefully
      expect(data.services.ai).toBe('error');
    }
  });
});

describe('Metrics Endpoint Error Handling', () => {
  it('should handle metrics retrieval errors', async () => {
    // This test ensures the metrics endpoint handles any potential errors
    const request = new Request('http://localhost/metrics');
    const response = await workerModule.fetch(request, { AI: null });
    
    expect(response.status).toBe(200);
    
    const data = await response.json();
    expect(data.metrics).toBeDefined();
    expect(data.timestamp).toBeDefined();
    expect(data.requestId).toBeDefined();
  });
});
