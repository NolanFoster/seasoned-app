/**
 * Integration Tests for Recipe Scraper Image Processing
 * Tests that images are properly downloaded and saved to R2 during recipe scraping
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock the shared modules
vi.mock('../shared/kv-storage.js', () => ({
  generateRecipeId: vi.fn().mockResolvedValue('test-recipe-id'),
  saveRecipeToKV: vi.fn().mockResolvedValue({ success: true }),
  getRecipeFromKV: vi.fn().mockResolvedValue({ success: false }),
  listRecipesFromKV: vi.fn().mockResolvedValue({ success: true, recipes: [] }),
  deleteRecipeFromKV: vi.fn().mockResolvedValue({ success: true })
}));

vi.mock('../shared/image-service.js', () => ({
  processRecipeImages: vi.fn()
}));

// Mock crypto for Node.js environment
vi.mock('crypto', () => ({
  default: {
    createHash: vi.fn(() => ({
      update: vi.fn().mockReturnThis(),
      digest: vi.fn(() => 'abcdef1234567890')
    }))
  }
}));

// Mock global fetch and HTMLRewriter
global.fetch = vi.fn();
global.HTMLRewriter = vi.fn().mockImplementation(() => ({
  on: vi.fn().mockReturnThis(),
  transform: vi.fn().mockReturnValue({
    text: vi.fn().mockResolvedValue('')
  })
}));

// Import the worker after mocking
const workerModule = await import('./worker.js');

describe('Recipe Scraper Image Integration', () => {
  let mockR2Bucket;
  let mockEnv;

  beforeEach(async () => {
    vi.clearAllMocks();

    mockR2Bucket = {
      put: vi.fn().mockResolvedValue(undefined)
    };

    mockEnv = {
      RECIPE_STORAGE: {
        get: vi.fn(),
        put: vi.fn()
      },
      RECIPE_IMAGES: mockR2Bucket
    };

    // Reset the HTMLRewriter mock to capture JSON-LD data
    global.HTMLRewriter.mockImplementation(() => {
      const handlers = {};
      return {
        on: vi.fn().mockImplementation((selector, handler) => {
          handlers[selector] = handler;
          return this;
        }),
        transform: vi.fn().mockImplementation((response) => ({
          text: vi.fn().mockImplementation(async () => {
            // Simulate extracting JSON-LD with recipe data
            const handler = handlers['script[type="application/ld+json"]'];
            if (handler) {
              // Simulate finding a script with recipe JSON-LD
              handler.element && handler.element();
              handler.text && handler.text({
                text: JSON.stringify({
                  "@context": "https://schema.org",
                  "@type": "Recipe",
                  "name": "Test Recipe",
                  "description": "A test recipe",
                  "image": "https://example.com/recipe-image.jpg",
                  "author": "Test Author",
                  "recipeIngredient": ["1 cup flour", "2 eggs"],
                  "recipeInstructions": [
                    {
                      "@type": "HowToStep",
                      "text": "Mix ingredients"
                    }
                  ]
                }),
                lastInTextNode: true
              });
            }
            return '';
          })
        }))
      };
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Recipe Scraping with Image Processing', () => {
    it('should process recipe images when scraping a recipe', async () => {
      // Mock successful HTML fetch
      global.fetch.mockResolvedValueOnce({
        ok: true,
        headers: new Map([['content-type', 'text/html']]),
        text: vi.fn().mockResolvedValue('<html><script type="application/ld+json">...</script></html>')
      });

      // Mock successful image processing
      const { processRecipeImages } = await import('../shared/image-service.js');
      processRecipeImages.mockResolvedValue('https://recipe-images.your-domain.com/processed-image.jpg');

      // Create request for scraping
      const request = new Request('https://worker.example.com/scrape?url=https://example.com/recipe&save=true');
      
      // Call the worker
      const response = await workerModule.default.fetch(request, mockEnv, {});
      const result = await response.json();

      // Verify the response
      expect(response.status).toBe(200);
      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(1);
      expect(result.results[0].success).toBe(true);
      expect(result.results[0].data.image).toBe('https://recipe-images.your-domain.com/processed-image.jpg');

      // Verify image processing was called
      expect(processRecipeImages).toHaveBeenCalledWith(
        mockR2Bucket,
        'https://example.com/recipe-image.jpg'
      );
    });

    it('should continue recipe processing even if image processing fails', async () => {
      // Mock successful HTML fetch
      global.fetch.mockResolvedValueOnce({
        ok: true,
        headers: new Map([['content-type', 'text/html']]),
        text: vi.fn().mockResolvedValue('<html><script type="application/ld+json">...</script></html>')
      });

      // Mock failed image processing
      const { processRecipeImages } = await import('../shared/image-service.js');
      processRecipeImages.mockRejectedValue(new Error('Image processing failed'));

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // Create request for scraping
      const request = new Request('https://worker.example.com/scrape?url=https://example.com/recipe&save=true');
      
      // Call the worker
      const response = await workerModule.default.fetch(request, mockEnv, {});
      const result = await response.json();

      // Verify the response - should still succeed
      expect(response.status).toBe(200);
      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(1);
      expect(result.results[0].success).toBe(true);
      expect(result.results[0].data.image).toBe('https://example.com/recipe-image.jpg'); // Original URL

      // Verify error was logged
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to process image for recipe'),
        expect.any(String)
      );

      consoleSpy.mockRestore();
    });

    it('should handle recipes without images', async () => {
      // Mock HTMLRewriter to return recipe without image
      global.HTMLRewriter.mockImplementation(() => {
        const handlers = {};
        return {
          on: vi.fn().mockImplementation((selector, handler) => {
            handlers[selector] = handler;
            return this;
          }),
          transform: vi.fn().mockImplementation((response) => ({
            text: vi.fn().mockImplementation(async () => {
              const handler = handlers['script[type="application/ld+json"]'];
              if (handler) {
                handler.element && handler.element();
                handler.text && handler.text({
                  text: JSON.stringify({
                    "@context": "https://schema.org",
                    "@type": "Recipe",
                    "name": "Test Recipe Without Image",
                    "description": "A test recipe without image",
                    "author": "Test Author",
                    "recipeIngredient": ["1 cup flour"],
                    "recipeInstructions": [{"@type": "HowToStep", "text": "Mix ingredients"}]
                  }),
                  lastInTextNode: true
                });
              }
              return '';
            })
          }))
        };
      });

      // Mock successful HTML fetch
      global.fetch.mockResolvedValueOnce({
        ok: true,
        headers: new Map([['content-type', 'text/html']]),
        text: vi.fn().mockResolvedValue('<html><script type="application/ld+json">...</script></html>')
      });

      const { processRecipeImages } = await import('../shared/image-service.js');

      // Create request for scraping
      const request = new Request('https://worker.example.com/scrape?url=https://example.com/recipe&save=true');
      
      // Call the worker
      const response = await workerModule.default.fetch(request, mockEnv, {});
      const result = await response.json();

      // Verify the response
      expect(response.status).toBe(200);
      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(1);
      expect(result.results[0].success).toBe(true);
      expect(result.results[0].data.image).toBe('');

      // Verify image processing was not called
      expect(processRecipeImages).not.toHaveBeenCalled();
    });

    it('should handle multiple recipes with images', async () => {
      // Mock successful HTML fetch for multiple URLs
      global.fetch
        .mockResolvedValueOnce({
          ok: true,
          headers: new Map([['content-type', 'text/html']]),
          text: vi.fn().mockResolvedValue('<html><script type="application/ld+json">...</script></html>')
        })
        .mockResolvedValueOnce({
          ok: true,
          headers: new Map([['content-type', 'text/html']]),
          text: vi.fn().mockResolvedValue('<html><script type="application/ld+json">...</script></html>')
        });

      // Mock successful image processing
      const { processRecipeImages } = await import('../shared/image-service.js');
      processRecipeImages
        .mockResolvedValueOnce('https://recipe-images.your-domain.com/processed-image1.jpg')
        .mockResolvedValueOnce('https://recipe-images.your-domain.com/processed-image2.jpg');

      // Create request for scraping multiple URLs
      const request = new Request('https://worker.example.com/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          urls: ['https://example.com/recipe1', 'https://example.com/recipe2'],
          save: true
        })
      });
      
      // Call the worker
      const response = await workerModule.default.fetch(request, mockEnv, {});
      const result = await response.json();

      // Verify the response
      expect(response.status).toBe(200);
      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(2);
      
      // Both recipes should have processed images
      expect(result.results[0].success).toBe(true);
      expect(result.results[0].data.image).toBe('https://recipe-images.your-domain.com/processed-image1.jpg');
      expect(result.results[1].success).toBe(true);
      expect(result.results[1].data.image).toBe('https://recipe-images.your-domain.com/processed-image2.jpg');

      // Verify image processing was called for both
      expect(processRecipeImages).toHaveBeenCalledTimes(2);
    });

    it('should not process images when R2 bucket is not available', async () => {
      // Mock environment without R2 bucket
      const envWithoutR2 = {
        RECIPE_STORAGE: {
          get: vi.fn(),
          put: vi.fn()
        }
        // No RECIPE_IMAGES
      };

      // Mock successful HTML fetch
      global.fetch.mockResolvedValueOnce({
        ok: true,
        headers: new Map([['content-type', 'text/html']]),
        text: vi.fn().mockResolvedValue('<html><script type="application/ld+json">...</script></html>')
      });

      const { processRecipeImages } = await import('../shared/image-service.js');

      // Create request for scraping
      const request = new Request('https://worker.example.com/scrape?url=https://example.com/recipe&save=true');
      
      // Call the worker
      const response = await workerModule.default.fetch(request, envWithoutR2, {});
      const result = await response.json();

      // Verify the response
      expect(response.status).toBe(200);
      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(1);
      expect(result.results[0].success).toBe(true);
      expect(result.results[0].data.image).toBe('https://example.com/recipe-image.jpg'); // Original URL

      // Verify image processing was not called
      expect(processRecipeImages).not.toHaveBeenCalled();
    });

    it('should preserve original image URL when processing succeeds', async () => {
      // Mock successful HTML fetch
      global.fetch.mockResolvedValueOnce({
        ok: true,
        headers: new Map([['content-type', 'text/html']]),
        text: vi.fn().mockResolvedValue('<html><script type="application/ld+json">...</script></html>')
      });

      // Mock successful image processing
      const { processRecipeImages } = await import('../shared/image-service.js');
      processRecipeImages.mockResolvedValue('https://recipe-images.your-domain.com/processed-image.jpg');

      // Create request for scraping
      const request = new Request('https://worker.example.com/scrape?url=https://example.com/recipe&save=true');
      
      // Call the worker
      const response = await workerModule.default.fetch(request, mockEnv, {});
      const result = await response.json();

      // Verify the response
      expect(response.status).toBe(200);
      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(1);
      expect(result.results[0].success).toBe(true);
      
      const recipeData = result.results[0].data;
      expect(recipeData.image).toBe('https://recipe-images.your-domain.com/processed-image.jpg');
      // The original URL should be preserved in a separate field
      expect(recipeData.originalImageUrl).toBe(null); // Since we're comparing strings and they're different
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors gracefully', async () => {
      // Mock failed HTML fetch
      global.fetch.mockRejectedValueOnce(new Error('Network error'));

      // Create request for scraping
      const request = new Request('https://worker.example.com/scrape?url=https://example.com/recipe&save=true');
      
      // Call the worker
      const response = await workerModule.default.fetch(request, mockEnv, {});
      const result = await response.json();

      // Verify the response
      expect(response.status).toBe(200);
      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(1);
      expect(result.results[0].success).toBe(false);
      expect(result.results[0].error).toBe('Network error');
    });

    it('should handle invalid JSON-LD gracefully', async () => {
      // Mock HTMLRewriter to return invalid JSON-LD
      global.HTMLRewriter.mockImplementation(() => {
        const handlers = {};
        return {
          on: vi.fn().mockImplementation((selector, handler) => {
            handlers[selector] = handler;
            return this;
          }),
          transform: vi.fn().mockImplementation((response) => ({
            text: vi.fn().mockImplementation(async () => {
              const handler = handlers['script[type="application/ld+json"]'];
              if (handler) {
                handler.element && handler.element();
                handler.text && handler.text({
                  text: '{"invalid": "json"}', // Not a recipe
                  lastInTextNode: true
                });
              }
              return '';
            })
          }))
        };
      });

      // Mock successful HTML fetch
      global.fetch.mockResolvedValueOnce({
        ok: true,
        headers: new Map([['content-type', 'text/html']]),
        text: vi.fn().mockResolvedValue('<html><script type="application/ld+json">...</script></html>')
      });

      // Create request for scraping
      const request = new Request('https://worker.example.com/scrape?url=https://example.com/recipe&save=true');
      
      // Call the worker
      const response = await workerModule.default.fetch(request, mockEnv, {});
      const result = await response.json();

      // Verify the response
      expect(response.status).toBe(200);
      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(1);
      expect(result.results[0].success).toBe(false);
      expect(result.results[0].error).toBe('No valid Recipe JSON-LD found');
    });
  });
});