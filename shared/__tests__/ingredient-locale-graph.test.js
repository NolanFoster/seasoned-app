import { describe, it, expect } from 'vitest';
import {
  SUPPORTED_LOCALES,
  getLocalizedIngredientName,
  getIngredientProxies
} from '../ingredient-locale-graph.js';

describe('ingredient-locale-graph', () => {
  it('exports supported locales', () => {
    expect(SUPPORTED_LOCALES).toContain('US');
    expect(SUPPORTED_LOCALES).toContain('UK');
    expect(SUPPORTED_LOCALES).toContain('AU');
  });

  it('translates ingredients to UK names', () => {
    expect(getLocalizedIngredientName('cilantro', 'UK')).toBe('fresh coriander');
    expect(getLocalizedIngredientName('arugula', 'UK')).toBe('rocket');
    expect(getLocalizedIngredientName('zucchini', 'UK')).toBe('courgette');
    expect(getLocalizedIngredientName('heavy cream', 'UK')).toBe('double cream');
  });

  it('translates ingredients to AU names', () => {
    expect(getLocalizedIngredientName('bell pepper', 'AU')).toBe('capsicum');
    expect(getLocalizedIngredientName('arugula', 'AU')).toBe('rocket');
  });

  it('returns substitution proxies for specialty ingredients', () => {
    const mirinProxies = getIngredientProxies('mirin');
    expect(mirinProxies.length).toBeGreaterThan(0);
    expect(mirinProxies[0].to).toContain('sherry');

    const buttermilkProxies = getIngredientProxies('buttermilk');
    expect(buttermilkProxies.some(p => p.to.includes('lemon'))).toBe(true);
  });
});
