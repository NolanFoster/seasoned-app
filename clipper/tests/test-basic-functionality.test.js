// Basic functionality tests for Recipe Clipper Worker
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import worker from '../src/recipe-clipper.js';
import { 
  extractRecipeFromAIResponse,
  convertTimeToISO8601,
  cleanHtmlForGPT,
  extractDescriptionFromHTML,
  extractYieldFromHTML 
} from '../src/recipe-clipper.js';

describe('Recipe Clipper Basic Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('Worker fetch handler', () => {
    it('should handle OPTIONS requests', async () => {
      const request = new Request('http://localhost/clip', {
        method: 'OPTIONS'
      });

      const mockEnv = {
        RECIPE_STORAGE: {},
        SAVE_WORKER_URL: 'https://save.example.com',
        AI: {}
      };

      const response = await worker.fetch(request, mockEnv);
      
      expect(response.status).toBe(200);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    });

    it('should reject POST without URL', async () => {
      const request = new Request('http://localhost/clip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });

      const mockEnv = {
        RECIPE_STORAGE: {},
        SAVE_WORKER_URL: 'https://save.example.com',
        AI: {}
      };

      const response = await worker.fetch(request, mockEnv);
      
      expect(response.status).toBe(400);
      expect(await response.text()).toBe('URL is required');
    });
  });

  describe('Helper functions', () => {
    describe('convertTimeToISO8601', () => {
      it('should convert minutes to ISO 8601', () => {
        expect(convertTimeToISO8601('30 minutes')).toBe('PT30M');
        expect(convertTimeToISO8601('45 min')).toBe('PT45M');
        expect(convertTimeToISO8601('90 mins')).toBe('PT90M');
      });

      it('should convert hours to ISO 8601', () => {
        expect(convertTimeToISO8601('1 hour')).toBe('PT1H');
        expect(convertTimeToISO8601('2 hours')).toBe('PT2H');
        expect(convertTimeToISO8601('1.5 hours')).toBe('PT1H30M');
      });

      it('should convert combined time to ISO 8601', () => {
        expect(convertTimeToISO8601('1 hour 30 minutes')).toBe('PT1H30M');
        expect(convertTimeToISO8601('2 hours 15 minutes')).toBe('PT2H15M');
      });

      it('should handle null/undefined', () => {
        expect(convertTimeToISO8601(null)).toBeNull();
        expect(convertTimeToISO8601(undefined)).toBeNull();
        expect(convertTimeToISO8601('')).toBeNull();
      });
    });

    describe('cleanHtmlForGPT', () => {
      it('should remove script tags', () => {
        const html = '<div>Hello<script>alert("test")</script>World</div>';
        const cleaned = cleanHtmlForGPT(html);
        expect(cleaned).not.toContain('<script>');
        expect(cleaned).toContain('Hello');
        expect(cleaned).toContain('World');
      });

      it('should remove style tags', () => {
        const html = '<div>Hello<style>body { color: red; }</style>World</div>';
        const cleaned = cleanHtmlForGPT(html);
        expect(cleaned).not.toContain('<style>');
        expect(cleaned).toContain('Hello');
        expect(cleaned).toContain('World');
      });

      it('should handle empty input', () => {
        expect(cleanHtmlForGPT('')).toBe('');
        expect(cleanHtmlForGPT(null)).toBe('');
        expect(cleanHtmlForGPT(undefined)).toBe('');
      });
    });

    describe('extractDescriptionFromHTML', () => {
      it('should extract from meta description', () => {
        const html = '<meta name="description" content="A delicious recipe">';
        expect(extractDescriptionFromHTML(html)).toBe('A delicious recipe');
      });

      it('should extract from og:description', () => {
        const html = '<meta property="og:description" content="An amazing dish">';
        expect(extractDescriptionFromHTML(html)).toBe('An amazing dish');
      });

      it('should handle missing description', () => {
        const html = '<div>No meta tags here</div>';
        expect(extractDescriptionFromHTML(html)).toBeNull();
      });
    });

    describe('extractYieldFromHTML', () => {
      it('should extract from recipe:yield meta', () => {
        const html = '<meta property="recipe:yield" content="4 servings">';
        expect(extractYieldFromHTML(html)).toBe('4 servings');
      });

      it('should extract from itemprop recipeYield', () => {
        const html = '<span itemprop="recipeYield">6 portions</span>';
        expect(extractYieldFromHTML(html)).toBe('6 portions');
      });

      it('should handle missing yield', () => {
        const html = '<div>No yield info</div>';
        expect(extractYieldFromHTML(html)).toBeNull();
      });
    });
  });

  describe('AI response extraction', () => {
    it('should extract valid recipe from AI response', () => {
      const mockResponse = {
        response: JSON.stringify({
          source: {
            output: [{
              content: [{
                text: JSON.stringify({
                  name: "Test Recipe",
                  image: "https://example.com/image.jpg",
                  recipeIngredient: ["1 cup flour", "2 eggs"],
                  recipeInstructions: ["Mix", "Bake"]
                })
              }]
            }]
          }
        })
      };

      const recipe = extractRecipeFromAIResponse(mockResponse);
      
      expect(recipe).toBeDefined();
      expect(recipe.name).toBe("Test Recipe");
      expect(recipe.image).toBe("https://example.com/image.jpg");
      expect(recipe.recipeIngredient).toEqual(["1 cup flour", "2 eggs"]);
      expect(recipe.recipeInstructions).toEqual(["Mix", "Bake"]);
    });

    it('should handle null AI response', () => {
      const mockResponse = {
        response: JSON.stringify({
          source: {
            output: [{
              content: [{
                text: 'null'
              }]
            }]
          }
        })
      };

      const recipe = extractRecipeFromAIResponse(mockResponse);
      expect(recipe).toBeNull();
    });

    it('should handle malformed AI response', () => {
      const mockResponse = {
        response: JSON.stringify({
          source: {
            output: [{
              content: [{
                text: 'invalid json'
              }]
            }]
          }
        })
      };

      const recipe = extractRecipeFromAIResponse(mockResponse);
      expect(recipe).toBeNull();
    });
  });
});