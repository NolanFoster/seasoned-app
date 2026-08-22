import { describe, expect, it } from 'vitest';
import { handleAdapt } from '../../src/handlers/adapt-handler.js';
import { handleGenerate } from '../../src/handlers/generate-handler.js';
import { createPostRequest, mockEnv } from '../setup.js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

describe('uncertainty guards API contract', () => {
  it('keeps uncertainty metadata off by default', async () => {
    const response = await handleGenerate(
      createPostRequest('/generate', { recipeName: 'Rice bowl' }),
      mockEnv,
      corsHeaders
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.recipe).not.toHaveProperty('uncertaintySummary');
    expect(data).not.toHaveProperty('uncertaintySummary');
  });

  it('adds per-dimension uncertainty and honest nutrition abstention when enabled', async () => {
    const response = await handleGenerate(
      createPostRequest('/generate', { recipeName: 'Rice bowl' }),
      { ...mockEnv, UNCERTAINTY_GUARDS_V1: 'true' },
      corsHeaders
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.uncertaintySummary).toEqual(data.recipe.uncertaintySummary);
    expect(data.uncertaintySummary).toMatchObject({
      checked: true,
      level: 'abstain',
      dimensions: {
        nutrition: { level: 'abstain', reasons: ['nutrition_not_calculated'] },
        allergen_coverage: { level: 'high' },
        process_safety: { level: 'high' }
      }
    });
    expect(data.recipe.qualityBar).toMatchObject({
      uncertaintyLevel: 'abstain',
      uncertaintyReasons: expect.arrayContaining(['nutrition_not_calculated'])
    });
  });

  it('keeps allergen pass distinct from a nutrition abstention', async () => {
    const response = await handleGenerate(
      createPostRequest('/generate', {
        recipeName: 'Blend bowl',
        hardAllergens: ['peanuts']
      }),
      { ...mockEnv, UNCERTAINTY_GUARDS_V1: 'true' },
      corsHeaders
    );
    const data = await response.json();

    // The mock ingredients do not contain opaque package terms, so the
    // hard-allergen check can be evaluated with high confidence.
    expect(response.status).toBe(200);
    expect(data.uncertaintySummary.dimensions.allergen_coverage.level).toBe('high');
    expect(data.recipe.allergenValidation).toBe('PASSED');
  });

  it('emits the same contract for adapted recipes', async () => {
    const response = await handleAdapt(
      createPostRequest('/adapt', {
        baseRecipe: {
          name: 'Rice bowl',
          ingredients: ['1 cup rice', '1 cup seasoning blend'],
          instructions: ['Cook the rice and seasoning blend.']
        },
        constraints: {}
      }),
      { ...mockEnv, UNCERTAINTY_GUARDS_V1: 'true' },
      corsHeaders
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.uncertaintySummary).toEqual(data.recipe.uncertaintySummary);
    expect(data.recipe.uncertaintySummary.dimensions.allergen_coverage).toMatchObject({
      level: 'medium',
      reasons: ['opaque_or_precautionary_ingredient_terms']
    });
  });
});
