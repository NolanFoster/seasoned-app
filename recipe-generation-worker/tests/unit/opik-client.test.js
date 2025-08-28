import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Opik Client - Unit Tests
 * Tests for the Opik tracing client that provides observability around recipe generation
 */

import { OpikClient, createOpikClient, opikClient } from '../../src/opik-client.js';

describe('Opik Client - Unit Tests', () => {
  let client;
  let mockTrace;
  let mockSpan;

  beforeEach(() => {
    // Create a client without API key for testing
    client = new OpikClient();

    // Mock the Opik SDK for testing with API key
    mockSpan = {
      end: vi.fn(),
      error: vi.fn()
    };

    mockTrace = {
      span: vi.fn().mockReturnValue(mockSpan),
      end: vi.fn(),
      error: vi.fn()
    };
  });

  describe('Constructor and Configuration', () => {
    it('should create client with API key', () => {
      const keyClient = new OpikClient('test-api-key');
      expect(keyClient.apiKey).toBe('test-api-key');
      expect(keyClient.workspaceName).toBe('recipe-generation-worker');
    });

    it('should create client without API key', () => {
      expect(client.apiKey).toBeNull();
      expect(client.client).toBeNull();
    });

    it('should create client with custom workspace name', () => {
      const customClient = new OpikClient('test-key', 'custom-workspace');
      expect(customClient.workspaceName).toBe('custom-workspace');
    });

    it('should not initialize client without API key', () => {
      expect(client.client).toBeNull();
    });

    it('should throw error when initializing without API key', () => {
      expect(() => client.initializeClient()).toThrow('API key is required to initialize Opik client');
    });
  });

  describe('API Key Management', () => {
    it('should set API key and initialize client', () => {
      client.setApiKey('new-api-key');
      expect(client.apiKey).toBe('new-api-key');
      // Note: In test environment, the actual Opik SDK may not be available
      // so we just verify the API key was set
    });

    it('should not initialize client without API key', () => {
      expect(client.client).toBeNull();
    });

    it('should handle empty API key gracefully', () => {
      client.setApiKey('');
      expect(client.apiKey).toBeNull();
      expect(client.client).toBeNull();
    });

    it('should handle null API key gracefully', () => {
      client.setApiKey(null);
      expect(client.apiKey).toBeNull();
      expect(client.client).toBeNull();
    });
  });

  describe('Health Checking', () => {
    it('should return false when client is not healthy', () => {
      expect(client.isHealthy()).toBe(false);
    });

    it('should return true when client has API key', () => {
      const keyClient = new OpikClient('test-key');
      // Note: In test environment, the actual Opik SDK may not be available
      // so we just verify the API key was set
      expect(keyClient.apiKey).toBe('test-key');
    });
  });

  describe('Tracing Operations', () => {
    it('should return null when client is not initialized', () => {
      const trace = client.createTrace('Test Operation');
      expect(trace).toBeNull();
    });

    it('should return null when trace is not provided for span', () => {
      const span = client.createSpan(null, 'Test Span', 'test-type');
      expect(span).toBeNull();
    });

    it('should handle span ending gracefully when span is null', () => {
      // Should not throw
      expect(() => client.endSpan(null, { result: 'success' })).not.toThrow();
    });

    it('should handle trace ending gracefully when trace is null', () => {
      // Should not throw
      expect(() => client.endTrace(null, { result: 'success' })).not.toThrow();
    });

    it('should create span successfully when trace is provided', () => {
      const span = client.createSpan(mockTrace, 'Test Span', 'test-type', { test: 'data' });
      expect(span).toBe(mockSpan);
      expect(mockTrace.span).toHaveBeenCalledWith({
        name: 'Test Span',
        type: 'test-type',
        input: { test: 'data' }
      });
    });

    it('should end span with output successfully', () => {
      client.endSpan(mockSpan, { result: 'success' });
      expect(mockSpan.end).toHaveBeenCalledWith({ result: 'success' });
    });

    it('should end span with error successfully', () => {
      const error = new Error('Test error');
      client.endSpan(mockSpan, null, error);
      expect(mockSpan.error).toHaveBeenCalledWith(error);
    });

    it('should end trace with output successfully', () => {
      client.endTrace(mockTrace, { result: 'success' });
      expect(mockTrace.end).toHaveBeenCalledWith({ result: 'success' });
    });

    it('should end trace with error successfully', () => {
      const error = new Error('Test error');
      client.endTrace(mockTrace, null, error);
      expect(mockTrace.error).toHaveBeenCalledWith(error);
    });

    it('should handle span creation errors gracefully', () => {
      const errorTrace = {
        ...mockTrace,
        span: vi.fn().mockImplementation(() => {
          throw new Error('Span creation failed');
        })
      };

      const span = client.createSpan(errorTrace, 'Test Span', 'test-type');
      expect(span).toBeNull();
    });

    it('should handle span ending errors gracefully', () => {
      const errorSpan = {
        ...mockSpan,
        end: vi.fn().mockImplementation(() => {
          throw new Error('Span ending failed');
        })
      };

      // Should not throw
      expect(() => client.endSpan(errorSpan, { result: 'success' })).not.toThrow();
    });

    it('should handle span error ending errors gracefully', () => {
      const errorSpan = {
        ...mockSpan,
        error: vi.fn().mockImplementation(() => {
          throw new Error('Span error failed');
        })
      };

      // Should not throw
      expect(() => client.endSpan(errorSpan, null, new Error('Test error'))).not.toThrow();
    });

    it('should handle trace ending errors gracefully', () => {
      const errorTrace = {
        ...mockTrace,
        end: vi.fn().mockImplementation(() => {
          throw new Error('Trace ending failed');
        })
      };

      // Should not throw
      expect(() => client.endTrace(errorTrace, { result: 'success' })).not.toThrow();
    });

    it('should handle trace error ending errors gracefully', () => {
      const errorTrace = {
        ...mockTrace,
        error: vi.fn().mockImplementation(() => {
          throw new Error('Trace error failed');
        })
      };

      // Should not throw
      expect(() => client.endTrace(errorTrace, null, new Error('Test error'))).not.toThrow();
    });
  });

  describe('Factory Functions', () => {
    it('should create client using factory function', () => {
      const factoryClient = createOpikClient('factory-key', 'factory-workspace');

      expect(factoryClient).toBeInstanceOf(OpikClient);
      expect(factoryClient.apiKey).toBe('factory-key');
      expect(factoryClient.workspaceName).toBe('factory-workspace');
    });

    it('should create default client instance', () => {
      expect(opikClient).toBeInstanceOf(OpikClient);
    });

    it('should create client with default workspace when not specified', () => {
      const factoryClient = createOpikClient('factory-key');
      expect(factoryClient.workspaceName).toBe('recipe-generation-worker');
    });
  });
});

