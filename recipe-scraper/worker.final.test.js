/**
 * Final tests to reach 85% coverage
 */

import { describe, test, expect, jest } from '@jest/globals';
import { 
  normalizeIngredients,
  normalizeInstructions,
  JSONLDExtractor,
  extractRecipeData
} from './worker.js';

describe('Final coverage tests', () => {
  describe('normalizeIngredients remaining cases', () => {
    test('should handle objects without name or text properties', () => {
      const ingredients = [
        { amount: '1 cup' }, // no name or text
        { quantity: 2 }      // will use String()
      ];
      
      const result = normalizeIngredients(ingredients);
      expect(result).toEqual(['[object Object]', '[object Object]']);
    });
  });

  describe('normalizeInstructions remaining cases', () => {
    test('should return empty array for non-array, non-string, non-HowToSection', () => {
      const result1 = normalizeInstructions({ randomObject: true });
      expect(result1).toEqual([]);
      
      const result2 = normalizeInstructions(123);
      expect(result2).toEqual([]);
    });

    test('should handle HowToSection without itemListElement', () => {
      const instructions = {
        '@type': 'HowToSection',
        // no itemListElement
      };
      
      const result = normalizeInstructions(instructions);
      expect(result).toEqual([]);
    });
  });

  describe('JSONLDExtractor array handling', () => {
    test('should handle JSON-LD array response', () => {
      const extractor = new JSONLDExtractor();
      extractor.element({});
      
      // Test with array of JSON-LD objects
      const jsonArray = JSON.stringify([
        { '@type': 'Recipe', name: 'Recipe 1' },
        { '@type': 'Recipe', name: 'Recipe 2' }
      ]);
      
      extractor.text({ text: jsonArray, lastInTextNode: true });
      
      expect(extractor.jsonLdScripts).toHaveLength(2);
      expect(extractor.jsonLdScripts[0].name).toBe('Recipe 1');
      expect(extractor.jsonLdScripts[1].name).toBe('Recipe 2');
    });
  });

  describe('extractRecipeData edge cases', () => {
    test('should handle recipe with string image property', () => {
      const jsonLd = {
        '@type': 'Recipe',
        name: 'Test',
        image: 'https://example.com/direct-image.jpg'
      };
      
      const result = extractRecipeData(jsonLd, 'https://example.com');
      expect(result.image).toBe('https://example.com/direct-image.jpg');
    });

    test('should handle recipe with author string', () => {
      const jsonLd = {
        '@type': 'Recipe',
        name: 'Test',
        author: 'John Doe'
      };
      
      const result = extractRecipeData(jsonLd, 'https://example.com');
      expect(result.author).toBe('John Doe');
    });

    test('should handle missing optional fields', () => {
      const jsonLd = {
        '@type': 'Recipe',
        name: 'Minimal Recipe'
      };
      
      const result = extractRecipeData(jsonLd, 'https://example.com');
      expect(result.description).toBe('');
      expect(result.image).toBe('');
      expect(result.author).toBe('');
      expect(result.ingredients).toEqual([]);
      expect(result.instructions).toEqual([]);
    });
  });
});