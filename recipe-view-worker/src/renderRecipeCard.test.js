import { describe, it, expect } from 'vitest';
import { renderRecipeCard } from './renderRecipeCard.js';

describe('renderRecipeCard', () => {
  it('should render basic recipe with string ingredients and instructions', () => {
    const html = renderRecipeCard({
      name: 'Pasta',
      ingredients: ['200g pasta', 'salt'],
      instructions: ['Boil water', 'Cook pasta'],
    });
    expect(html).toContain('Pasta');
    expect(html).toContain('<li>200g pasta</li>');
    expect(html).toContain('<li>Boil water</li>');
  });

  it('should handle instruction objects with .text property', () => {
    const html = renderRecipeCard({
      name: 'Test',
      instructions: [{ text: 'Mix ingredients' }],
    });
    expect(html).toContain('Mix ingredients');
  });

  it('should handle instruction objects with .name property', () => {
    const html = renderRecipeCard({
      name: 'Test',
      instructions: [{ name: 'Preheat oven' }],
    });
    expect(html).toContain('Preheat oven');
  });

  it('should JSON.stringify instruction objects with no text or name', () => {
    const inst = { order: 1, action: 'stir' };
    const html = renderRecipeCard({
      name: 'Test',
      instructions: [inst],
    });
    // JSON.stringify output is HTML-escaped, so quotes become &quot;
    expect(html).toContain('&quot;order&quot;');
    expect(html).toContain('&quot;stir&quot;');
  });

  it('should handle ingredient objects with .name property', () => {
    const html = renderRecipeCard({
      name: 'Test',
      ingredients: [{ name: '2 cups flour' }],
    });
    expect(html).toContain('2 cups flour');
  });

  it('should JSON.stringify ingredient objects with no name', () => {
    const html = renderRecipeCard({
      name: 'Test',
      ingredients: [{ amount: 2, unit: 'cups' }],
    });
    // JSON.stringify output is HTML-escaped, so quotes become &quot;
    expect(html).toContain('&quot;amount&quot;');
    expect(html).toContain('&quot;cups&quot;');
  });

  it('should escape HTML in recipe fields', () => {
    const html = renderRecipeCard({
      name: '<b>Bold</b>',
      description: '<script>alert(1)</script>',
      ingredients: ['<img src=x>'],
      instructions: ['<b>step</b>'],
    });
    expect(html).not.toContain('<b>Bold</b>');
    expect(html).toContain('&lt;b&gt;Bold&lt;/b&gt;');
    expect(html).not.toContain('<script>');
  });

  it('should handle null/undefined recipe fields gracefully', () => {
    const html = renderRecipeCard({
      name: 'Minimal',
    });
    expect(html).toContain('Minimal');
    expect(html).not.toContain('undefined');
    expect(html).not.toContain('null');
  });

  it('should render parseDuration for numeric duration', () => {
    const html = renderRecipeCard({
      name: 'Timed Recipe',
      prep_time: 30,
      cook_time: 45,
    });
    expect(html).toContain('30 min');
    expect(html).toContain('45 min');
  });

  it('should render parseDuration for ISO 8601 duration with hours and minutes', () => {
    const html = renderRecipeCard({
      name: 'Long Recipe',
      prep_time: 'PT1H30M',
    });
    expect(html).toContain('1 hr');
    expect(html).toContain('30 min');
  });

  it('should return raw value for non-ISO duration strings', () => {
    const html = renderRecipeCard({
      name: 'Recipe',
      prep_time: '30 minutes',
    });
    expect(html).toContain('30 minutes');
  });

  it('should not render cook button when there are no instructions', () => {
    const html = renderRecipeCard({ name: 'No Steps', instructions: [] });
    expect(html).not.toContain('cook-btn');
  });

  it('should render source badge for ai_generated recipes', () => {
    const html = renderRecipeCard({ name: 'AI Recipe', source: 'ai_generated' });
    expect(html).toContain('AI Generated');
  });

  it('should render source badge for clipped recipes', () => {
    const html = renderRecipeCard({ name: 'Clipped', source: 'clipped' });
    expect(html).toContain('Clipped');
  });

  it('should hide source link for ai_generated recipes', () => {
    const html = renderRecipeCard({
      name: 'AI',
      source: 'ai_generated',
      source_url: 'https://example.com',
    });
    expect(html).not.toContain('source-link');
  });

  it('should show source link for clipped recipes', () => {
    const html = renderRecipeCard({
      name: 'Clipped',
      source: 'clipped',
      source_url: 'https://example.com/original',
    });
    expect(html).toContain('source-link');
    expect(html).toContain('https://example.com/original');
  });
});
