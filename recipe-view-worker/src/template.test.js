import { describe, it, expect, vi } from 'vitest';
import { generateRecipeHTML } from './template.js';

// Mock the shared utility functions
vi.mock('../../shared/utility-functions.js', () => ({
  formatDuration: vi.fn((duration) => {
    if (!duration) return '';
    // Simple mock implementation
    const match = duration?.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
    if (match) {
      const hours = match[1];
      const minutes = match[2];
      if (hours && minutes) return `${hours} hour${hours > 1 ? 's' : ''} ${minutes} minutes`;
      if (hours) return `${hours} hour${hours > 1 ? 's' : ''}`;
      if (minutes) return `${minutes} minutes`;
    }
    return duration;
  }),
  formatIngredientAmount: vi.fn((ingredient) => ingredient)
}));

describe('generateRecipeHTML', () => {
  it('should generate HTML with basic recipe data', () => {
    const recipe = {
      name: 'Test Recipe',
      description: 'A test recipe description',
      ingredients: ['Ingredient 1', 'Ingredient 2'],
      instructions: ['Step 1', 'Step 2'],
      prepTime: 'PT15M',
      cookTime: 'PT30M',
      totalTime: 'PT45M',
      recipeYield: '4 servings'
    };

    const html = generateRecipeHTML(recipe);

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<title>Test Recipe - Recipe</title>');
    expect(html).toContain('A test recipe description');
    expect(html).toContain('Ingredient 1');
    expect(html).toContain('Ingredient 2');
    expect(html).toContain('Step 1');
    expect(html).toContain('Step 2');
  });

  it('should handle recipe with missing fields', () => {
    const recipe = {
      name: 'Minimal Recipe'
    };

    const html = generateRecipeHTML(recipe);

    expect(html).toContain('Minimal Recipe');
    // Check that undefined/null don't appear in the visible content (not in JS)
    // The HTML should not show undefined values in recipe content
    expect(html).not.toMatch(/>undefined</);
    expect(html).not.toMatch(/>null</);
  });

  it('should use "Untitled Recipe" when name is missing', () => {
    const recipe = {
      ingredients: ['Test ingredient']
    };

    const html = generateRecipeHTML(recipe);

    expect(html).toContain('Untitled Recipe');
  });

  it('should include image when provided', () => {
    const recipe = {
      name: 'Recipe with Image',
      imageUrl: 'https://example.com/recipe-image.jpg'
    };

    const html = generateRecipeHTML(recipe);

    expect(html).toContain('https://example.com/recipe-image.jpg');
    expect(html).toContain('<img');
    expect(html).toContain('alt="Recipe with Image"');
  });

  it('should handle alternative property names', () => {
    const recipe = {
      name: 'Alternative Props Recipe',
      prep_time: 'PT20M',
      cook_time: 'PT40M',
      total_time: 'PT60M',
      recipe_yield: '6 servings',
      image_url: 'https://example.com/alt-image.jpg',
      source_url: 'https://example.com/recipe-source'
    };

    const html = generateRecipeHTML(recipe);

    expect(html).toContain('Alternative Props Recipe');
    expect(html).toContain('https://example.com/alt-image.jpg');
  });

  it('should include Open Graph meta tags', () => {
    const recipe = {
      name: 'Social Media Recipe',
      description: 'Recipe for social sharing',
      imageUrl: 'https://example.com/social-image.jpg'
    };

    const html = generateRecipeHTML(recipe);

    expect(html).toContain('<meta property="og:title" content="Social Media Recipe">');
    expect(html).toContain('<meta property="og:description" content="Recipe for social sharing">');
    expect(html).toContain('<meta property="og:image" content="https://example.com/social-image.jpg">');
  });

  it('should include Twitter Card meta tags', () => {
    const recipe = {
      name: 'Twitter Recipe',
      description: 'Recipe for Twitter',
      imageUrl: 'https://example.com/twitter-image.jpg'
    };

    const html = generateRecipeHTML(recipe);

    expect(html).toContain('<meta name="twitter:title" content="Twitter Recipe">');
    expect(html).toContain('<meta name="twitter:description" content="Recipe for Twitter">');
    expect(html).toContain('<meta name="twitter:image" content="https://example.com/twitter-image.jpg">');
  });

  it('should handle nutrition information', () => {
    const recipe = {
      name: 'Nutritious Recipe',
      nutrition: {
        calories: '250',
        proteinContent: '20g',
        fatContent: '10g',
        carbohydrateContent: '30g'
      }
    };

    const html = generateRecipeHTML(recipe);

    expect(html).toContain('Nutritious Recipe');
    // Nutrition data should be present in the structured data or displayed
  });

  it('should escape HTML in user content', () => {
    const recipe = {
      name: '<script>alert("XSS")</script>Recipe',
      description: 'Recipe with <strong>HTML</strong> content',
      ingredients: ['<img src=x onerror=alert("XSS")>']
    };

    const html = generateRecipeHTML(recipe);

    expect(html).not.toContain('<script>alert("XSS")</script>');
    expect(html).not.toContain('<img src=x onerror=alert("XSS")>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('should handle video URL when provided', () => {
    const recipe = {
      name: 'Recipe with Video',
      videoUrl: 'https://example.com/recipe-video.mp4'
    };

    const html = generateRecipeHTML(recipe);

    expect(html).toContain('Recipe with Video');
    // Video URL should be included if the template supports it
  });

  it('should generate valid HTML structure', () => {
    const recipe = {
      name: 'Valid HTML Recipe',
      ingredients: ['Ingredient 1'],
      instructions: ['Step 1']
    };

    const html = generateRecipeHTML(recipe);

    expect(html).toMatch(/<!DOCTYPE html>/i);
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('<head>');
    expect(html).toContain('</head>');
    expect(html).toContain('<body>');
    expect(html).toContain('</body>');
    expect(html).toContain('</html>');
  });
});