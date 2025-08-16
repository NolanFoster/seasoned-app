/**
 * Additional tests for improving coverage
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import worker from './worker.js';
import * as kvStorage from '../shared/kv-storage.js';

// Mock the shared KV storage module
jest.mock('../shared/kv-storage.js');

describe('Additional Worker Tests', () => {
  let env;
  let ctx;

  beforeEach(() => {
    jest.clearAllMocks();
    
    env = {
      RECIPES_DB: {}
    };

    ctx = {
      waitUntil: jest.fn()
    };

    // Mock fetch for scraping tests
    global.fetch = jest.fn();
    
    // Mock HTMLRewriter
    global.HTMLRewriter = jest.fn().mockImplementation(() => ({
      on: jest.fn().mockReturnThis(),
      transform: jest.fn().mockImplementation(() => ({
        text: jest.fn().mockResolvedValue('')
      }))
    }));
  });

  const createRequest = (method, url, body = null) => {
    return new Request(url, {
      method,
      headers: {
        'Content-Type': 'application/json'
      },
      body: body ? JSON.stringify(body) : null
    });
  };

  describe('GET /scrape with save', () => {
    test('should handle successful scraping with save=true', async () => {
      // Mock a successful fetch response
      global.fetch.mockResolvedValueOnce({
        ok: true,
        status: 200
      });

      kvStorage.generateRecipeId.mockResolvedValueOnce('recipe-123');
      kvStorage.saveRecipeToKV.mockResolvedValueOnce({ success: true });

      const request = createRequest('GET', 'https://example.com/scrape?url=https://recipe.com/test&save=true');
      const response = await worker.fetch(request, env, ctx);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.summary).toBeDefined();
      expect(data.summary.total).toBe(1);
    });

    test('should handle avoidOverwrite=true when recipe exists', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        status: 200
      });

      kvStorage.generateRecipeId.mockResolvedValueOnce('existing-id');
      kvStorage.getRecipeFromKV.mockResolvedValueOnce({ 
        success: true,
        recipe: { id: 'existing-id', name: 'Existing Recipe' }
      });

      const request = createRequest('GET', 'https://example.com/scrape?url=https://recipe.com/test&save=true&avoidOverwrite=true');
      const response = await worker.fetch(request, env, ctx);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.results[0].skipped).toBe(true);
      expect(data.results[0].reason).toContain('already exists');
    });
  });

  describe('POST /scrape', () => {
    test('should handle batch scraping with single URL', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        status: 200
      });

      const request = createRequest('POST', 'https://example.com/scrape', {
        url: 'https://recipe.com/single'
      });
      const response = await worker.fetch(request, env, ctx);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.summary.total).toBe(1);
    });

    test('should handle batch scraping with save', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        status: 200
      });

      kvStorage.generateRecipeId.mockResolvedValueOnce('batch-id');
      kvStorage.saveRecipeToKV.mockResolvedValueOnce({ success: true });

      const request = createRequest('POST', 'https://example.com/scrape', {
        urls: ['https://recipe.com/batch'],
        save: true
      });
      const response = await worker.fetch(request, env, ctx);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.summary.total).toBe(1);
    });

    test('should handle batch scraping with avoidOverwrite', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        status: 200
      });

      kvStorage.generateRecipeId.mockResolvedValueOnce('existing-batch-id');
      kvStorage.getRecipeFromKV.mockResolvedValueOnce({ 
        success: true,
        recipe: { id: 'existing-batch-id' }
      });

      const request = createRequest('POST', 'https://example.com/scrape', {
        urls: ['https://recipe.com/existing'],
        save: true,
        avoidOverwrite: true
      });
      const response = await worker.fetch(request, env, ctx);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.results[0].skipped).toBe(true);
    });
  });

  describe('GET /recipes with existing data', () => {
    test('should retrieve existing recipe', async () => {
      kvStorage.getRecipeFromKV.mockResolvedValueOnce({ 
        success: true,
        recipe: {
          id: 'test-123',
          name: 'Test Recipe',
          ingredients: ['flour', 'eggs']
        }
      });

      const request = createRequest('GET', 'https://example.com/recipes?id=test-123');
      const response = await worker.fetch(request, env, ctx);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.name).toBe('Test Recipe');
    });

    test('should handle pagination parameters', async () => {
      kvStorage.listRecipesFromKV.mockResolvedValueOnce({
        success: true,
        recipes: [
          { id: 'r1', name: 'Recipe 1' },
          { id: 'r2', name: 'Recipe 2' }
        ],
        total: 10,
        cursor: 'next-page'
      });

      const request = createRequest('GET', 'https://example.com/recipes?cursor=start&limit=2');
      const response = await worker.fetch(request, env, ctx);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.recipes).toHaveLength(2);
      expect(data.cursor).toBe('next-page');
      expect(kvStorage.listRecipesFromKV).toHaveBeenCalledWith(env.RECIPES_DB, 'start', '2');
    });
  });

  describe('DELETE /recipes success cases', () => {
    test('should successfully delete recipe', async () => {
      kvStorage.deleteRecipeFromKV.mockResolvedValueOnce({ success: true });

      const request = createRequest('DELETE', 'https://example.com/recipes?id=delete-me');
      const response = await worker.fetch(request, env, ctx);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.message).toBe('Recipe deleted successfully');
    });

    test('should handle deletion failure', async () => {
      kvStorage.deleteRecipeFromKV.mockResolvedValueOnce({ 
        success: false,
        error: 'Failed to delete'
      });

      const request = createRequest('DELETE', 'https://example.com/recipes?id=cant-delete');
      const response = await worker.fetch(request, env, ctx);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.success).toBe(false);
    });
  });

  describe('Edge cases', () => {
    test('should handle null CORS headers', async () => {
      const request = createRequest('GET', 'https://example.com/health');
      const response = await worker.fetch(request, env, ctx);

      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
      expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET, POST, PUT, DELETE, OPTIONS');
      expect(response.headers.get('Access-Control-Allow-Headers')).toBe('Content-Type, Authorization');
    });

    test('should handle invalid method on /scrape', async () => {
      const request = createRequest('PUT', 'https://example.com/scrape');
      const response = await worker.fetch(request, env, ctx);
      const data = await response.json();

      // Should return API documentation
      expect(response.status).toBe(200);
      expect(data.service).toBe('Recipe Scraper with KV Storage');
    });
  });
});