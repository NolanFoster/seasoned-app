import { afterEach, describe, expect, it, vi } from 'vitest';
import { analyzeRecipeAllergens } from '../../../shared/allergen-graph.js';
import { analyzeProcessSafety } from '../../../shared/food-process-safety.js';
import {
  enforceRecipeSafetyWithRemediation,
  RecipeRemediationAbstainError
} from '../../src/recipe-remediation.js';

const constraints = { hardAllergens: ['milk'] };
const safeShape = {
  name: 'Rice pilaf',
  description: 'A simple rice pilaf.',
  ingredients: ['1 tablespoon butter', '1 cup rice'],
  instructions: ['Cook the rice until tender.'],
  prepTime: '5 minutes',
  cookTime: '15 minutes',
  totalTime: '20 minutes',
  servings: '2'
};
const env = { ENVIRONMENT: 'test', PROCESS_SAFETY_V1: 'true' };

afterEach(() => vi.restoreAllMocks());

describe('enforceRecipeSafetyWithRemediation', () => {
  it('replaces a graph-listed milk term and rechecks both safety gates', async () => {
    const result = await enforceRecipeSafetyWithRemediation(safeShape, {
      constraints,
      env: { ...env, RECIPE_REMEDIATION_V1: 'on' }
    });

    expect(result.recipe.ingredients[0]).toBe('1 tablespoon olive oil');
    expect(result.remediation).toMatchObject({ modelId: 'recipe-remediation-v1', status: 'repaired', attempts: 1 });
    expect(analyzeRecipeAllergens(result.recipe, constraints.hardAllergens).safe).toBe(true);
    expect(analyzeProcessSafety(result.recipe).safe).toBe(true);
  });

  it('uses one handler-owned model revision for cited instructions and never trusts it without rechecking', async () => {
    const draft = {
      ...safeShape,
      instructions: ['Melt butter in a pan, then add rice.']
    };
    const run = vi.fn().mockResolvedValue({
      response: {
        updates: [{ field: 'instructions', index: 0, text: 'Warm the olive oil in a pan, then add rice.' }]
      }
    });
    const result = await enforceRecipeSafetyWithRemediation(draft, {
      constraints,
      env: { ...env, RECIPE_REMEDIATION_V1: 'on', AI: { run } }
    });

    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith('@cf/meta/llama-4-scout-17b-16e-instruct', expect.objectContaining({
      messages: expect.arrayContaining([expect.objectContaining({ role: 'user' })])
    }));
    expect(result.recipe.ingredients[0]).toBe('1 tablespoon olive oil');
    expect(result.recipe.instructions[0]).toBe('Warm the olive oil in a pan, then add rice.');
    expect(analyzeRecipeAllergens(result.recipe, constraints.hardAllergens).safe).toBe(true);
    expect(result.remediation.attempts).toBe(1);
  });

  it('stops after two revisions even when the first model revision introduces another allergen', async () => {
    const draft = {
      ...safeShape,
      ingredients: ['1 tablespoon butter', '1 tablespoon peanut butter', '1 cup rice'],
      instructions: ['Melt butter, then mix in peanut butter and rice.']
    };
    const run = vi.fn()
      .mockResolvedValueOnce({ response: { updates: [{ field: 'instructions', index: 0, text: 'Warm peanut oil, then add rice.' }] } })
      .mockResolvedValueOnce({ response: { updates: [{ field: 'instructions', index: 0, text: 'Warm sunflower seed butter, then add rice.' }] } });
    const result = await enforceRecipeSafetyWithRemediation(draft, {
      constraints: { hardAllergens: ['milk', 'peanuts'] },
      env: { ...env, RECIPE_REMEDIATION_V1: 'on', AI: { run } }
    });

    expect(run).toHaveBeenCalledTimes(2);
    expect(result.remediation.attempts).toBe(2);
    expect(result.recipe.ingredients).toContain('1 tablespoon olive oil');
    expect(result.recipe.ingredients).toContain('1 tablespoon sunflower seed butter');
    expect(analyzeRecipeAllergens(result.recipe, ['milk', 'peanuts']).safe).toBe(true);
  });

  it('returns a sanitized abstention when no legal move clears a process block', async () => {
    const draft = {
      name: 'Shelf-stable chicken',
      ingredients: ['1 lb chicken'],
      instructions: ['Pressure-can chicken in jars for 90 minutes at 15 psi and store at room temperature.'],
      prepTime: '10 minutes',
      cookTime: '90 minutes',
      totalTime: '100 minutes',
      servings: '4'
    };
    const error = await enforceRecipeSafetyWithRemediation(draft, {
      constraints: {},
      env: { ...env, RECIPE_REMEDIATION_V1: 'on' }
    }).catch((failure) => failure);

    expect(error).toBeInstanceOf(RecipeRemediationAbstainError);
    expect(error).toMatchObject({ code: 'RECIPE_REMEDIATION_ABSTAIN', attempts: 0 });
    expect(error.violations.every((violation) => ['allergen', 'process', 'quality'].includes(violation.gate))).toBe(true);
    expect(error).not.toHaveProperty('recipe');
    expect(JSON.stringify(error.violations)).toContain('process');
  });

  it('keeps off mode on the original error path and never calls an available model', async () => {
    const run = vi.fn();
    const original = await enforceRecipeSafetyWithRemediation(safeShape, {
      constraints,
      env: { ...env, RECIPE_REMEDIATION_V1: 'off', AI: { run } }
    }).catch((error) => error);

    expect(original.code).toBe('ALLERGEN_SAFETY_BLOCK');
    expect(original).not.toHaveProperty('remediation');
    expect(run).not.toHaveBeenCalled();
  });

  it('logs only codes and counts in shadow mode while preserving the original rejection', async () => {
    const log = vi.spyOn(console, 'info').mockImplementation(() => {});
    await expect(enforceRecipeSafetyWithRemediation(safeShape, {
      constraints,
      env: { ...env, RECIPE_REMEDIATION_V1: 'shadow' }
    })).rejects.toMatchObject({ code: 'ALLERGEN_SAFETY_BLOCK' });

    const output = log.mock.calls.map((call) => call.join(' ')).join(' ');
    expect(output).toContain('violationCount');
    expect(output).toContain('ALLERGEN_SAFETY_BLOCK');
    expect(output).not.toContain('butter');
    expect(output).not.toContain('Rice pilaf');
  });
});
