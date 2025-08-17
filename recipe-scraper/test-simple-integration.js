/**
 * Simple Integration Test for Recipe Scraper
 * Debug test to understand the worker response format
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
  processRecipeImages: vi.fn().mockResolvedValue('https://recipe-images.your-domain.com/processed-image.jpg')
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
global.HTMLRewriter = vi.fn();

// Import the worker after mocking
const workerModule = await import('./worker.js');

describe('Simple Recipe Scraper Integration', () => {
  let mockEnv;

  beforeEach(() => {
    vi.clearAllMocks();

    mockEnv = {
      RECIPE_STORAGE: {
        get: vi.fn(),
        put: vi.fn()
      },
      RECIPE_IMAGES: {
        put: vi.fn().mockResolvedValue(undefined)
      },
      IMAGE_DOMAIN: 'https://recipe-images.your-domain.com'
    };

    // Mock successful HTML fetch
    global.fetch.mockResolvedValue({
      ok: true,
      headers: new Map([['content-type', 'text/html']]),
      text: vi.fn().mockResolvedValue('<html><script type="application/ld+json">...</script></html>')
    });

    // Mock HTMLRewriter to return recipe with image
    global.HTMLRewriter.mockImplementation(() => {
      const extractor = {
        jsonLdScripts: [],
        element() {},
        text(text) {
          if (text.lastInTextNode) {
            try {
              const parsed = JSON.parse(text.text);
              this.jsonLdScripts.push(parsed);
            } catch (e) {
              // Ignore parse errors
            }
          }
        }
      };
      
      return {
        on: vi.fn().mockImplementation((selector, handler) => {
          if (selector === 'script[type="application/ld+json"]') {
            // Simulate finding JSON-LD with recipe data
            setTimeout(() => {
              handler.text({
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
            }, 0);
          }
          return this;
        }),
        transform: vi.fn().mockImplementation((response) => {
          // Add the extractor to the transform result so it can be accessed
          const result = {
            text: vi.fn().mockResolvedValue('')
          };
          // Make the extractor accessible
          Object.assign(result, { extractor });
          return result;
        })
      };
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should debug worker response format', async () => {
    // Create request for scraping
    const request = new Request('https://worker.example.com/scrape?url=https://example.com/recipe&save=true');
    
    // Call the worker
    const response = await workerModule.default.fetch(request, mockEnv, {});
    
    console.log('Response status:', response.status);
    console.log('Response headers:', [...response.headers.entries()]);
    
    const responseText = await response.text();
    console.log('Response text:', responseText);
    
    let result;
    try {
      result = JSON.parse(responseText);
      console.log('Parsed result:', JSON.stringify(result, null, 2));
    } catch (error) {
      console.log('Failed to parse JSON:', error.message);
      console.log('Raw response:', responseText);
    }
    
    // Basic assertions
    expect(response.status).toBe(200);
    if (result) {
      console.log('Result keys:', Object.keys(result));
    }
  });
});