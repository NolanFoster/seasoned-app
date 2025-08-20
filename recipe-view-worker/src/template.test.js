import { describe, it, expect, vi } from 'vitest';
import { generateRecipeHTML } from './template.js';

// Mock the shared utility functions
vi.mock('../../shared/utility-functions.js', () => ({
  formatDuration: vi.fn((duration) => {
    // Simple mock implementation
    if (duration === 'PT15M') return '15 minutes';
    if (duration === 'PT20M') return '20 minutes';
    if (duration === 'PT30M') return '30 minutes';
    if (duration === 'PT40M') return '40 minutes';
    if (duration === 'PT45M') return '45 minutes';
    if (duration === 'PT1H') return '1 hour';
    return duration;
  }),
  formatIngredientAmount: vi.fn((ingredient) => ingredient)
}));

describe('generateRecipeHTML', () => {
  it('should generate HTML with all recipe fields', () => {
    const recipe = {
      id: 'test123',
      name: 'Test Recipe',
      description: 'A delicious test recipe',
      prep_time: 'PT15M',
      cook_time: 'PT30M',
      total_time: 'PT45M',
      recipe_yield: '4 servings',
      ingredients: ['1 cup flour', '2 eggs', '1/2 cup milk'],
      instructions: ['Mix ingredients', 'Bake for 30 minutes', 'Let cool and serve'],
      image_url: 'https://example.com/image.jpg',
      source_url: 'https://example.com/recipe',
      video_url: 'https://youtube.com/watch?v=123'
    };

    const html = generateRecipeHTML(recipe);

    // Check basic structure
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('</html>');

    // Check meta tags
    expect(html).toContain('<title>Test Recipe - Recipe</title>');
    expect(html).toContain('<meta name="description" content="A delicious test recipe">');
    expect(html).toContain('<meta property="og:title" content="Test Recipe">');
    expect(html).toContain('<meta property="og:description" content="A delicious test recipe">');
    expect(html).toContain('<meta property="og:image" content="https://example.com/image.jpg">');
    expect(html).toContain('<meta name="twitter:title" content="Test Recipe">');
    expect(html).toContain('<meta name="twitter:image" content="https://example.com/image.jpg">');

    // Check recipe content
    expect(html).toContain('Test Recipe');
    expect(html).toContain('Prep:');
    expect(html).toContain('15 minutes');
    expect(html).toContain('Cook:');
    expect(html).toContain('30 minutes');
    expect(html).toContain('Total:');
    expect(html).toContain('45 minutes');
    expect(html).toContain('Servings:');
    expect(html).toContain('4 servings');

    // Check ingredients
    expect(html).toContain('1 cup flour');
    expect(html).toContain('2 eggs');
    expect(html).toContain('1/2 cup milk');

    // Check instructions
    expect(html).toContain('Mix ingredients');
    expect(html).toContain('Bake for 30 minutes');
    expect(html).toContain('Let cool and serve');

    // Check links
    expect(html).toContain('View Original');
    expect(html).toContain('href="https://example.com/recipe"');
    expect(html).toContain('Watch Video');
    expect(html).toContain('href="https://youtube.com/watch?v=123"');

    // Check styles are included
    expect(html).toContain('<style>');
    expect(html).toContain('recipe-fullscreen');
  });

  it('should handle minimal recipe data', () => {
    const recipe = {
      name: 'Simple Recipe',
      ingredients: ['ingredient 1'],
      instructions: ['step 1']
    };

    const html = generateRecipeHTML(recipe);

    expect(html).toContain('Simple Recipe');
    expect(html).toContain('ingredient 1');
    expect(html).toContain('step 1');
    
    // Should not include missing fields
    expect(html).not.toContain('Prep:');
    expect(html).not.toContain('Cook:');
    expect(html).not.toContain('View Original');
    expect(html).not.toContain('Watch Video');
    expect(html).not.toContain('<meta property="og:image"');
  });

  it('should use fallback for missing name', () => {
    const recipe = {
      ingredients: ['ingredient 1'],
      instructions: ['step 1']
    };

    const html = generateRecipeHTML(recipe);
    expect(html).toContain('Untitled Recipe');
  });

  it('should handle alternative field names', () => {
    const recipe = {
      name: 'Alt Recipe',
      prepTime: 'PT20M',
      cookTime: 'PT40M',
      totalTime: 'PT1H',
      recipeYield: '6 portions',
      imageUrl: 'https://example.com/alt.jpg',
      sourceUrl: 'https://example.com/alt',
      videoUrl: 'https://youtube.com/alt'
    };

    const html = generateRecipeHTML(recipe);

    expect(html).toContain('20 minutes');
    expect(html).toContain('40 minutes');
    expect(html).toContain('1 hour');
    expect(html).toContain('6 portions');
    expect(html).toContain('https://example.com/alt.jpg');
  });

  it('should escape HTML in user content', () => {
    const recipe = {
      name: '<script>alert("XSS")</script>Test',
      description: 'Test & <b>bold</b> description',
      ingredients: ['<span>ingredient</span>'],
      instructions: ['<div>instruction</div>']
    };

    const html = generateRecipeHTML(recipe);

    // Should escape HTML entities
    expect(html).toContain('&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;Test');
    expect(html).toContain('Test &amp; &lt;b&gt;bold&lt;/b&gt; description');
    expect(html).toContain('&lt;span&gt;ingredient&lt;/span&gt;');
    expect(html).toContain('&lt;div&gt;instruction&lt;/div&gt;');

    // Should not contain unescaped tags
    expect(html).not.toContain('<script>alert("XSS")</script>');
    expect(html).not.toContain('<span>ingredient</span>');
  });

  it('should handle empty arrays gracefully', () => {
    const recipe = {
      name: 'Empty Arrays Recipe',
      ingredients: [],
      instructions: []
    };

    const html = generateRecipeHTML(recipe);

    expect(html).toContain('Empty Arrays Recipe');
    expect(html).toContain('Ingredients');
    expect(html).toContain('Instructions');
    // Should still have the structure but no list items
    expect(html).toContain('<ul class="ingredients-list">');
    expect(html).toContain('<ol class="instructions-list">');
  });

  it('should handle complex instruction objects', () => {
    const recipe = {
      name: 'Complex Instructions',
      instructions: [
        'Simple string instruction',
        { text: 'Object with text property' },
        { name: 'Object with name property' },
        { other: 'Object with other property' }
      ]
    };

    const html = generateRecipeHTML(recipe);

    expect(html).toContain('Simple string instruction');
    expect(html).toContain('Object with text property');
    expect(html).toContain('Object with name property');
    expect(html).toContain('[object Object]'); // Fallback for unknown object structure
  });

  it('should include responsive meta viewport', () => {
    const recipe = { name: 'Test' };
    const html = generateRecipeHTML(recipe);

    expect(html).toContain('<meta name="viewport" content="width=device-width, initial-scale=1.0">');
  });

  it('should include all CSS classes for styling', () => {
    const recipe = {
      name: 'Styled Recipe',
      prep_time: 'PT15M',
      ingredients: ['ingredient'],
      instructions: ['instruction']
    };

    const html = generateRecipeHTML(recipe);

    // Check for key CSS classes
    expect(html).toContain('recipe-fullscreen');
    expect(html).toContain('recipe-title-section');
    expect(html).toContain('recipe-fullscreen-title');
    expect(html).toContain('recipe-timing-info');
    expect(html).toContain('timing-item');
    expect(html).toContain('recipe-links');
    expect(html).toContain('recipe-fullscreen-content');
    expect(html).toContain('recipe-panel');
    expect(html).toContain('ingredients-list');
    expect(html).toContain('instructions-list');
    expect(html).toContain('recipe-full-background');
  });

  it('should handle yield variations', () => {
    const recipes = [
      { name: 'Test 1', recipe_yield: '4 servings' },
      { name: 'Test 2', recipeYield: '6 portions' },
      { name: 'Test 3', yield: '8 people' }
    ];

    recipes.forEach((recipe, index) => {
      const html = generateRecipeHTML(recipe);
      expect(html).toContain('Servings:');
      if (index === 0) expect(html).toContain('4 servings');
      if (index === 1) expect(html).toContain('6 portions');
      if (index === 2) expect(html).toContain('8 people');
    });
  });

  it('should generate valid onerror handler for images', () => {
    const recipe = {
      name: 'Image Test',
      image_url: 'https://example.com/image.jpg'
    };

    const html = generateRecipeHTML(recipe);

    expect(html).toContain('onerror="this.style.display=\'none\'; this.nextElementSibling.style.display=\'block\';"');
    expect(html).toContain('recipe-full-background-image');
    expect(html).toContain('placeholder-gradient');
  });

  it('should use placeholder when no image URL', () => {
    const recipe = {
      name: 'No Image Recipe'
    };

    const html = generateRecipeHTML(recipe);

    // Should not have an img tag when no image URL
    expect(html).not.toContain('<img src=');
    expect(html).toContain('recipe-full-background-placeholder');
    expect(html).toContain('placeholder-gradient');
  });

  it('should generate proper media query styles', () => {
    const recipe = { name: 'Test' };
    const html = generateRecipeHTML(recipe);

    // Check for responsive breakpoints
    expect(html).toContain('@media (max-width: 1024px)');
    expect(html).toContain('@media (max-width: 768px)');
    expect(html).toContain('@media (max-width: 480px)');
    expect(html).toContain('@media (prefers-color-scheme: dark)');
  });

  it('should include backdrop-filter for glassmorphism', () => {
    const recipe = { name: 'Test' };
    const html = generateRecipeHTML(recipe);

    expect(html).toContain('backdrop-filter: blur(');
    expect(html).toContain('-webkit-backdrop-filter: blur(');
  });

  it('should format ingredients using utility function', () => {
    const recipe = {
      name: 'Test',
      ingredients: ['1 cup flour', '2 tbsp sugar']
    };

    const html = generateRecipeHTML(recipe);

    // The mock just returns the ingredient as-is
    expect(html).toContain('1 cup flour');
    expect(html).toContain('2 tbsp sugar');
  });

  it('should handle null or undefined recipe', () => {
    expect(() => generateRecipeHTML(null)).toThrow();
    expect(() => generateRecipeHTML(undefined)).toThrow();
  });

  it('should handle null values in fields', () => {
    const recipe = {
      name: null,
      description: null,
      ingredients: ['test'],
      instructions: ['test']
    };

    const html = generateRecipeHTML(recipe);
    expect(html).toContain('Untitled Recipe');
    expect(html).not.toContain('null');
  });

  it('should handle special characters in URLs', () => {
    const recipe = {
      name: 'URL Test',
      source_url: 'https://example.com/recipe?id=123&param=value',
      video_url: 'https://youtube.com/watch?v=abc&list=xyz'
    };

    const html = generateRecipeHTML(recipe);

    expect(html).toContain('href="https://example.com/recipe?id=123&amp;param=value"');
    expect(html).toContain('href="https://youtube.com/watch?v=abc&amp;list=xyz"');
  });
});