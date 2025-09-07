import { describe, it, expect } from 'vitest';
import { validateRecipe, validateGenerationParams } from '../../src/utils/validator.js';

describe('Validator', () => {
  describe('validateRecipe', () => {
    it('should validate a valid recipe with title and ingredients', () => {
      const recipe = {
        title: 'Pasta',
        ingredients: ['pasta', 'tomato sauce', 'cheese']
      };
      
      const result = validateRecipe(recipe);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate a valid recipe with name and recipeIngredient', () => {
      const recipe = {
        name: 'Pizza',
        recipeIngredient: ['dough', 'tomato sauce', 'mozzarella']
      };
      
      const result = validateRecipe(recipe);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject recipe without name or title', () => {
      const recipe = {
        ingredients: ['flour', 'water']
      };
      
      const result = validateRecipe(recipe);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Recipe must have a name or title');
    });

    it('should reject recipe without ingredients', () => {
      const recipe = {
        title: 'Empty Recipe'
      };
      
      const result = validateRecipe(recipe);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Recipe must have ingredients');
    });

    it('should reject recipe with empty ingredients array', () => {
      const recipe = {
        title: 'No Ingredients',
        ingredients: []
      };
      
      const result = validateRecipe(recipe);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Ingredients must be a non-empty array');
    });

    it('should reject null recipe', () => {
      const result = validateRecipe(null);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Recipe object is required');
    });

    it('should reject recipe with invalid field types', () => {
      const recipe = {
        name: 123,
        title: ['array'],
        description: { object: true },
        ingredients: ['valid']
      };
      
      const result = validateRecipe(recipe);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Recipe name must be a string');
      expect(result.errors).toContain('Recipe title must be a string');
      expect(result.errors).toContain('Recipe description must be a string');
    });
  });

  describe('validateGenerationParams', () => {
    it('should validate valid generation parameters', () => {
      const params = {
        style: 'realistic',
        aspectRatio: '16:9'
      };
      
      const result = validateGenerationParams(params);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate empty parameters', () => {
      const params = {};
      
      const result = validateGenerationParams(params);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject invalid style', () => {
      const params = {
        style: 'invalid-style'
      };
      
      const result = validateGenerationParams(params);
      
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Invalid style');
    });

    it('should reject invalid aspect ratio', () => {
      const params = {
        aspectRatio: '5:7'
      };
      
      const result = validateGenerationParams(params);
      
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Invalid aspect ratio');
    });

    it('should reject multiple invalid parameters', () => {
      const params = {
        style: 'wrong',
        aspectRatio: 'bad'
      };
      
      const result = validateGenerationParams(params);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(2);
    });
  });
});