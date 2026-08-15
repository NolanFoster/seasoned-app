import { describe, expect, it } from 'vitest';
import {
  assertRecipeQuality,
  buildQualityBar,
  buildRecipeProvenance,
  checkIngredientCoverage,
  evaluateRecipeQuality,
  parseDurationMinutes,
  RecipeQualityError,
  withQualityMetadata
} from '../../src/quality-bar.js';

const goodRecipe = {
  name: 'Lemon rice bowl',
  ingredients: ['1 cup rice', '1 lemon', '2 tablespoons olive oil'],
  instructions: ['Cook the rice.', 'Zest and juice the lemon.', 'Toss rice with olive oil and lemon.'],
  prepTime: '10 minutes',
  cookTime: '20 minutes',
  totalTime: '30 minutes',
  generationTime: 1200,
  similarRecipesFound: 2,
  generatedAt: '2026-08-01T00:00:00.000Z'
};

describe('quality bar', () => {
  it('parses ISO and human-readable durations', () => {
    expect(parseDurationMinutes('PT1H30M')).toBe(90);
    expect(parseDurationMinutes('20 minutes')).toBe(20);
    expect(parseDurationMinutes(15)).toBe(15);
    expect(parseDurationMinutes('')).toBeNull();
  });

  it('checks ingredient coverage and ignores measurement-only words', () => {
    const result = checkIngredientCoverage(goodRecipe.ingredients, goodRecipe.instructions);
    expect(result.covered).toBe(3);
    expect(result.ratio).toBe(1);
    expect(checkIngredientCoverage([], []).ratio).toBe(0);
  });

  it('passes a complete recipe and reports timing consistency', () => {
    const result = evaluateRecipeQuality(goodRecipe);
    expect(result.passed).toBe(true);
    expect(result.score).toBe(100);
    expect(result.checks.timing.status).toBe('passed');
  });

  it('blocks recipes with catastrophic empty content', () => {
    const result = evaluateRecipeQuality({ name: 'Empty' });
    expect(result.passed).toBe(false);
    expect(result.blockingIssues).toEqual(['missing_ingredients', 'missing_instructions']);
    expect(() => assertRecipeQuality({ name: 'Empty' })).toThrow(RecipeQualityError);
  });

  it('surfaces coverage and timing gaps as warnings instead of blocking', () => {
    const result = evaluateRecipeQuality({
      ingredients: ['1 cup rice', '1 onion'],
      instructions: ['Cook the rice.'],
      prepTime: '60 minutes',
      cookTime: '60 minutes',
      totalTime: '30 minutes'
    });
    expect(result.passed).toBe(true);
    expect(result.warnings).toEqual(expect.arrayContaining(['ingredient_step_coverage', 'timing_consistency']));
    expect(result.checks.timing.status).toBe('warning');
  });

  it('includes allergen review status in the quality bar', () => {
    const result = evaluateRecipeQuality({
      ...goodRecipe,
      ingredients: ['1 cup seasoning blend'],
      instructions: ['Stir in the seasoning blend.']
    }, { hardAllergens: ['peanuts'] });
    expect(result.checks.allergenSafety.status).toBe('needs_review');
    expect(buildQualityBar({ ...goodRecipe, allergenSummary: result.checks.allergenSafety.summary }, {
      evaluation: result,
      generationMethod: 'llama-ai'
    })).toMatchObject({ status: 'needs_review', allergenCheck: 'needs_review' });
  });

  it('adds display-safe quality and provenance metadata without recipe internals', () => {
    const annotated = withQualityMetadata(goodRecipe, {
      source: 'ai_generated',
      generationMethod: 'llama-ai',
      model: '@cf/meta/llama-test',
      similarRecipeIds: ['recipe-1', { id: 'private' }, 'recipe-2'],
      appliedConstraints: { dietary: ['vegetarian'] }
    });
    expect(annotated.source).toBe('ai_generated');
    expect(annotated.generationMethod).toBe('llama-ai');
    expect(annotated.qualityBar).toMatchObject({ status: 'passed', score: 100, generationMethod: 'llama-ai' });
    expect(annotated.provenance).toMatchObject({
      source: 'ai_generated',
      model: '@cf/meta/llama-test',
      similarRecipeIds: ['recipe-1', 'recipe-2'],
      qualityScore: 100
    });
    expect(annotated.provenance).not.toHaveProperty('similarRecipes');
  });

  it('builds provenance defaults for adapted recipes', () => {
    const provenance = buildRecipeProvenance({ ...goodRecipe, source: 'adapted', adaptedAt: '2026-08-02T00:00:00.000Z' }, {
      generationMethod: 'mock-ai',
      qualityBar: { score: 90 }
    });
    expect(provenance).toMatchObject({ source: 'adapted', generationMethod: 'mock-ai', generatedAt: '2026-08-02T00:00:00.000Z', qualityScore: 90 });
    expect(provenance.model).toBeNull();
  });
});
