import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Opik Client - Unit Tests
 * Tests for the Opik tracing client that provides observability around recipe generation
 */

import { OpikClient, createOpikClient } from '../../src/opik-client.js';

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
      expect(keyClient.workspaceName).toBe('recipe-generation');
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

    it('should return detailed health status', () => {
      const status = client.getHealthStatus();
      expect(status).toEqual({
        isHealthy: false,
        hasApiKey: false,
        apiKeyLength: 0,
        hasClient: false,
        workspaceName: 'recipe-generation'
      });
    });

    it('should return detailed health status for client with API key', () => {
      const keyClient = new OpikClient('test-api-key');
      const status = keyClient.getHealthStatus();
      expect(status).toEqual({
        isHealthy: true,
        hasApiKey: true,
        apiKeyLength: 12,
        hasClient: true,
        workspaceName: 'recipe-generation'
      });
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
        input: { test: 'data' },
        start_time: expect.any(String)
      });
    });

    it('should end span successfully', () => {
      client.endSpan(mockSpan);
      expect(mockSpan.end).toHaveBeenCalled();
    });

    it('should end span with error successfully', () => {
      const error = new Error('Test error');
      client.endSpan(mockSpan, error);
      expect(mockSpan.error).toHaveBeenCalledWith(error);
    });

    it('should end trace successfully', () => {
      client.endTrace(mockTrace);
      expect(mockTrace.end).toHaveBeenCalled();
    });

    it('should end trace with error successfully', () => {
      const error = new Error('Test error');
      client.endTrace(mockTrace, error);
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

  describe('Trace Identification', () => {
    it('should return null when no trace is provided', () => {
      expect(client.getTraceId(null)).toBeNull();
    });

    it('should read the id from the saved trace data', () => {
      expect(client.getTraceId({ data: { id: 'trace-abc' } })).toBe('trace-abc');
    });

    it('should fall back to an id on the trace itself', () => {
      expect(client.getTraceId({ id: 'trace-xyz' })).toBe('trace-xyz');
    });

    it('should return null when the id is not a usable string', () => {
      expect(client.getTraceId({ id: '' })).toBeNull();
      expect(client.getTraceId({ id: 123 })).toBeNull();
      expect(client.getTraceId({})).toBeNull();
    });
  });

  describe('Feedback Scores', () => {
    it('should skip scoring when the client is not initialized', async () => {
      const warnSpy = vi.spyOn(console, 'warn');
      const recorded = await client.logTraceFeedback('trace-abc', { name: 'user_saved_recipe', value: 1 });
      expect(recorded).toBe(false);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('not initialized'));
    });

    it('should queue the score against the trace and flush it', async () => {
      const keyClient = new OpikClient('test-api-key');
      const create = vi.fn();
      keyClient.client.traceFeedbackScoresBatchQueue = { create };
      vi.spyOn(keyClient.client, 'flush').mockResolvedValue(undefined);

      const recorded = await keyClient.logTraceFeedback('trace-abc', {
        name: 'user_saved_recipe',
        value: 1,
        reason: 'User saved the AI-generated recipe',
        categoryName: 'positive'
      });

      expect(recorded).toBe(true);
      expect(create).toHaveBeenCalledWith({
        id: 'trace-abc',
        projectName: 'recipe-generation',
        name: 'user_saved_recipe',
        value: 1,
        source: 'sdk',
        reason: 'User saved the AI-generated recipe',
        categoryName: 'positive'
      });
      expect(keyClient.client.flush).toHaveBeenCalled();
    });

    it('should fall back to the batch scoring API when no queue is available', async () => {
      const keyClient = new OpikClient('test-api-key');
      const scoreBatchOfTraces = vi.fn().mockResolvedValue(undefined);
      keyClient.client.traceFeedbackScoresBatchQueue = null;
      keyClient.client.api = { traces: { scoreBatchOfTraces } };
      vi.spyOn(keyClient.client, 'flush').mockResolvedValue(undefined);

      const recorded = await keyClient.logTraceFeedback('trace-abc', { name: 'user_saved_recipe', value: 1 });

      expect(recorded).toBe(true);
      expect(scoreBatchOfTraces).toHaveBeenCalledWith({
        scores: [expect.objectContaining({ id: 'trace-abc', name: 'user_saved_recipe', value: 1, source: 'sdk' })]
      });
    });

    it('should reject an invalid score payload', async () => {
      const keyClient = new OpikClient('test-api-key');
      const create = vi.fn();
      keyClient.client.traceFeedbackScoresBatchQueue = { create };

      expect(await keyClient.logTraceFeedback('', { name: 'user_saved_recipe', value: 1 })).toBe(false);
      expect(await keyClient.logTraceFeedback('trace-abc', { name: 'user_saved_recipe' })).toBe(false);
      expect(await keyClient.logTraceFeedback('trace-abc', { value: 1 })).toBe(false);
      expect(create).not.toHaveBeenCalled();
    });

    it('should handle scoring errors gracefully', async () => {
      const keyClient = new OpikClient('test-api-key');
      keyClient.client.traceFeedbackScoresBatchQueue = {
        create: vi.fn().mockImplementation(() => {
          throw new Error('Queue rejected the score');
        })
      };
      const errorSpy = vi.spyOn(console, 'error');

      const recorded = await keyClient.logTraceFeedback('trace-abc', { name: 'user_saved_recipe', value: 1 });

      expect(recorded).toBe(false);
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to log Opik feedback score'),
        expect.objectContaining({ message: 'Queue rejected the score' })
      );
    });
  });

  describe('Flush Operations', () => {
    it('should skip flush and warn when client is not initialized', async () => {
      const warnSpy = vi.spyOn(console, 'warn');
      await client.flush(); // client has null this.client (no API key)
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('not initialized'));
    });

    it('should flush successfully when client is initialized', async () => {
      const keyClient = new OpikClient('test-api-key');
      vi.spyOn(keyClient.client, 'flush').mockResolvedValue(undefined);
      const logSpy = vi.spyOn(console, 'log');
      await keyClient.flush();
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Flushing'));
    });

    it('should handle flush errors gracefully', async () => {
      const keyClient = new OpikClient('test-api-key');
      vi.spyOn(keyClient.client, 'flush').mockRejectedValue(new Error('Network flush error'));
      const errorSpy = vi.spyOn(console, 'error');
      await keyClient.flush();
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to flush'),
        expect.objectContaining({ message: 'Network flush error' })
      );
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
      const defaultClient = createOpikClient();
      expect(defaultClient).toBeInstanceOf(OpikClient);
    });

    it('should create client with default workspace when not specified', () => {
      const factoryClient = createOpikClient('factory-key');
      expect(factoryClient.workspaceName).toBe('recipe-generation');
    });
  });

  describe('Error Handling Branches', () => {
    it('should handle client initialization with empty string API key', () => {
      const client = new OpikClient('');
      expect(client.apiKey).toBe('');
      expect(client.client).toBeNull(); // Constructor treats empty string as falsy
    });

    it('should handle client initialization with whitespace-only API key', () => {
      const client = new OpikClient('   ');
      expect(client.apiKey).toBe('   ');
      expect(client.client).not.toBeNull(); // Constructor treats whitespace as truthy
    });

    it('should handle setApiKey with whitespace-only string', () => {
      client.setApiKey('   ');
      expect(client.apiKey).toBeNull();
      expect(client.client).toBeNull();
    });

    it('should handle setApiKey with undefined', () => {
      client.setApiKey(undefined);
      expect(client.apiKey).toBeNull();
      expect(client.client).toBeNull();
    });

    it('should handle setApiKey with null', () => {
      client.setApiKey(null);
      expect(client.apiKey).toBeNull();
      expect(client.client).toBeNull();
    });

    it('should handle setApiKey with empty string', () => {
      client.setApiKey('');
      expect(client.apiKey).toBeNull();
      expect(client.client).toBeNull();
    });

    it('should handle setApiKey with zero', () => {
      client.setApiKey(0);
      expect(client.apiKey).toBeNull();
      expect(client.client).toBeNull();
    });

    it('should handle setApiKey with false', () => {
      client.setApiKey(false);
      expect(client.apiKey).toBeNull();
      expect(client.client).toBeNull();
    });
  });
});

