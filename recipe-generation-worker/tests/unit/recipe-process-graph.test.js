import { describe, expect, it } from 'vitest';
import { handleAdapt } from '../../src/handlers/adapt-handler.js';
import { handleGenerate } from '../../src/handlers/generate-handler.js';
import { createPostRequest } from '../setup.js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

const graphEnabledEnv = {
  ENVIRONMENT: 'test',
  RECIPE_PROCESS_GRAPH_V1: 'true'
};

const baseRecipe = {
  id: 'graph-test-recipe',
  name: 'Garlic pasta',
  ingredients: ['8 oz pasta', '2 tbsp olive oil', '2 cloves garlic'],
  instructions: [
    'Boil pasta in a pot for 8 minutes.',
    'Meanwhile, heat olive oil in a skillet and sauté garlic.',
    'Toss pasta with garlic oil and serve.'
  ]
};

describe('recipe process graph worker rollout', () => {
  it('attaches a validated graph to mock generate responses only when enabled', async () => {
    const request = createPostRequest('/generate', {
      recipeName: 'Garlic pasta'
    });
    const response = await handleGenerate(
      request,
      graphEnabledEnv,
      corsHeaders
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.recipe.processGraph).toMatchObject({
      schemaVersion: '1.0',
      graphType: 'recipe_process'
    });
    expect(body.recipe.graphValidation).toMatchObject({
      valid: true,
      coverage: 100
    });
    expect(body.recipe.qualityBar).toMatchObject({
      graphValid: true,
      graphCoverage: 100
    });
  });

  it('keeps the existing linear response shape with the flag off', async () => {
    const request = createPostRequest('/generate', {
      recipeName: 'Garlic pasta'
    });
    const response = await handleGenerate(
      request,
      { ENVIRONMENT: 'test' },
      corsHeaders
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.recipe.processGraph).toBeUndefined();
    expect(body.recipe.graphValidation).toBeUndefined();
  });

  it('attaches a graph to adapted recipes and preserves the legacy fields', async () => {
    const request = createPostRequest('/adapt', {
      baseRecipe,
      constraints: { hardAllergens: ['peanuts'] }
    });
    const response = await handleAdapt(request, graphEnabledEnv, corsHeaders);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.recipe.processGraph).toMatchObject({
      schemaVersion: '1.0',
      graphType: 'recipe_process'
    });
    expect(body.recipe.instructions).toEqual(baseRecipe.instructions);
    expect(body.recipe.graphValidation.valid).toBe(true);
  });
});
