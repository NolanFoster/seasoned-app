// Image Processing Tests for Recipe Save Worker

import { RecipeSaver } from '../src/index.js';

// Test utilities
const describe = (name, fn) => {
  console.log(`\n${name}`);
  fn();
};

const it = (name, fn) => {
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (error) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${error.message}`);
    process.exit(1);
  }
};

const expect = (actual) => ({
  toBe: (expected) => {
    if (actual !== expected) {
      throw new Error(`Expected ${expected} but got ${actual}`);
    }
  },
  toEqual: (expected) => {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(`Expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`);
    }
  },
  toBeDefined: () => {
    if (actual === undefined) {
      throw new Error(`Expected value to be defined but got undefined`);
    }
  },
  toContain: (expected) => {
    if (!actual.includes(expected)) {
      throw new Error(`Expected "${actual}" to contain "${expected}"`);
    }
  },
  toBeTruthy: () => {
    if (!actual) {
      throw new Error(`Expected value to be truthy but got ${actual}`);
    }
  },
  toBeFalsy: () => {
    if (actual) {
      throw new Error(`Expected value to be falsy but got ${actual}`);
    }
  }
});

// Mock fetch for image downloads
const mockFetch = (response) => {
  global.fetch = async (url) => {
    if (response[url]) {
      return response[url];
    }
    return {
      ok: true,
      status: 200,
      headers: {
        get: (name) => {
          if (name === 'content-type') return 'image/jpeg';
          return null;
        }
      },
      arrayBuffer: async () => new ArrayBuffer(1024)
    };
  };
};

// Mock R2 bucket
const createMockR2Bucket = () => {
  const storage = new Map();
  return {
    put: async (key, data, options) => {
      storage.set(key, { data, options });
      return { key, size: data.byteLength };
    },
    get: async (key) => {
      return storage.get(key);
    },
    delete: async (key) => {
      return storage.delete(key);
    },
    list: async () => {
      return {
        objects: Array.from(storage.keys()).map(key => ({ key }))
      };
    },
    _storage: storage
  };
};

// Mock environment
const createMockEnv = () => ({
  RECIPE_STORAGE: {
    put: async () => {},
    get: async () => null,
    delete: async () => {}
  },
  RECIPE_IMAGES: createMockR2Bucket(),
  IMAGE_DOMAIN: 'https://images.test.com',
  SEARCH_DB_URL: 'https://search.test.com'
});

// Mock state
const createMockState = () => ({
  storage: {
    put: async () => {},
    get: async () => null
  },
  blockConcurrencyWhile: async (fn) => await fn()
});

describe('Image Processing', () => {
  describe('URL Detection', () => {
    it('should identify external URLs correctly', async () => {
      const env = createMockEnv();
      const state = createMockState();
      const do = new RecipeSaver(state, env);

      expect(do.isExternalUrl('https://example.com/image.jpg')).toBeTruthy();
      expect(do.isExternalUrl('http://example.com/image.jpg')).toBeTruthy();
      expect(do.isExternalUrl('https://images.test.com/image.jpg')).toBeFalsy();
      expect(do.isExternalUrl('/relative/path.jpg')).toBeFalsy();
      expect(do.isExternalUrl(null)).toBeFalsy();
      expect(do.isExternalUrl('')).toBeFalsy();
    });

    it('should extract R2 key from URL correctly', async () => {
      const env = createMockEnv();
      const state = createMockState();
      const do = new RecipeSaver(state, env);

      const url = 'https://images.test.com/recipe123/imageUrl_1234567890.jpg';
      expect(do.getR2KeyFromUrl(url)).toBe('recipe123/imageUrl_1234567890.jpg');
      
      expect(do.getR2KeyFromUrl('https://external.com/image.jpg')).toBe(null);
    });
  });

  describe('Content Type Handling', () => {
    it('should map content types to extensions correctly', async () => {
      const env = createMockEnv();
      const state = createMockState();
      const do = new RecipeSaver(state, env);

      expect(do.getExtensionFromContentType('image/jpeg')).toBe('jpg');
      expect(do.getExtensionFromContentType('image/png')).toBe('png');
      expect(do.getExtensionFromContentType('image/gif')).toBe('gif');
      expect(do.getExtensionFromContentType('image/webp')).toBe('webp');
      expect(do.getExtensionFromContentType('unknown/type')).toBe('jpg');
    });
  });

  describe('Image Download and Storage', () => {
    it('should download and store image successfully', async () => {
      const env = createMockEnv();
      const state = createMockState();
      const do = new RecipeSaver(state, env);

      mockFetch({
        'https://example.com/image.jpg': {
          ok: true,
          status: 200,
          headers: {
            get: (name) => name === 'content-type' ? 'image/jpeg' : null
          },
          arrayBuffer: async () => new ArrayBuffer(2048)
        }
      });

      const r2Url = await do.downloadAndStoreImage(
        'https://example.com/image.jpg',
        'recipe123',
        'imageUrl'
      );

      expect(r2Url).toContain('https://images.test.com/recipe123/imageUrl_');
      expect(r2Url).toContain('.jpg');

      // Check R2 storage
      const storedKeys = Array.from(env.RECIPE_IMAGES._storage.keys());
      expect(storedKeys.length).toBe(1);
      expect(storedKeys[0]).toContain('recipe123/imageUrl_');
    });

    it('should handle image download failures gracefully', async () => {
      const env = createMockEnv();
      const state = createMockState();
      const do = new RecipeSaver(state, env);

      mockFetch({
        'https://example.com/broken.jpg': {
          ok: false,
          status: 404
        }
      });

      let error;
      try {
        await do.downloadAndStoreImage(
          'https://example.com/broken.jpg',
          'recipe123',
          'imageUrl'
        );
      } catch (e) {
        error = e;
      }

      expect(error).toBeDefined();
      expect(error.message).toContain('Failed to download image');
    });
  });

  describe('Recipe Image Processing', () => {
    it('should process single image URL in recipe', async () => {
      const env = createMockEnv();
      const state = createMockState();
      const do = new RecipeSaver(state, env);

      mockFetch({});

      const recipe = {
        title: 'Test Recipe',
        imageUrl: 'https://example.com/recipe.jpg'
      };

      const processed = await do.processRecipeImages(recipe, 'recipe123');

      expect(processed.imageUrl).toContain('https://images.test.com/');
      expect(processed._originalImageUrls).toEqual(['https://example.com/recipe.jpg']);
    });

    it('should process multiple images in recipe', async () => {
      const env = createMockEnv();
      const state = createMockState();
      const do = new RecipeSaver(state, env);

      mockFetch({});

      const recipe = {
        title: 'Test Recipe',
        imageUrl: 'https://example.com/main.jpg',
        images: [
          'https://example.com/step1.jpg',
          'https://example.com/step2.jpg'
        ]
      };

      const processed = await do.processRecipeImages(recipe, 'recipe123');

      expect(processed.imageUrl).toContain('https://images.test.com/');
      expect(processed.images[0]).toContain('https://images.test.com/');
      expect(processed.images[1]).toContain('https://images.test.com/');
      expect(processed._originalImageUrls.length).toBe(3);
    });

    it('should skip already processed R2 URLs', async () => {
      const env = createMockEnv();
      const state = createMockState();
      const do = new RecipeSaver(state, env);

      mockFetch({});

      const recipe = {
        title: 'Test Recipe',
        imageUrl: 'https://images.test.com/existing/image.jpg',
        images: ['https://example.com/new.jpg']
      };

      const processed = await do.processRecipeImages(recipe, 'recipe123');

      expect(processed.imageUrl).toBe('https://images.test.com/existing/image.jpg');
      expect(processed.images[0]).toContain('https://images.test.com/recipe123/');
      expect(processed._originalImageUrls.length).toBe(1);
    });

    it('should handle failed image downloads gracefully', async () => {
      const env = createMockEnv();
      const state = createMockState();
      const do = new RecipeSaver(state, env);

      mockFetch({
        'https://example.com/broken.jpg': {
          ok: false,
          status: 404
        }
      });

      const recipe = {
        title: 'Test Recipe',
        imageUrl: 'https://example.com/broken.jpg'
      };

      const processed = await do.processRecipeImages(recipe, 'recipe123');

      // Should keep original URL if download fails
      expect(processed.imageUrl).toBe('https://example.com/broken.jpg');
    });
  });

  describe('Image Deletion', () => {
    it('should delete recipe images from R2', async () => {
      const env = createMockEnv();
      const state = createMockState();
      const do = new RecipeSaver(state, env);

      // Pre-populate R2 with images
      await env.RECIPE_IMAGES.put('recipe123/imageUrl_123.jpg', new ArrayBuffer(1024));
      await env.RECIPE_IMAGES.put('recipe123/images_0_456.jpg', new ArrayBuffer(1024));

      const recipe = {
        id: 'recipe123',
        imageUrl: 'https://images.test.com/recipe123/imageUrl_123.jpg',
        images: ['https://images.test.com/recipe123/images_0_456.jpg']
      };

      await do.deleteRecipeImages(recipe);

      const remainingKeys = Array.from(env.RECIPE_IMAGES._storage.keys());
      expect(remainingKeys.length).toBe(0);
    });

    it('should handle deletion errors gracefully', async () => {
      const env = createMockEnv();
      env.RECIPE_IMAGES.delete = async () => {
        throw new Error('Delete failed');
      };
      
      const state = createMockState();
      const do = new RecipeSaver(state, env);

      const recipe = {
        id: 'recipe123',
        imageUrl: 'https://images.test.com/recipe123/imageUrl_123.jpg'
      };

      // Should not throw even if delete fails
      await do.deleteRecipeImages(recipe);
    });
  });

  describe('Integration with Save/Update/Delete', () => {
    it('should process images during recipe save', async () => {
      const env = createMockEnv();
      const state = createMockState();
      const do = new RecipeSaver(state, env);

      mockFetch({});

      // Mock successful search DB sync
      global.fetch = async (url) => {
        if (url.includes('search.test.com')) {
          return { ok: true };
        }
        return {
          ok: true,
          status: 200,
          headers: {
            get: (name) => name === 'content-type' ? 'image/jpeg' : null
          },
          arrayBuffer: async () => new ArrayBuffer(1024)
        };
      };

      const request = new Request('https://worker/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipe: {
            url: 'https://example.com/recipe',
            title: 'Test Recipe',
            imageUrl: 'https://external.com/image.jpg'
          }
        })
      });

      const response = await do.fetch(request);
      const result = await response.json();

      expect(result.success).toBeTruthy();
      expect(result.recipe.imageUrl).toContain('https://images.test.com/');
    });
  });
});

console.log('\n✅ Image processing tests completed!');