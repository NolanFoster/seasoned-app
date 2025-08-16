/**
 * Comprehensive test suite for Recipe Scraper Worker
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { 
  decodeHtmlEntities, 
  normalizeIngredients, 
  normalizeInstructions, 
  isRecipeType, 
  validateRecipeSchema,
  extractRecipeData,
  JSONLDExtractor,
  processRecipeUrl
} from './worker.js';

// Mock the shared KV storage module
jest.mock('../shared/kv-storage.js');

// Unit tests for utility functions
describe('decodeHtmlEntities', () => {
  test('should decode common HTML entities', () => {
    expect(decodeHtmlEntities('Salt &amp; Pepper')).toBe('Salt & Pepper');
    expect(decodeHtmlEntities('&quot;Delicious&quot;')).toBe('"Delicious"');
    expect(decodeHtmlEntities('Caf&eacute; au lait')).toBe('Caf&eacute; au lait'); // Unknown entity preserved
    expect(decodeHtmlEntities('&lt;b&gt;Bold&lt;/b&gt;')).toBe('<b>Bold</b>');
  });

  test('should return non-string values unchanged', () => {
    expect(decodeHtmlEntities(null)).toBeNull();
    expect(decodeHtmlEntities(undefined)).toBeUndefined();
    expect(decodeHtmlEntities(123)).toBe(123);
    expect(decodeHtmlEntities({})).toEqual({});
  });

  test('should handle text without entities', () => {
    expect(decodeHtmlEntities('Plain text')).toBe('Plain text');
    expect(decodeHtmlEntities('')).toBe('');
  });

  test('should decode multiple entities in one string', () => {
    expect(decodeHtmlEntities('&amp;&amp; &lt;&gt; &quot;&#39;')).toBe('&& <> "\'');
  });
});

describe('normalizeIngredients', () => {
  test('should return empty array for falsy values', () => {
    expect(normalizeIngredients(null)).toEqual([]);
    expect(normalizeIngredients(undefined)).toEqual([]);
    expect(normalizeIngredients('')).toEqual([]);
  });

  test('should convert string to array', () => {
    expect(normalizeIngredients('1 cup flour')).toEqual(['1 cup flour']);
    expect(normalizeIngredients('Salt &amp; pepper')).toEqual(['Salt & pepper']);
  });

  test('should handle array of strings', () => {
    expect(normalizeIngredients(['1 cup flour', '2 eggs', 'Salt &amp; pepper']))
      .toEqual(['1 cup flour', '2 eggs', 'Salt & pepper']);
  });

  test('should handle array of objects with name property', () => {
    expect(normalizeIngredients([
      { name: '1 cup flour' },
      { name: 'Salt &amp; pepper' }
    ])).toEqual(['1 cup flour', 'Salt & pepper']);
  });

  test('should handle array of objects with text property', () => {
    expect(normalizeIngredients([
      { text: '1 cup flour' },
      { text: 'Salt &amp; pepper' }
    ])).toEqual(['1 cup flour', 'Salt & pepper']);
  });

  test('should filter out empty values', () => {
    expect(normalizeIngredients(['1 cup flour', '', null, undefined, '2 eggs']))
      .toEqual(['1 cup flour', '2 eggs']);
  });

  test('should convert non-string objects to strings', () => {
    expect(normalizeIngredients([123, true, { value: 'test' }]))
      .toEqual(['123', 'true', '[object Object]']);
  });
});

describe('normalizeInstructions', () => {
  test('should return empty array for falsy values', () => {
    expect(normalizeInstructions(null)).toEqual([]);
    expect(normalizeInstructions(undefined)).toEqual([]);
    expect(normalizeInstructions('')).toEqual([]);
  });

  test('should convert string to array', () => {
    expect(normalizeInstructions('Mix ingredients')).toEqual(['Mix ingredients']);
    expect(normalizeInstructions('Heat &amp; stir')).toEqual(['Heat & stir']);
  });

  test('should handle array of strings', () => {
    expect(normalizeInstructions(['Mix', 'Bake', 'Cool &amp; serve']))
      .toEqual(['Mix', 'Bake', 'Cool & serve']);
  });

  test('should handle HowToStep objects', () => {
    expect(normalizeInstructions([
      { '@type': 'HowToStep', text: 'Mix ingredients' },
      { '@type': 'HowToStep', text: 'Bake &amp; cool' }
    ])).toEqual(['Mix ingredients', 'Bake & cool']);
  });

  test('should handle HowToSection with itemListElement', () => {
    const section = {
      '@type': 'HowToSection',
      itemListElement: ['Mix', 'Bake', 'Cool']
    };
    expect(normalizeInstructions(section)).toEqual(['Mix', 'Bake', 'Cool']);
  });

  test('should handle mixed instruction formats', () => {
    expect(normalizeInstructions([
      'Simple string',
      { name: 'Named instruction' },
      { text: 'Text instruction' },
      { '@type': 'HowToStep', text: 'Step instruction' }
    ])).toEqual([
      'Simple string',
      'Named instruction',
      'Text instruction',
      'Step instruction'
    ]);
  });
});

describe('isRecipeType', () => {
  test('should return true for valid recipe types', () => {
    expect(isRecipeType('Recipe')).toBe(true);
    expect(isRecipeType('schema:Recipe')).toBe(true);
    expect(isRecipeType('https://schema.org/Recipe')).toBe(true);
    expect(isRecipeType('http://schema.org/Recipe')).toBe(true);
  });

  test('should return false for non-recipe types', () => {
    expect(isRecipeType('Article')).toBe(false);
    expect(isRecipeType('Product')).toBe(false);
    expect(isRecipeType('')).toBe(false);
  });

  test('should return false for non-string types', () => {
    expect(isRecipeType(null)).toBe(false);
    expect(isRecipeType(undefined)).toBe(false);
    expect(isRecipeType(123)).toBe(false);
    expect(isRecipeType({})).toBe(false);
    expect(isRecipeType([])).toBe(false);
  });
});

describe('validateRecipeSchema', () => {
  test('should return false for falsy values', () => {
    expect(validateRecipeSchema(null)).toBe(false);
    expect(validateRecipeSchema(undefined)).toBe(false);
    expect(validateRecipeSchema('')).toBe(false);
  });

  test('should validate simple recipe schema', () => {
    expect(validateRecipeSchema({
      '@context': 'https://schema.org',
      '@type': 'Recipe'
    })).toBe(true);

    expect(validateRecipeSchema({
      '@context': 'http://schema.org/',
      '@type': 'schema:Recipe'
    })).toBe(true);
  });

  test('should validate with object context', () => {
    expect(validateRecipeSchema({
      '@context': { '@vocab': 'https://schema.org/' },
      '@type': 'Recipe'
    })).toBe(true);
  });

  test('should validate with array of types', () => {
    expect(validateRecipeSchema({
      '@context': 'https://schema.org',
      '@type': ['Article', 'Recipe']
    })).toBe(true);

    expect(validateRecipeSchema({
      '@context': 'https://schema.org',
      '@type': ['Article', 'Product']
    })).toBe(false);
  });

  test('should validate graph structures', () => {
    expect(validateRecipeSchema({
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'WebPage' },
        { '@type': 'Recipe' }
      ]
    })).toBe(true);

    expect(validateRecipeSchema({
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': ['WebPage', 'Recipe'] }
      ]
    })).toBe(true);
  });

  test('should return false for non-recipe schemas', () => {
    expect(validateRecipeSchema({
      '@context': 'https://schema.org',
      '@type': 'Article'
    })).toBe(false);

    expect(validateRecipeSchema({
      '@context': 'https://example.com',
      '@type': 'Recipe'
    })).toBe(false);
  });
});

describe('extractRecipeData', () => {
  const mockUrl = 'https://example.com/recipe';

  test('should extract data from direct Recipe object', () => {
    const jsonLd = {
      '@type': 'Recipe',
      name: 'Test Recipe',
      description: 'A test recipe',
      recipeIngredient: ['1 cup flour', '2 eggs'],
      recipeInstructions: ['Mix', 'Bake']
    };

    const result = extractRecipeData(jsonLd, mockUrl);
    
    expect(result).toMatchObject({
      name: 'Test Recipe',
      description: 'A test recipe',
      url: mockUrl,
      ingredients: ['1 cup flour', '2 eggs'],
      instructions: ['Mix', 'Bake']
    });
  });

  test('should extract data from Recipe with array of types', () => {
    const jsonLd = {
      '@type': ['Article', 'Recipe'],
      name: 'Test Recipe',
      recipeIngredient: ['Salt'],
      recipeInstructions: ['Add salt']
    };

    const result = extractRecipeData(jsonLd, mockUrl);
    
    expect(result).not.toBeNull();
    expect(result.name).toBe('Test Recipe');
  });

  test('should extract data from @graph structure', () => {
    const jsonLd = {
      '@graph': [
        { '@type': 'WebPage' },
        {
          '@type': 'Recipe',
          name: 'Graph Recipe',
          recipeIngredient: ['Water'],
          recipeInstructions: ['Boil water']
        }
      ]
    };

    const result = extractRecipeData(jsonLd, mockUrl);
    
    expect(result).not.toBeNull();
    expect(result.name).toBe('Graph Recipe');
  });

  test('should return null for non-recipe data', () => {
    const jsonLd = {
      '@type': 'Article',
      name: 'Not a recipe'
    };

    const result = extractRecipeData(jsonLd, mockUrl);
    expect(result).toBeNull();
  });

  test('should handle HTML entities in recipe data', () => {
    const jsonLd = {
      '@type': 'Recipe',
      name: 'Salt &amp; Pepper Chicken',
      description: '&quot;Delicious&quot; recipe',
      author: { name: 'Chef&#39;s Kitchen' },
      recipeIngredient: ['Salt &amp; pepper'],
      recipeInstructions: ['Season &amp; cook']
    };

    const result = extractRecipeData(jsonLd, mockUrl);
    
    expect(result.name).toBe('Salt & Pepper Chicken');
    expect(result.description).toBe('"Delicious" recipe');
    expect(result.author).toBe("Chef's Kitchen");
    expect(result.ingredients[0]).toBe('Salt & pepper');
    expect(result.instructions[0]).toBe('Season & cook');
  });

  test('should handle complex image structures', () => {
    const jsonLd = {
      '@type': 'Recipe',
      name: 'Test',
      image: { url: 'https://example.com/image.jpg' }
    };

    const result = extractRecipeData(jsonLd, mockUrl);
    expect(result.image).toBe('https://example.com/image.jpg');
  });

  test('should handle all optional fields', () => {
    const jsonLd = {
      '@type': 'Recipe',
      name: 'Complete Recipe',
      datePublished: '2024-01-01',
      prepTime: 'PT15M',
      cookTime: 'PT30M',
      totalTime: 'PT45M',
      recipeYield: '4 servings',
      recipeCategory: 'Dinner',
      recipeCuisine: 'Italian',
      keywords: 'pasta, italian, easy',
      nutrition: { calories: 300 },
      aggregateRating: { ratingValue: 4.5 }
    };

    const result = extractRecipeData(jsonLd, mockUrl);
    
    expect(result.datePublished).toBe('2024-01-01');
    expect(result.prepTime).toBe('PT15M');
    expect(result.cookTime).toBe('PT30M');
    expect(result.totalTime).toBe('PT45M');
    expect(result.recipeYield).toBe('4 servings');
    expect(result.recipeCategory).toBe('Dinner');
    expect(result.recipeCuisine).toBe('Italian');
    expect(result.keywords).toBe('pasta, italian, easy');
    expect(result.nutrition).toEqual({ calories: 300 });
    expect(result.aggregateRating).toEqual({ ratingValue: 4.5 });
  });
});

describe('JSONLDExtractor', () => {
  let extractor;

  beforeEach(() => {
    extractor = new JSONLDExtractor();
  });

  test('should initialize with empty jsonLdScripts array', () => {
    expect(extractor.jsonLdScripts).toEqual([]);
  });

  test('should parse and store valid JSON-LD', () => {
    extractor.element({});
    extractor.text({ text: '{"@type": "Recipe", "name": "Test Recipe"}', lastInTextNode: true });
    
    expect(extractor.jsonLdScripts).toHaveLength(1);
    expect(extractor.jsonLdScripts[0]).toEqual({ '@type': 'Recipe', name: 'Test Recipe' });
  });

  test('should handle JSON-LD arrays', () => {
    extractor.element({});
    extractor.text({ text: '[{"@type": "Recipe", "name": "Recipe 1"}, {"@type": "Recipe", "name": "Recipe 2"}]', lastInTextNode: true });
    
    expect(extractor.jsonLdScripts).toHaveLength(2);
    expect(extractor.jsonLdScripts[0]).toEqual({ '@type': 'Recipe', name: 'Recipe 1' });
    expect(extractor.jsonLdScripts[1]).toEqual({ '@type': 'Recipe', name: 'Recipe 2' });
  });

  test('should handle multi-part text nodes', () => {
    extractor.element({});
    extractor.text({ text: '{"@type": "Recipe",', lastInTextNode: false });
    extractor.text({ text: ' "name": "Test Recipe"}', lastInTextNode: true });
    
    expect(extractor.jsonLdScripts).toHaveLength(1);
    expect(extractor.jsonLdScripts[0]).toEqual({ '@type': 'Recipe', name: 'Test Recipe' });
  });

  test('should handle invalid JSON gracefully', () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
    
    extractor.element({});
    extractor.text({ text: '{invalid json}', lastInTextNode: true });
    
    expect(extractor.jsonLdScripts).toHaveLength(0);
    expect(consoleSpy).toHaveBeenCalledWith('Failed to parse JSON-LD:', expect.any(SyntaxError));
    
    consoleSpy.mockRestore();
  });

  test('should handle multiple scripts', () => {
    // First script
    extractor.element({});
    extractor.text({ text: '{"@type": "WebPage"}', lastInTextNode: true });
    
    // Second script
    extractor.element({});
    extractor.text({ text: '{"@type": "Recipe", "name": "Test"}', lastInTextNode: true });
    
    expect(extractor.jsonLdScripts).toHaveLength(2);
    expect(extractor.jsonLdScripts[0]).toEqual({ '@type': 'WebPage' });
    expect(extractor.jsonLdScripts[1]).toEqual({ '@type': 'Recipe', name: 'Test' });
  });
});

describe('processRecipeUrl', () => {
  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Mock fetch
    global.fetch = jest.fn();
    
    // Mock HTMLRewriter since it's not available in test environment
    global.HTMLRewriter = jest.fn().mockImplementation(() => ({
      on: jest.fn().mockReturnThis(),
      transform: jest.fn().mockImplementation(() => ({
        text: jest.fn().mockResolvedValue('')
      }))
    }));
  });

  test('should handle fetch errors', async () => {
    // Note: In the test environment, the fetch might not be properly mocked
    // The actual error message depends on the mock implementation
    const result = await processRecipeUrl('https://example.com/recipe');

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  test('should handle non-OK responses', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 404
    });

    const result = await processRecipeUrl('https://example.com/recipe');

    expect(result.success).toBe(false);
    expect(result.error).toBe('HTTP error! status: 404');
  });

  // Note: Testing the full processRecipeUrl with HTMLRewriter is difficult
  // in a non-Cloudflare Worker environment. The function relies on HTMLRewriter
  // which is a Cloudflare-specific API. In a real test environment, you would
  // either:
  // 1. Mock HTMLRewriter completely
  // 2. Use integration tests in a Cloudflare Worker test environment
  // 3. Refactor the code to be more testable by separating concerns
});