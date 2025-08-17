/**
 * Unit Tests for Image Service
 * Tests image downloading, uploading to R2, and processing functionality
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  downloadImage,
  uploadImageToR2,
  saveRecipeImageToR2,
  processRecipeImages,
  generateImageFilename,
  getImageExtension
} from './image-service.js';

// Mock Web Crypto API
const mockArrayBuffer = new ArrayBuffer(32);
const mockUint8Array = new Uint8Array(mockArrayBuffer);
mockUint8Array.fill(171); // 171 = 0xAB in hex

Object.defineProperty(global, 'crypto', {
  value: {
    subtle: {
      digest: vi.fn().mockResolvedValue(mockArrayBuffer)
    }
  },
  writable: true
});

// Mock TextEncoder
Object.defineProperty(global, 'TextEncoder', {
  value: function() {
    return {
      encode: vi.fn().mockReturnValue(new Uint8Array([1, 2, 3, 4]))
    };
  },
  writable: true
});

// Mock global fetch
global.fetch = vi.fn();

describe('Image Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock Date.now for consistent testing
    vi.spyOn(Date, 'now').mockReturnValue(1234567890000);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('generateImageFilename', () => {
    beforeEach(() => {
      // Mock crypto.subtle.digest to return a predictable ArrayBuffer
      const mockArrayBuffer = new ArrayBuffer(32);
      const mockUint8Array = new Uint8Array(mockArrayBuffer);
      // Fill with predictable values that will create 'abababababababab' hex
      mockUint8Array.fill(171); // 171 = 0xAB in hex
      global.crypto.subtle.digest.mockResolvedValue(mockArrayBuffer);
    });

    it('should generate a unique filename with timestamp and hash', async () => {
      const url = 'https://example.com/image.jpg';
      const extension = 'jpg';
      
      const filename = await generateImageFilename(url, extension);
      
      expect(filename).toBe('recipe-images/1234567890000-abababababababab.jpg');
    });

    it('should default to jpg extension', async () => {
      const url = 'https://example.com/image';
      
      const filename = await generateImageFilename(url);
      
      expect(filename).toBe('recipe-images/1234567890000-abababababababab.jpg');
    });
  });

  describe('getImageExtension', () => {
    it('should extract extension from content type', () => {
      expect(getImageExtension('', 'image/jpeg')).toBe('jpg');
      expect(getImageExtension('', 'image/jpg')).toBe('jpg');
      expect(getImageExtension('', 'image/png')).toBe('png');
      expect(getImageExtension('', 'image/gif')).toBe('gif');
      expect(getImageExtension('', 'image/webp')).toBe('webp');
    });

    it('should extract extension from URL when content type is not available', () => {
      expect(getImageExtension('https://example.com/image.jpg')).toBe('jpg');
      expect(getImageExtension('https://example.com/image.jpeg')).toBe('jpg');
      expect(getImageExtension('https://example.com/image.png')).toBe('png');
      expect(getImageExtension('https://example.com/image.gif')).toBe('gif');
      expect(getImageExtension('https://example.com/image.webp')).toBe('webp');
    });

    it('should handle URLs with query parameters', () => {
      expect(getImageExtension('https://example.com/image.jpg?size=large')).toBe('jpg');
    });

    it('should default to jpg for unknown extensions', () => {
      expect(getImageExtension('https://example.com/image.xyz')).toBe('jpg');
      expect(getImageExtension('https://example.com/image')).toBe('jpg');
    });
  });

  describe('downloadImage', () => {
    it('should successfully download an image', async () => {
      const mockArrayBuffer = new ArrayBuffer(1024);
      const mockResponse = {
        ok: true,
        headers: {
          get: vi.fn().mockReturnValue('image/jpeg')
        },
        arrayBuffer: vi.fn().mockResolvedValue(mockArrayBuffer)
      };

      global.fetch.mockResolvedValue(mockResponse);

      const result = await downloadImage('https://example.com/image.jpg');

      expect(result).toEqual({
        buffer: mockArrayBuffer,
        contentType: 'image/jpeg',
        extension: 'jpg'
      });

      expect(global.fetch).toHaveBeenCalledWith('https://example.com/image.jpg', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; RecipeIndexBot/1.0)',
          'Accept': 'image/*,*/*;q=0.8',
        },
        signal: expect.any(AbortSignal),
      });
    });

    it('should throw error for invalid URL', async () => {
      await expect(downloadImage('')).rejects.toThrow('Invalid image URL provided');
      await expect(downloadImage(null)).rejects.toThrow('Invalid image URL provided');
    });

    it('should throw error for non-OK response', async () => {
      const mockResponse = {
        ok: false,
        status: 404,
        statusText: 'Not Found'
      };

      global.fetch.mockResolvedValue(mockResponse);

      await expect(downloadImage('https://example.com/image.jpg'))
        .rejects.toThrow('Failed to download image: 404 Not Found');
    });

    it('should throw error for non-image content type', async () => {
      const mockResponse = {
        ok: true,
        headers: {
          get: vi.fn().mockReturnValue('text/html')
        }
      };

      global.fetch.mockResolvedValue(mockResponse);

      await expect(downloadImage('https://example.com/image.jpg'))
        .rejects.toThrow('URL does not point to an image. Content-Type: text/html');
    });

    it('should throw error for file too large', async () => {
      const largeArrayBuffer = new ArrayBuffer(11 * 1024 * 1024); // 11MB
      const mockResponse = {
        ok: true,
        headers: {
          get: vi.fn().mockReturnValue('image/jpeg')
        },
        arrayBuffer: vi.fn().mockResolvedValue(largeArrayBuffer)
      };

      global.fetch.mockResolvedValue(mockResponse);

      await expect(downloadImage('https://example.com/image.jpg'))
        .rejects.toThrow('Image file too large (max 10MB)');
    });

    it('should handle fetch timeout', async () => {
      global.fetch.mockRejectedValue(Object.assign(new Error('Timeout'), { name: 'TimeoutError' }));

      await expect(downloadImage('https://example.com/image.jpg'))
        .rejects.toThrow('Image download timeout');
    });
  });

  describe('uploadImageToR2', () => {
    it('should successfully upload image to R2', async () => {
      const mockR2Bucket = {
        put: vi.fn().mockResolvedValue(undefined)
      };
      const mockBuffer = new ArrayBuffer(1024);
      const filename = 'test-image.jpg';
      const contentType = 'image/jpeg';

      const result = await uploadImageToR2(mockR2Bucket, mockBuffer, filename, contentType);

      expect(mockR2Bucket.put).toHaveBeenCalledWith(filename, mockBuffer, {
        httpMetadata: {
          contentType: contentType,
          cacheControl: 'public, max-age=31536000',
        },
      });

      expect(result).toBe(`https://images.nolanfoster.me/${filename}`);
    });

    it('should throw error if R2 upload fails', async () => {
      const mockR2Bucket = {
        put: vi.fn().mockRejectedValue(new Error('R2 upload failed'))
      };
      const mockBuffer = new ArrayBuffer(1024);

      await expect(uploadImageToR2(mockR2Bucket, mockBuffer, 'test.jpg', 'image/jpeg'))
        .rejects.toThrow('Failed to upload image to R2: R2 upload failed');
    });
  });

  describe('saveRecipeImageToR2', () => {
    it('should successfully save recipe image to R2', async () => {
      const mockArrayBuffer = new ArrayBuffer(1024);
      const mockResponse = {
        ok: true,
        headers: {
          get: vi.fn().mockReturnValue('image/jpeg')
        },
        arrayBuffer: vi.fn().mockResolvedValue(mockArrayBuffer)
      };

      const mockR2Bucket = {
        put: vi.fn().mockResolvedValue(undefined)
      };

      global.fetch.mockResolvedValue(mockResponse);

      const result = await saveRecipeImageToR2(mockR2Bucket, 'https://example.com/image.jpg', 'https://images.nolanfoster.me');

      expect(result).toBe('https://images.nolanfoster.me/recipe-images/1234567890000-abababababababab.jpg');
      expect(mockR2Bucket.put).toHaveBeenCalled();
    });

    it('should return null for invalid inputs', async () => {
      const mockR2Bucket = {};

      expect(await saveRecipeImageToR2(null, 'https://example.com/image.jpg', 'https://images.nolanfoster.me')).toBeNull();
      expect(await saveRecipeImageToR2(mockR2Bucket, '', 'https://images.nolanfoster.me')).toBeNull();
      expect(await saveRecipeImageToR2(mockR2Bucket, null, 'https://images.nolanfoster.me')).toBeNull();
    });

    it('should return null and log error if processing fails', async () => {
      const mockR2Bucket = {};
      global.fetch.mockRejectedValue(new Error('Network error'));

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await saveRecipeImageToR2(mockR2Bucket, 'https://example.com/image.jpg', 'https://images.nolanfoster.me');

      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to save image'),
        expect.any(String)
      );

      consoleSpy.mockRestore();
    });
  });

  describe('processRecipeImages', () => {
    let mockR2Bucket;

    beforeEach(() => {
      mockR2Bucket = {
        put: vi.fn().mockResolvedValue(undefined)
      };

      const mockArrayBuffer = new ArrayBuffer(1024);
      const mockResponse = {
        ok: true,
        headers: {
          get: vi.fn().mockReturnValue('image/jpeg')
        },
        arrayBuffer: vi.fn().mockResolvedValue(mockArrayBuffer)
      };

      global.fetch.mockResolvedValue(mockResponse);
    });

    it('should return null for null input', async () => {
      const result = await processRecipeImages(mockR2Bucket, null);
      expect(result).toBeNull();
    });

    it('should process single image URL', async () => {
      const imageUrl = 'https://example.com/image.jpg';
      const result = await processRecipeImages(mockR2Bucket, imageUrl, 'https://images.nolanfoster.me');

      expect(result).toBe('https://images.nolanfoster.me/recipe-images/1234567890000-abababababababab.jpg');
    });

    it('should return original URL if processing fails for single image', async () => {
      global.fetch.mockRejectedValue(new Error('Network error'));
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const imageUrl = 'https://example.com/image.jpg';
      const result = await processRecipeImages(mockR2Bucket, imageUrl, 'https://images.nolanfoster.me');

      expect(result).toBe(imageUrl);
      consoleSpy.mockRestore();
    });

    it('should process array of image URLs', async () => {
      const imageUrls = [
        'https://example.com/image1.jpg',
        'https://example.com/image2.jpg'
      ];

      const result = await processRecipeImages(mockR2Bucket, imageUrls, 'https://images.nolanfoster.me');

      expect(result).toEqual([
        'https://images.nolanfoster.me/recipe-images/1234567890000-abababababababab.jpg',
        'https://images.nolanfoster.me/recipe-images/1234567890000-abababababababab.jpg'
      ]);
    });

    it('should handle mixed success/failure for array of images', async () => {
      const imageUrls = [
        'https://example.com/image1.jpg',
        'https://example.com/image2.jpg'
      ];

      // First call succeeds, second fails
      global.fetch
        .mockResolvedValueOnce({
          ok: true,
          headers: { get: vi.fn().mockReturnValue('image/jpeg') },
          arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(1024))
        })
        .mockRejectedValueOnce(new Error('Network error'));

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await processRecipeImages(mockR2Bucket, imageUrls, 'https://images.nolanfoster.me');

      expect(result).toEqual([
        'https://images.nolanfoster.me/recipe-images/1234567890000-abababababababab.jpg',
        'https://example.com/image2.jpg' // Original URL returned on failure
      ]);

      consoleSpy.mockRestore();
    });
  });
});

// Integration tests
describe('Image Service Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Date, 'now').mockReturnValue(1234567890000);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should handle complete recipe image processing workflow', async () => {
    const mockArrayBuffer = new ArrayBuffer(1024);
    const mockResponse = {
      ok: true,
      headers: {
        get: vi.fn().mockReturnValue('image/jpeg')
      },
      arrayBuffer: vi.fn().mockResolvedValue(mockArrayBuffer)
    };

    const mockR2Bucket = {
      put: vi.fn().mockResolvedValue(undefined)
    };

    global.fetch.mockResolvedValue(mockResponse);

    const originalImageUrl = 'https://example.com/recipe-image.jpg';
    const result = await saveRecipeImageToR2(mockR2Bucket, originalImageUrl, 'https://images.nolanfoster.me');

    // Verify the complete workflow
    expect(global.fetch).toHaveBeenCalledWith(originalImageUrl, expect.any(Object));
    expect(mockR2Bucket.put).toHaveBeenCalledWith(
      'recipe-images/1234567890000-abababababababab.jpg',
      mockArrayBuffer,
      {
        httpMetadata: {
          contentType: 'image/jpeg',
          cacheControl: 'public, max-age=31536000',
        },
      }
    );
    expect(result).toBe('https://images.nolanfoster.me/recipe-images/1234567890000-abababababababab.jpg');
  });

  it('should gracefully handle network errors without breaking recipe processing', async () => {
    const mockR2Bucket = {
      put: vi.fn().mockResolvedValue(undefined)
    };

    global.fetch.mockRejectedValue(new Error('Network timeout'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await saveRecipeImageToR2(mockR2Bucket, 'https://example.com/image.jpg');

    expect(result).toBeNull();
    expect(consoleSpy).toHaveBeenCalled();
    
    consoleSpy.mockRestore();
  });
});