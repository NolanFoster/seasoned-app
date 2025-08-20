// Recipe Save Worker Tests
import { describe, it, expect, beforeEach, vi } from 'vitest';
import worker, { RecipeSaver } from '../src/index.js';

// Mock the shared kv-storage module
vi.mock('../../shared/kv-storage.js', () => ({
  compressData: vi.fn().mockImplementation(async (data) => JSON.stringify(data)),
  decompressData: vi.fn().mockImplementation(async (data) => JSON.parse(data)),
  generateRecipeId: vi.fn().mockImplementation(async (url) => 'test-recipe-id')
}));

// Mock the shared nutrition-calculator module
vi.mock('../../shared/nutrition-calculator.js', () => ({
  calculateNutritionalFacts: vi.fn().mockImplementation(async (ingredients) => ({
    calories: 200,
    protein: 10,
    carbohydrates: 30,
    fat: 5
  }))
}));

describe('Recipe Save Worker', () => {
  let mockEnv;
  let mockCtx;

  beforeEach(() => {
    // Setup fresh mocks for each test
    mockEnv = createMockEnv();
    mockCtx = createMockContext();
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
      const response = await worker.fetch(request, mockEnv, mockCtx);
      
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.status).toBe('healthy');
      expect(data.version).toBe('1.0.0');
    });

    it('should handle CORS preflight', async () => {
      const request = new Request('https://worker.dev/recipe/save', {
        method: 'OPTIONS'
      });
      
      const response = await worker.fetch(request, mockEnv, mockCtx);
      
      expect(response.status).toBe(200);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
      expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET, POST, PUT, DELETE, OPTIONS');
      expect(response.headers.get('Access-Control-Allow-Headers')).toBe('Content-Type, Authorization');
    });

    it('should route recipe save operations to Durable Object', async () => {
      const mockDOResponse = new Response(JSON.stringify({ success: true, id: '123' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
      
      const mockDOStub = {
        fetch: vi.fn().mockResolvedValue(mockDOResponse)
      };
      
      mockEnv.RECIPE_SAVER.get.mockReturnValue(mockDOStub);
      
      const request = new Request('https://worker.dev/recipe/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Test Recipe' })
      });
      
      const response = await worker.fetch(request, mockEnv, mockCtx);
      
      expect(mockEnv.RECIPE_SAVER.idFromName).toHaveBeenCalledWith('global-recipe-saver');
      expect(mockEnv.RECIPE_SAVER.get).toHaveBeenCalled();
      expect(mockDOStub.fetch).toHaveBeenCalled();
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
    });

    it('should handle errors gracefully', async () => {
      const request = new Request('https://worker.dev/invalid-path');
      const response = await worker.fetch(request, mockEnv, mockCtx);
      
      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error).toBeDefined();
    });
  });

  describe('RecipeSaver Durable Object', () => {
    let mockState;
    let recipeSaver;

    beforeEach(() => {
      mockState = {
        storage: {
          get: vi.fn(),
          put: vi.fn(),
          delete: vi.fn(),
          list: vi.fn()
        },
        waitUntil: vi.fn()
      };
      recipeSaver = new RecipeSaver(mockState, mockEnv);
    });

    it('should create instance with state and env', () => {
      expect(recipeSaver.state).toBe(mockState);
      expect(recipeSaver.env).toBe(mockEnv);
    });

    it('should have fetch method', () => {
      expect(recipeSaver.fetch).toBeDefined();
      expect(typeof recipeSaver.fetch).toBe('function');
    });

    it('should handle save recipe request', async () => {
      const recipeData = {
        recipe: {
          url: 'https://example.com/test-recipe',
          title: 'Test Recipe',
          ingredients: ['1 cup flour', '2 eggs'],
          instructions: ['Mix ingredients', 'Bake at 350°F']
        },
        options: { overwrite: false }
      };

      const request = new Request('http://do/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(recipeData)
      });

      // Mock the storage env that the Durable Object actually uses
      mockEnv.RECIPE_STORAGE = mockEnv.CLIPPED_RECIPE_KV;
      mockEnv.RECIPE_STORAGE.get.mockResolvedValue(null); // Recipe doesn't exist yet
      mockEnv.RECIPE_STORAGE.put.mockResolvedValue();
      
      // Mock state.blockConcurrencyWhile
      mockState.blockConcurrencyWhile = vi.fn().mockImplementation(async (fn) => fn());
      
      // Mock processRecipeImages and calculateAndAddNutrition methods
      recipeSaver.processRecipeImages = vi.fn().mockImplementation(async (recipe) => recipe);
      recipeSaver.calculateAndAddNutrition = vi.fn().mockImplementation(async (recipe) => ({
        ...recipe,
        nutrition: { calories: 200, protein: 10, carbs: 30, fat: 5 }
      }));
      recipeSaver.syncWithSearchDB = vi.fn().mockResolvedValue();

      const response = await recipeSaver.fetch(request);
      
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.id).toBeDefined();
      
      // Verify KV operations were called
      expect(mockEnv.RECIPE_STORAGE.get).toHaveBeenCalled();
      expect(mockEnv.RECIPE_STORAGE.put).toHaveBeenCalled();
    });

    it('should handle get recipe request', async () => {
      const mockRecipe = {
        id: '123',
        title: 'Test Recipe',
        ingredients: ['flour', 'eggs']
      };

      // Mock compressed data retrieval
      mockEnv.RECIPE_STORAGE = mockEnv.CLIPPED_RECIPE_KV;
      const compressedData = JSON.stringify(mockRecipe);
      mockEnv.RECIPE_STORAGE.get.mockResolvedValue(compressedData);

      // The get endpoint uses query params
      const request = new Request('http://do/get?id=123');
      const response = await recipeSaver.fetch(request);
      
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toEqual(mockRecipe);
      expect(mockEnv.RECIPE_STORAGE.get).toHaveBeenCalledWith('123');
    });

    it('should handle delete recipe request', async () => {
      const request = new Request('http://do/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipeId: '123' })
      });

      mockEnv.RECIPE_STORAGE = mockEnv.CLIPPED_RECIPE_KV;
      mockEnv.RECIPE_STORAGE.delete.mockResolvedValue();
      // Mock getting recipe first (delete needs to retrieve it)
      const mockRecipe = { id: '123', title: 'Test Recipe' };
      const compressedData = JSON.stringify(mockRecipe);
      mockEnv.RECIPE_STORAGE.get.mockResolvedValue(compressedData);
      
      // Mock state.blockConcurrencyWhile
      mockState.blockConcurrencyWhile = vi.fn().mockImplementation(async (fn) => fn());

      const response = await recipeSaver.fetch(request);
      
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      
      // Verify KV deletion was called
      expect(mockEnv.RECIPE_STORAGE.delete).toHaveBeenCalledWith('123');
    });

    it('should handle errors in Durable Object operations', async () => {
      const request = new Request('http://do/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipe: {} }) // Missing required URL
      });

      mockEnv.RECIPE_STORAGE = mockEnv.CLIPPED_RECIPE_KV;

      const response = await recipeSaver.fetch(request);
      
      expect(response.status).toBe(400); // Bad request due to missing URL
      const data = await response.json();
      expect(data.error).toBeDefined();
      expect(data.error).toContain('Recipe URL is required');
    });
  });
});