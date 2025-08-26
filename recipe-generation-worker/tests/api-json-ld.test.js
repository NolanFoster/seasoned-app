import { describe, it, expect, vi } from 'vitest';
import { handleGenerate } from '../src/handlers/generate-handler.js';

// Mock environment for testing
const mockEnv = {
  ENVIRONMENT: 'test',
  // No AI binding to trigger mock mode
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

describe('API JSON-LD Response', () => {
  it('should return JSON-LD in the response for recipe generation', async () => {
    const requestBody = {
      recipeName: 'Chocolate Chip Cookies',
      servings: '12',
      cuisine: 'American',
      dietary: ['vegetarian']
    };

    const request = new Request('http://localhost/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    const response = await handleGenerate(request, mockEnv, corsHeaders);
    const responseData = await response.json();

    // Check that the response has the expected structure
    expect(responseData.success).toBe(true);
    expect(responseData.recipe).toBeDefined();
    expect(responseData.jsonLd).toBeDefined();
    expect(responseData.environment).toBe('test');

    // Validate JSON-LD structure
    const jsonLd = responseData.jsonLd;
    expect(jsonLd['@context']).toBe('https://schema.org');
    expect(jsonLd['@type']).toBe('Recipe');
    expect(jsonLd.name).toContain('Chocolate Chip Cookies');
    expect(jsonLd.author['@type']).toBe('Organization');
    expect(jsonLd.author.name).toBe('AI Recipe Generator');

    // Check that timing is properly formatted
    if (jsonLd.prepTime) {
      expect(jsonLd.prepTime).toMatch(/^PT\d+[HM]$/);
    }
    if (jsonLd.cookTime) {
      expect(jsonLd.cookTime).toMatch(/^PT\d+[HM]$/);
    }
    if (jsonLd.totalTime) {
      expect(jsonLd.totalTime).toMatch(/^PT\d+[HM]$/);
    }

    // Check that instructions are properly structured
    if (jsonLd.recipeInstructions) {
      expect(Array.isArray(jsonLd.recipeInstructions)).toBe(true);
      jsonLd.recipeInstructions.forEach((instruction, index) => {
        expect(instruction['@type']).toBe('HowToStep');
        expect(instruction.position).toBe(index + 1);
        expect(instruction.text).toBeDefined();
      });
    }

    // Check that ingredients are properly formatted
    if (jsonLd.recipeIngredient) {
      expect(Array.isArray(jsonLd.recipeIngredient)).toBe(true);
    }

    // Check that keywords include dietary information
    if (responseData.recipe.dietary && responseData.recipe.dietary.length > 0) {
      expect(jsonLd.keywords).toContain('vegetarian');
    }
  });

  it('should handle ingredients-based recipe generation with JSON-LD', async () => {
    const requestBody = {
      ingredients: ['chicken', 'rice', 'vegetables'],
      servings: '4',
      cuisine: 'Asian'
    };

    const request = new Request('http://localhost/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    const response = await handleGenerate(request, mockEnv, corsHeaders);
    const responseData = await response.json();

    expect(responseData.success).toBe(true);
    expect(responseData.jsonLd).toBeDefined();

    const jsonLd = responseData.jsonLd;
    expect(jsonLd['@context']).toBe('https://schema.org');
    expect(jsonLd['@type']).toBe('Recipe');
    expect(jsonLd.recipeCuisine).toBe('Asian');
    expect(jsonLd.recipeYield).toBe('4');

    // Check that source ingredients are included in keywords
    if (jsonLd.keywords) {
      expect(jsonLd.keywords).toContain('chicken');
      expect(jsonLd.keywords).toContain('rice');
      expect(jsonLd.keywords).toContain('vegetables');
    }
  });

  it('should handle minimal recipe generation with JSON-LD', async () => {
    const requestBody = {
      recipeName: 'Simple Recipe'
    };

    const request = new Request('http://localhost/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    const response = await handleGenerate(request, mockEnv, corsHeaders);
    const responseData = await response.json();

    expect(responseData.success).toBe(true);
    expect(responseData.jsonLd).toBeDefined();

    const jsonLd = responseData.jsonLd;
    expect(jsonLd['@context']).toBe('https://schema.org');
    expect(jsonLd['@type']).toBe('Recipe');
    expect(jsonLd.name).toContain('Simple Recipe');
    expect(jsonLd.datePublished).toBeDefined();
  });

  it('should validate JSON-LD schema.org compliance', async () => {
    const requestBody = {
      recipeName: 'Test Recipe',
      ingredients: ['ingredient 1', 'ingredient 2'],
      instructions: ['step 1', 'step 2'],
      prepTime: '10 minutes',
      cookTime: '20 minutes'
    };

    const request = new Request('http://localhost/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    const response = await handleGenerate(request, mockEnv, corsHeaders);
    const responseData = await response.json();

    const jsonLd = responseData.jsonLd;

    // Required schema.org Recipe properties
    expect(jsonLd['@context']).toBe('https://schema.org');
    expect(jsonLd['@type']).toBe('Recipe');
    expect(jsonLd.name).toBeDefined();
    expect(jsonLd.author).toBeDefined();
    expect(jsonLd.author['@type']).toBe('Organization');

    // Optional but common properties
    if (jsonLd.recipeIngredient) {
      expect(Array.isArray(jsonLd.recipeIngredient)).toBe(true);
    }
    if (jsonLd.recipeInstructions) {
      expect(Array.isArray(jsonLd.recipeInstructions)).toBe(true);
      jsonLd.recipeInstructions.forEach(instruction => {
        expect(instruction['@type']).toBe('HowToStep');
        expect(instruction.position).toBeDefined();
        expect(instruction.text).toBeDefined();
      });
    }

    // Time properties should be in ISO 8601 duration format
    if (jsonLd.prepTime) {
      expect(jsonLd.prepTime).toMatch(/^PT\d+[HM]$/);
    }
    if (jsonLd.cookTime) {
      expect(jsonLd.cookTime).toMatch(/^PT\d+[HM]$/);
    }
  });
});