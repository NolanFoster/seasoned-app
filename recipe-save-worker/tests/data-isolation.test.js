// Data Isolation Tests for Recipe Save Worker
// These tests verify that concurrent operations and different requests maintain proper data isolation

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import worker, { RecipeSaver } from '../src/index.js';

// Mock the shared modules
vi.mock('../../shared/kv-storage.js', () => ({
  compressData: vi.fn().mockImplementation(async (data) => JSON.stringify(data)),
  decompressData: vi.fn().mockImplementation(async (data) => JSON.parse(data)),
  generateRecipeId: vi.fn().mockImplementation(async (url) => `recipe_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`)
}));

vi.mock('../../shared/nutrition-calculator.js', () => ({
  calculateNutritionalFacts: vi.fn().mockImplementation(async (ingredients) => ({
    success: true,
    nutrition: {
      calories: 250,
      protein: 12,
      carbohydrates: 35,
      fat: 8
    }
  })),
  extractServingsFromYield: vi.fn().mockImplementation((value) => parseInt(value) || 1)
}));

describe('Data Isolation Tests', () => {
  let mockEnv;
  let mockCtx;
  let mockState;
  let recipeSaver;

  beforeEach(async () => {
    // Setup fresh mocks for each test
    mockEnv = createMockEnv();
    mockCtx = createMockContext();
    mockState = createMockState();
    recipeSaver = new RecipeSaver(mockState, mockEnv);
    
    // Reset fetch mock
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Request ID Isolation', () => {
    it('should generate unique request IDs for each request', async () => {
      const request1 = new Request('http://do/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipe: { url: 'https://example.com/recipe1' } })
      });

      const request2 = new Request('http://do/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipe: { url: 'https://example.com/recipe2' } })
      });

      // Mock successful responses
      mockState.storage.get.mockResolvedValue(null); // No existing recipe
      mockState.storage.put.mockResolvedValue(undefined);
      mockEnv.RECIPE_STORAGE.put.mockResolvedValue(undefined);
      global.fetch.mockResolvedValue(new Response('OK', { status: 200 }));

      const response1 = await recipeSaver.fetch(request1);
      const response2 = await recipeSaver.fetch(request2);

      expect(response1.status).toBe(200);
      expect(response2.status).toBe(200);

      // Verify that operations completed successfully
      const data1 = await response1.json();
      const data2 = await response2.json();

      expect(data1.success).toBe(true);
      expect(data2.success).toBe(true);
      expect(data1.id).not.toBe(data2.id);
    });

    it('should maintain request ID context throughout operation lifecycle', async () => {
      const request = new Request('http://do/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipe: { url: 'https://example.com/recipe1' } })
      });

      mockState.storage.get.mockResolvedValue(null);
      mockState.storage.put.mockResolvedValue(undefined);
      mockEnv.RECIPE_STORAGE.put.mockResolvedValue(undefined);
      global.fetch.mockResolvedValue(new Response('OK', { status: 200 }));

      const response = await recipeSaver.fetch(request);
      const data = await response.json();

      // Verify operation completed successfully
      expect(data.success).toBe(true);
      expect(data.id).toBeDefined();
    });
  });

  describe('Concurrent Operation Isolation', () => {
    it('should handle concurrent save operations without data corruption', async () => {
      const recipe1 = { url: 'https://example.com/recipe1', title: 'Recipe 1' };
      const recipe2 = { url: 'https://example.com/recipe2', title: 'Recipe 2' };

      // Mock successful responses
      mockState.storage.get.mockResolvedValue(null);
      mockState.storage.put.mockResolvedValue(undefined);
      mockEnv.RECIPE_STORAGE.put.mockResolvedValue(undefined);
      global.fetch.mockResolvedValue(new Response('OK', { status: 200 }));

      // Execute concurrent save operations
      const promises = [
        recipeSaver.fetch(new Request('http://do/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ recipe: recipe1 })
        })),
        recipeSaver.fetch(new Request('http://do/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ recipe: recipe2 })
        }))
      ];

      const [response1, response2] = await Promise.all(promises);

      expect(response1.status).toBe(200);
      expect(response2.status).toBe(200);

      const data1 = await response1.json();
      const data2 = await response2.json();

      // Verify each operation completed successfully
      expect(data1.success).toBe(true);
      expect(data2.success).toBe(true);
      expect(data1.id).not.toBe(data2.id);
    });

    it('should isolate concurrent update operations', async () => {
      const existingRecipe1 = { id: 'recipe1', title: 'Original Recipe 1', url: 'https://example.com/recipe1' };
      const existingRecipe2 = { id: 'recipe2', title: 'Original Recipe 2', url: 'https://example.com/recipe2' };

      // Mock existing recipes in KV storage
      mockEnv.RECIPE_STORAGE.get
        .mockResolvedValueOnce(JSON.stringify(existingRecipe1)) // For first update
        .mockResolvedValueOnce(JSON.stringify(existingRecipe2)); // For second update

      mockState.storage.put.mockResolvedValue(undefined);
      mockEnv.RECIPE_STORAGE.put.mockResolvedValue(undefined);
      global.fetch.mockResolvedValue(new Response('OK', { status: 200 }));

      const update1 = { title: 'Updated Recipe 1' };
      const update2 = { title: 'Updated Recipe 2' };

      const promises = [
        recipeSaver.fetch(new Request('http://do/update', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ recipeId: 'recipe1', updates: update1 })
        })),
        recipeSaver.fetch(new Request('http://do/update', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ recipeId: 'recipe2', updates: update2 })
        }))
      ];

      const [response1, response2] = await Promise.all(promises);

      expect(response1.status).toBe(200);
      expect(response2.status).toBe(200);

      const data1 = await response1.json();
      const data2 = await response2.json();

      // Verify operations are isolated
      expect(data1.success).toBe(true);
      expect(data2.success).toBe(true);
      expect(data1.id).not.toBe(data2.id);
    });

    it('should handle concurrent delete operations safely', async () => {
      const recipe1 = { id: 'recipe1', title: 'Recipe 1', url: 'https://example.com/recipe1' };
      const recipe2 = { id: 'recipe2', title: 'Recipe 2', url: 'https://example.com/recipe2' };

      // Mock existing recipes in KV storage
      mockEnv.RECIPE_STORAGE.get
        .mockResolvedValueOnce(JSON.stringify(recipe1))
        .mockResolvedValueOnce(JSON.stringify(recipe2));

      mockState.storage.delete.mockResolvedValue(undefined);
      mockEnv.RECIPE_STORAGE.delete.mockResolvedValue(undefined);
      global.fetch.mockResolvedValue(new Response('OK', { status: 200 }));

      const promises = [
        recipeSaver.fetch(new Request('http://do/delete', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ recipeId: 'recipe1' })
        })),
        recipeSaver.fetch(new Request('http://do/delete', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ recipeId: 'recipe2' })
        }))
      ];

      const [response1, response2] = await Promise.all(promises);

      expect(response1.status).toBe(200);
      expect(response2.status).toBe(200);

      const data1 = await response1.json();
      const data2 = await response2.json();

      expect(data1.success).toBe(true);
      expect(data2.success).toBe(true);
      expect(data1.id).not.toBe(data2.id);
    });
  });

  describe('Durable Object State Isolation', () => {
    it('should maintain separate state for different Durable Object instances', async () => {
      // Create two separate Durable Object instances
      const state1 = createMockState();
      const state2 = createMockState();
      
      const recipeSaver1 = new RecipeSaver(state1, mockEnv);
      const recipeSaver2 = new RecipeSaver(state2, mockEnv);

      const recipe1 = { url: 'https://example.com/recipe1', title: 'Recipe 1' };
      const recipe2 = { url: 'https://example.com/recipe2', title: 'Recipe 2' };

      // Mock successful responses
      state1.storage.get.mockResolvedValue(null);
      state1.storage.put.mockResolvedValue(undefined);
      state2.storage.get.mockResolvedValue(null);
      state2.storage.put.mockResolvedValue(undefined);
      mockEnv.RECIPE_STORAGE.put.mockResolvedValue(undefined);
      global.fetch.mockResolvedValue(new Response('OK', { status: 200 }));

      // Execute operations on different instances
      const response1 = await recipeSaver1.fetch(new Request('http://do/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipe: recipe1 })
      }));

      const response2 = await recipeSaver2.fetch(new Request('http://do/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipe: recipe2 })
      }));

      expect(response1.status).toBe(200);
      expect(response2.status).toBe(200);

      // Verify that each instance used its own state
      expect(state1.storage.put).toHaveBeenCalled();
      expect(state2.storage.put).toHaveBeenCalled();
      
      // Verify different recipe IDs were generated
      const data1 = await response1.json();
      const data2 = await response2.json();
      expect(data1.id).not.toBe(data2.id);
    });

    it('should isolate operation status storage between different recipes', async () => {
      const recipe1 = { url: 'https://example.com/recipe1', title: 'Recipe 1' };
      const recipe2 = { url: 'https://example.com/recipe2', title: 'Recipe 2' };

      mockState.storage.get.mockResolvedValue(null);
      mockState.storage.put.mockResolvedValue(undefined);
      mockEnv.RECIPE_STORAGE.put.mockResolvedValue(undefined);
      global.fetch.mockResolvedValue(new Response('OK', { status: 200 }));

      // Save first recipe
      const response1 = await recipeSaver.fetch(new Request('http://do/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipe: recipe1 })
      }));

      // Save second recipe
      const response2 = await recipeSaver.fetch(new Request('http://do/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipe: recipe2 })
      }));

      expect(response1.status).toBe(200);
      expect(response2.status).toBe(200);

      // Verify that operation status was stored with different keys
      const putCalls = mockState.storage.put.mock.calls;
      const operationStatusCalls = putCalls.filter(call => 
        call[0].startsWith('operation:')
      );

      expect(operationStatusCalls.length).toBeGreaterThan(0);
      
      // Each operation should have a unique status key
      const statusKeys = operationStatusCalls.map(call => call[0]);
      const uniqueKeys = new Set(statusKeys);
      expect(uniqueKeys.size).toBe(statusKeys.length);
    });
  });

  describe('Batch Operation Isolation', () => {
    it('should maintain isolation between batch operations', async () => {
      const batch1 = {
        operations: [
          { type: 'save', data: { recipe: { url: 'https://example.com/batch1-1', title: 'Batch 1 Recipe 1' } } },
          { type: 'save', data: { recipe: { url: 'https://example.com/batch1-2', title: 'Batch 1 Recipe 2' } } }
        ]
      };

      const batch2 = {
        operations: [
          { type: 'save', data: { recipe: { url: 'https://example.com/batch2-1', title: 'Batch 2 Recipe 1' } } },
          { type: 'save', data: { recipe: { url: 'https://example.com/batch2-2', title: 'Batch 2 Recipe 2' } } }
        ]
      };

      // Mock successful responses
      mockState.storage.get.mockResolvedValue(null);
      mockState.storage.put.mockResolvedValue(undefined);
      mockEnv.RECIPE_STORAGE.put.mockResolvedValue(undefined);
      global.fetch.mockResolvedValue(new Response('OK', { status: 200 }));

      // Execute batch operations concurrently
      const promises = [
        worker.fetch(new Request('https://worker.dev/batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(batch1)
        }), mockEnv, mockCtx),
        worker.fetch(new Request('https://worker.dev/batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(batch2)
        }), mockEnv, mockCtx)
      ];

      const [response1, response2] = await Promise.all(promises);

      expect(response1.status).toBe(200);
      expect(response2.status).toBe(200);

      const data1 = await response1.json();
      const data2 = await response2.json();

      // Verify each batch has its own results
      expect(data1.results).toHaveLength(2);
      expect(data2.results).toHaveLength(2);
      expect(data1.results).not.toEqual(data2.results);
    });

    it('should isolate batch operation failures', async () => {
      const batch = {
        operations: [
          { type: 'save', data: { recipe: { url: 'https://example.com/success', title: 'Success Recipe' } } },
          { type: 'save', data: { recipe: { url: 'https://example.com/failure', title: 'Failure Recipe' } } }
        ]
      };

      // Mock mixed responses - first succeeds, second fails
      mockState.storage.get
        .mockResolvedValueOnce(null) // First recipe doesn't exist
        .mockRejectedValueOnce(new Error('Storage error')); // Second recipe fails

      mockState.storage.put.mockResolvedValue(undefined);
      mockEnv.RECIPE_STORAGE.put.mockResolvedValue(undefined);
      global.fetch.mockResolvedValue(new Response('OK', { status: 200 }));

      const response = await worker.fetch(new Request('https://worker.dev/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(batch)
      }), mockEnv, mockCtx);

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.results).toHaveLength(2);

      // First operation should succeed
      expect(data.results[0].success).toBe(true);
      expect(data.results[0].operationId).toBe('op_0');

      // Second operation should fail
      expect(data.results[1].success).toBe(false);
      expect(data.results[1].operationId).toBe('op_1');
      expect(data.results[1].error).toBeDefined();
    });
  });

  describe('Error Isolation', () => {
    it('should isolate errors between different operations', async () => {
      const recipe1 = { url: 'https://example.com/recipe1', title: 'Recipe 1' };
      const recipe2 = { url: 'https://example.com/recipe2', title: 'Recipe 2' };

      // Mock first operation to succeed, second to fail
      mockEnv.RECIPE_STORAGE.get
        .mockResolvedValueOnce(null) // First recipe doesn't exist
        .mockRejectedValueOnce(new Error('Storage error')); // Second recipe fails

      mockState.storage.put.mockResolvedValue(undefined);
      mockEnv.RECIPE_STORAGE.put.mockResolvedValue(undefined);
      global.fetch.mockResolvedValue(new Response('OK', { status: 200 }));

      // Execute operations sequentially
      const response1 = await recipeSaver.fetch(new Request('http://do/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipe: recipe1 })
      }));

      const response2 = await recipeSaver.fetch(new Request('http://do/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipe: recipe2 })
      }));

      // First operation should succeed
      expect(response1.status).toBe(200);
      const data1 = await response1.json();
      expect(data1.success).toBe(true);

      // Second operation should fail
      expect(response2.status).toBe(500);
      const data2 = await response2.json();
      expect(data2.error).toBeDefined();
    });

    it('should maintain request isolation when operations fail', async () => {
      const recipe = { url: 'https://example.com/recipe', title: 'Recipe' };

      // Mock storage failure
      mockEnv.RECIPE_STORAGE.get.mockRejectedValue(new Error('Storage error'));

      const response = await recipeSaver.fetch(new Request('http://do/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipe })
      }));

      expect(response.status).toBe(500);
      const data = await response.json();
      
      // Should still have error information and maintain request context
      expect(data.error).toBeDefined();
      expect(data.error).toContain('Storage error');
    });
  });
});

// Helper functions for creating mocks
function createMockEnv() {
  return {
    RECIPE_SAVER: {
      idFromName: vi.fn().mockReturnValue('test-id'),
      get: vi.fn().mockReturnValue({
        fetch: vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }))
      })
    },
    RECIPE_STORAGE: {
      put: vi.fn().mockResolvedValue(undefined),
      get: vi.fn().mockResolvedValue(null),
      delete: vi.fn().mockResolvedValue(undefined)
    },
    RECIPE_IMAGES: {
      put: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined)
    }
  };
}

function createMockContext() {
  return {
    waitUntil: vi.fn(),
    passThroughOnException: vi.fn()
  };
}

function createMockState() {
  return {
    id: 'test-state-id',
    storage: {
      get: vi.fn().mockResolvedValue(null),
      put: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined)
    },
    blockConcurrencyWhile: vi.fn().mockImplementation(async (fn) => fn())
  };
}