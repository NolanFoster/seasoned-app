import { describe, it, expect, vi } from 'vitest';
import { handleAdapt, mockAdaptRecipe, normalizeAdaptedRecipe } from '../../src/handlers/adapt-handler.js';
import { createPostRequest } from '../setup.js';
import { RECIPE_LLM_MODEL } from '../../src/models.js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

const baseRecipe = {
  id: 'recipe-123',
  name: 'Creamy Pasta',
  description: 'A weeknight pasta.',
  cuisine: 'Italian',
  ingredients: ['8 oz pasta', '2 tbsp butter', '1 egg'],
  instructions: ['Boil the pasta.', 'Toss with butter and egg.'],
  prepTime: '10 minutes',
  cookTime: '20 minutes',
  servings: '2 servings'
};

function responseBody(response) {
  return response.json();
}

describe('RecipeAdapt handler', () => {
  it('adapts a recipe in mock mode and returns substitutions and lineage', async () => {
    const request = createPostRequest('/adapt', {
      baseRecipe,
      constraints: {
        dietary: ['vegan', 'gluten_free'],
        maxCookTime: 30,
        preserve: ['the creamy texture']
      }
    });

    const response = await handleAdapt(request, { ENVIRONMENT: 'test' }, corsHeaders);
    const data = await responseBody(response);

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.recipe.source).toBe('adapted');
    expect(data.recipe.adapted_from).toBe('recipe-123');
    expect(data.recipe.adaptation_constraints.preserve).toEqual(['the creamy texture']);
    expect(data.recipe.substitutions).toHaveLength(3);
    expect(data.recipe.qualityBar).toMatchObject({
      generationMethod: 'mock-ai',
      status: 'needs_review'
    });
    expect(data.recipe.provenance).toMatchObject({
      source: 'adapted',
      generationMethod: 'mock-ai',
      similarRecipeIds: []
    });
    expect(data.recipe.ingredients.join(' ')).not.toMatch(/\b(?:butter|egg|pasta)\b/i);
    expect(data.recipe.adaptationNotes.length).toBeGreaterThan(0);
  });

  it('uses explicit constraints over culinary profile defaults', async () => {
    const request = createPostRequest('/adapt', {
      baseRecipe: { ...baseRecipe, ingredients: ['1 cup rice'], instructions: ['Cook rice.'] },
      culinaryProfile: {
        diet_tags: ['vegan'],
        default_servings: 2,
        max_cook_time_min: 20
      },
      constraints: {
        dietary: [],
        servings: 6,
        maxCookTime: 45
      }
    });

    const response = await handleAdapt(request, { ENVIRONMENT: 'test' }, corsHeaders);
    const data = await responseBody(response);

    expect(response.status).toBe(200);
    expect(data.appliedConstraints.dietary).toEqual([]);
    expect(data.appliedConstraints.servings).toBe(6);
    expect(data.appliedConstraints.maxCookTime).toBe(45);
  });

  it('supports the recipe alias and normalized nested AI response', async () => {
    const run = vi.fn().mockResolvedValue({
      response: JSON.stringify({
        recipe: {
          Name: 'Adapted Pasta',
          Description: 'A better-fit pasta.',
          ingredients: ['8 oz rice noodles'],
          instructions: ['Cook the noodles.'],
          substitutions: [{ from: 'pasta', to: 'rice noodles', reason: 'Avoid wheat.' }],
          adaptationNotes: ['The Italian flavor profile remains intact.']
        }
      })
    });

    const response = await handleAdapt(
      createPostRequest('/adapt', {
        recipe: baseRecipe,
        constraints: { dietary: ['gluten_free'] }
      }),
      { ENVIRONMENT: 'test', AI: { run } },
      corsHeaders
    );
    const data = await responseBody(response);

    expect(response.status).toBe(200);
    expect(data.recipe.name).toBe('Adapted Pasta');
    expect(data.recipe.substitutions[0].to).toBe('rice noodles');
    expect(run).toHaveBeenCalledWith(RECIPE_LLM_MODEL, expect.objectContaining({
      response_format: expect.objectContaining({
        json_schema: expect.objectContaining({ name: 'recipe_adaptation' })
      })
    }));
  });

  it('reads an adaptation returned in the OpenAI-compatible chat completion shape', async () => {
    // gpt-oss returns choices[0].message.content when called with `messages`,
    // rather than the native `{ response }` shape.
    const run = vi.fn().mockResolvedValue({
      id: 'chatcmpl-1',
      object: 'chat.completion',
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: JSON.stringify({
            name: 'Adapted Pasta',
            description: 'A better-fit pasta.',
            ingredients: ['8 oz rice noodles'],
            instructions: ['Cook the noodles.'],
            substitutions: [{ from: 'pasta', to: 'rice noodles', reason: 'Avoid wheat.' }],
            adaptationNotes: ['The Italian flavor profile remains intact.']
          })
        }
      }]
    });

    const response = await handleAdapt(
      createPostRequest('/adapt', {
        recipe: baseRecipe,
        constraints: { dietary: ['gluten_free'] }
      }),
      { ENVIRONMENT: 'test', AI: { run } },
      corsHeaders
    );
    const data = await responseBody(response);

    expect(response.status).toBe(200);
    expect(data.recipe.name).toBe('Adapted Pasta');
    expect(data.recipe.substitutions[0].to).toBe('rice noodles');
  });

  it('fails closed when an AI adaptation contains a hard allergen', async () => {
    const run = vi.fn().mockResolvedValue({
      response: {
        name: 'Unsafe adaptation',
        ingredients: ['2 eggs'],
        instructions: ['Cook eggs.'],
        substitutions: [],
        adaptationNotes: []
      }
    });

    const response = await handleAdapt(
      createPostRequest('/adapt', {
        baseRecipe: { ...baseRecipe, ingredients: ['1 cup rice'] },
        constraints: { hardAllergens: ['eggs'] }
      }),
      { AI: { run } },
      corsHeaders
    );
    const data = await responseBody(response);

    expect(response.status).toBe(422);
    expect(data.code).toBe('ALLERGEN_SAFETY_BLOCK');
    expect(data.allergenSummary.blocked).toEqual(['eggs']);
  });

  it('validates content type and base recipe input', async () => {
    const invalidType = new Request('https://test.com/adapt', { method: 'POST', body: '{}' });
    const typeResponse = await handleAdapt(invalidType, {}, corsHeaders);
    expect(typeResponse.status).toBe(400);

    const invalidRecipe = createPostRequest('/adapt', { baseRecipe: { name: 'Empty' } });
    const recipeResponse = await handleAdapt(invalidRecipe, {}, corsHeaders);
    const data = await responseBody(recipeResponse);
    expect(recipeResponse.status).toBe(400);
    expect(data.error).toMatch(/baseRecipe/);
  });

  it('normalizes missing AI fields without losing the base recipe structure', () => {
    const normalized = normalizeAdaptedRecipe({ name: 'New name' }, baseRecipe);
    expect(normalized.name).toBe('New name');
    expect(normalized.ingredients).toEqual(baseRecipe.ingredients);
    expect(normalized.instructions).toEqual(baseRecipe.instructions);
    expect(normalized.substitutions).toEqual([]);
  });

  it('keeps a safe recipe unchanged when no matching adaptation is needed', () => {
    const adapted = mockAdaptRecipe({ ...baseRecipe, ingredients: ['1 cup rice'], instructions: ['Cook rice.'] }, {
      dietary: [],
      hardAllergens: [],
      equipment: [],
      maxCookTime: 60
    });
    expect(adapted.ingredients).toEqual(['1 cup rice']);
    expect(adapted.substitutions).toEqual([]);
  });
  it('blocks an adaptation that introduces an unsafe preserving technique', async () => {
    const request = createPostRequest('/adapt', {
      baseRecipe: {
        ...baseRecipe,
        name: 'Canned Green Beans',
        ingredients: ['3 lbs green beans'],
        instructions: ['Pack the beans into jars.', 'Pressure can the jars for the pantry.']
      }
    });

    const response = await handleAdapt(request, {}, corsHeaders);
    const data = await responseBody(response);

    expect(response.status).toBe(422);
    expect(data.code).toBe('PROCESS_SAFETY_BLOCK');
    expect(data.processSafetySummary.blocked).toContain('home_canning_low_acid');
    expect(data.recipe).toBeUndefined();
  });

  it('annotates an adapted recipe with a process-safety verdict', async () => {
    const request = createPostRequest('/adapt', { baseRecipe });

    const response = await handleAdapt(request, {}, corsHeaders);
    const data = await responseBody(response);

    expect(response.status).toBe(200);
    expect(data.recipe.processSafetyValidation).toBe('PASSED');
    expect(data.processSafetySummary).toMatchObject({ checked: true, tags: [] });
  });
});
