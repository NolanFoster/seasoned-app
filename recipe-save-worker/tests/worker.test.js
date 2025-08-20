// Recipe Save Worker Tests
import { describe, it, expect, beforeEach, vi } from 'vitest';
import worker, { RecipeSaver } from '../src/index.js';

// Mock KV storage
const mockKVStorage = {
  put: vi.fn(),
  get: vi.fn(),
  delete: vi.fn(),
  list: vi.fn()
};

// Mock Durable Object stub
const mockDOStub = {
  fetch: vi.fn()
};

// Mock Durable Object namespace
const mockDONamespace = {
  idFromName: vi.fn(() => 'test-do-id'),
  get: vi.fn(() => mockDOStub)
};

// Mock environment
const mockEnv = {
  RECIPE_STORAGE: mockKVStorage,
  RECIPE_SAVER: mockDONamespace,
  SEARCH_DB_URL: 'https://test-search-db.workers.dev',
  RECIPE_IMAGES: {
    put: vi.fn(),
    get: vi.fn(),
    delete: vi.fn()
  }
};

// Simple tests to verify the worker structure
describe('Recipe Save Worker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Basic Structure', () => {
    it('should export default worker', () => {
      expect(worker).toBeDefined();
      expect(worker.fetch).toBeDefined();
    });

    it('should export RecipeSaver Durable Object', () => {
      expect(RecipeSaver).toBeDefined();
    });
  });

  describe('Worker Fetch Handler', () => {
    it('should handle health check', async () => {
      const request = new Request('https://worker.dev/health');
      const response = await worker.fetch(request, mockEnv);
      
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.status).toBe('healthy');
      expect(data.version).toBe('1.0.0');
    });

    it('should handle CORS preflight', async () => {
      const request = new Request('https://worker.dev/recipe/save', {
        method: 'OPTIONS'
      });
      
      const response = await worker.fetch(request, mockEnv);
      
      expect(response.status).toBe(200);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    });

    it('should route recipe operations to Durable Object', async () => {
      // Setup mock response from Durable Object
      mockDOStub.fetch.mockResolvedValue(new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }));

      const request = new Request('https://worker.dev/recipe/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Test Recipe' })
      });

      const response = await worker.fetch(request, mockEnv);
      
      expect(mockDONamespace.idFromName).toHaveBeenCalledWith('main');
      expect(mockDONamespace.get).toHaveBeenCalled();
      expect(mockDOStub.fetch).toHaveBeenCalled();
      expect(response.status).toBe(200);
    });
  });

  describe('RecipeSaver Durable Object', () => {
    it('should create instance with state and env', () => {
      const mockState = { storage: {} };
      const recipeSaver = new RecipeSaver(mockState, mockEnv);
      
      expect(recipeSaver.state).toBe(mockState);
      expect(recipeSaver.env).toBe(mockEnv);
    });

    it('should have fetch method', () => {
      const mockState = { storage: {} };
      const recipeSaver = new RecipeSaver(mockState, mockEnv);
      
      expect(recipeSaver.fetch).toBeDefined();
    });
  });
});