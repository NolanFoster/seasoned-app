/**
 * Edge case tests to increase coverage
 */

import { describe, test, expect, jest } from '@jest/globals';
import { 
  normalizeInstructions
} from './worker.js';

describe('Edge cases for coverage', () => {
  describe('normalizeInstructions edge cases', () => {
    test('should handle objects with name property', () => {
      const instructions = [
        { name: 'Step 1: Mix' },
        { name: 'Step 2: Bake' }
      ];
      
      const result = normalizeInstructions(instructions);
      expect(result).toEqual(['Step 1: Mix', 'Step 2: Bake']);
    });

    test('should handle non-HowToStep objects with text', () => {
      const instructions = [
        { text: 'Regular text step' },
        { '@type': 'SomethingElse', text: 'Another step' }
      ];
      
      const result = normalizeInstructions(instructions);
      expect(result).toEqual(['Regular text step', 'Another step']);
    });

    test('should handle objects that need String conversion', () => {
      const instructions = [
        { value: 'not text or name' },
        123,
        { complex: { nested: 'object' } }
      ];
      
      const result = normalizeInstructions(instructions);
      expect(result).toEqual(['[object Object]', '123', '[object Object]']);
    });

    test('should handle single HowToSection with nested array', () => {
      const instructions = {
        '@type': 'HowToSection',
        itemListElement: [
          { '@type': 'HowToStep', text: 'Nested Step 1' },
          'Nested Step 2'
        ]
      };
      
      const result = normalizeInstructions(instructions);
      expect(result).toEqual(['Nested Step 1', 'Nested Step 2']);
    });

    test('should handle HowToSection with name property in itemListElement', () => {
      const instructions = {
        '@type': 'HowToSection',
        itemListElement: [
          { name: 'Named step in section' },
          { text: 'Text step in section' }
        ]
      };
      
      const result = normalizeInstructions(instructions);
      expect(result).toEqual(['Named step in section', 'Text step in section']);
    });

    test('should handle deeply nested HowToSection', () => {
      const instructions = {
        '@type': 'HowToSection',
        itemListElement: {
          '@type': 'HowToSection',
          itemListElement: ['Deep nested step']
        }
      };
      
      const result = normalizeInstructions(instructions);
      expect(result).toEqual(['Deep nested step']);
    });

    test('should filter out falsy values in nested section', () => {
      const instructions = {
        '@type': 'HowToSection',
        itemListElement: [
          'Valid step',
          null,
          '',
          undefined,
          'Another valid step'
        ]
      };
      
      const result = normalizeInstructions(instructions);
      expect(result).toEqual(['Valid step', 'Another valid step']);
    });
  });
});