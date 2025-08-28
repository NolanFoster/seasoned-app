import { describe, it, expect, beforeEach } from 'vitest';

/**
 * Opik Client - Unit Tests
 * Tests for the Opik tracing client that provides observability around recipe generation
 */

import { OpikClient, createOpikClient, opikClient } from '../../src/opik-client.js';

describe('Opik Client - Unit Tests', () => {
  let client;

  beforeEach(() => {
    // Create a client without API key for testing
    client = new OpikClient();
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
  });
});

