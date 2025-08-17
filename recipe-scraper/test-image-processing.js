/**
 * Focused Tests for Recipe Image Processing
 * Tests the image processing functionality in isolation
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock the shared modules
vi.mock('../shared/kv-storage.js', () => ({
  generateRecipeId: vi.fn().mockResolvedValue('test-recipe-id'),
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

// Mock global fetch
global.fetch = vi.fn();

describe('Recipe Image Processing', () => {
  let mockR2Bucket;
  let processRecipeImages;

  beforeEach(async () => {
    vi.clearAllMocks();

    mockR2Bucket = {
      put: vi.fn().mockResolvedValue(undefined)
    };

    // Get the mocked function
    const imageService = await import('../shared/image-service.js');
    processRecipeImages = imageService.processRecipeImages;

    // Mock successful HTML fetch
    global.fetch.mockResolvedValue({
      ok: true,
      headers: new Map([['content-type', 'text/html']]),
      text: vi.fn().mockResolvedValue('<html></html>')
    });

    // Mock HTMLRewriter with a working implementation
    global.HTMLRewriter = vi.fn().mockImplementation(() => {
      let extractorInstance = null;
      
      return {
        on: vi.fn().mockImplementation((selector, extractor) => {
          if (selector === 'script[type="application/ld+json"]') {
            extractorInstance = extractor;
            // Simulate the extractor finding JSON-LD data
            extractor.jsonLdScripts = [{
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
            }];
          }
          return this;
        }),
        transform: vi.fn().mockImplementation(() => {
          return {
            text: vi.fn().mockResolvedValue('')
          };
        })
      };
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should process recipe images when R2 bucket is available', async () => {
    // Mock successful image processing
    processRecipeImages.mockResolvedValue('https://recipe-images.your-domain.com/processed-image.jpg');

    // Import and call processRecipeUrl directly
    const { processRecipeUrl } = await import('./worker.js');
    const result = await processRecipeUrl(
      'https://example.com/recipe', 
      mockR2Bucket, 
      'https://recipe-images.your-domain.com'
    );

    // Debug: Log the result
    console.log('Result:', JSON.stringify(result, null, 2));

    // Verify the result
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data.name).toBe('Test Recipe');
    
    // Verify image processing was called
    expect(processRecipeImages).toHaveBeenCalledWith(
      mockR2Bucket,
      'https://example.com/recipe-image.jpg',
      'https://recipe-images.your-domain.com'
    );
    
    // Verify the image URL was replaced
    expect(result.data.image).toBe('https://recipe-images.your-domain.com/processed-image.jpg');
    expect(result.data.originalImageUrl).toBe('https://example.com/recipe-image.jpg');
  });

  it('should not process images when R2 bucket is not available', async () => {
    // Import and call processRecipeUrl without R2 bucket
    const { processRecipeUrl } = await import('./worker.js');
    const result = await processRecipeUrl('https://example.com/recipe');

    // Verify the result
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data.name).toBe('Test Recipe');
    
    // Verify image processing was not called
    expect(processRecipeImages).not.toHaveBeenCalled();
    
    // Verify the original image URL is preserved
    expect(result.data.image).toBe('https://example.com/recipe-image.jpg');
    expect(result.data.originalImageUrl).toBeUndefined();
  });

  it('should handle image processing failures gracefully', async () => {
    // Mock failed image processing
    processRecipeImages.mockRejectedValue(new Error('Image processing failed'));
    
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Import and call processRecipeUrl
    const { processRecipeUrl } = await import('./worker.js');
    const result = await processRecipeUrl(
      'https://example.com/recipe', 
      mockR2Bucket, 
      'https://recipe-images.your-domain.com'
    );

    // Verify the result - should still succeed
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data.name).toBe('Test Recipe');
    
    // Verify error was logged
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to process image for recipe'),
      expect.any(String)
    );
    
    // Verify the original image URL is preserved
    expect(result.data.image).toBe('https://example.com/recipe-image.jpg');

    consoleSpy.mockRestore();
  });

  it('should handle recipes without images', async () => {
    // Mock HTMLRewriter to return recipe without image
    global.HTMLRewriter.mockImplementation(() => {
      return {
        on: vi.fn().mockImplementation((selector, extractor) => {
          if (selector === 'script[type="application/ld+json"]') {
            // Simulate the extractor finding JSON-LD data without image
            extractor.jsonLdScripts = [{
              "@context": "https://schema.org",
              "@type": "Recipe",
              "name": "Test Recipe Without Image",
              "description": "A test recipe without image",
              "author": "Test Author",
              "recipeIngredient": ["1 cup flour"],
              "recipeInstructions": [{"@type": "HowToStep", "text": "Mix ingredients"}]
            }];
          }
          return this;
        }),
        transform: vi.fn().mockImplementation(() => {
          return {
            text: vi.fn().mockResolvedValue('')
          };
        })
      };
    });

    // Import and call processRecipeUrl
    const { processRecipeUrl } = await import('./worker.js');
    const result = await processRecipeUrl(
      'https://example.com/recipe', 
      mockR2Bucket, 
      'https://recipe-images.your-domain.com'
    );

    // Verify the result
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data.name).toBe('Test Recipe Without Image');
    
    // Verify image processing was not called
    expect(processRecipeImages).not.toHaveBeenCalled();
    
    // Verify no image URL
    expect(result.data.image).toBe('');
    expect(result.data.originalImageUrl).toBeUndefined();
  });

  it('should preserve original image URL when processing returns the same URL', async () => {
    // Mock image processing to return the same URL (processing failed/skipped)
    processRecipeImages.mockResolvedValue('https://example.com/recipe-image.jpg');

    // Import and call processRecipeUrl
    const { processRecipeUrl } = await import('./worker.js');
    const result = await processRecipeUrl(
      'https://example.com/recipe', 
      mockR2Bucket, 
      'https://recipe-images.your-domain.com'
    );

    // Verify the result
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    
    // Verify image processing was called
    expect(processRecipeImages).toHaveBeenCalled();
    
    // Verify the image URL remains the same and no originalImageUrl is set
    expect(result.data.image).toBe('https://example.com/recipe-image.jpg');
    expect(result.data.originalImageUrl).toBeUndefined();
  });
});