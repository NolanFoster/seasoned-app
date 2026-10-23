import { describe, expect, it } from 'vitest';
import {
  applyGraphMove,
  collectViolations,
  decideStatus,
  getRecipeRemediationMode,
  proposeLegalMoves,
} from '../recipe-remediation.js';
import { analyzeRecipeAllergens } from '../allergen-graph.js';
import { analyzeProcessSafety } from '../food-process-safety.js';

const butterRecipe = {
  name: 'Weeknight Rice',
  ingredients: ['1 tbsp butter', '1 cup rice'],
  instructions: ['Cook rice until tender.'],
};

describe('recipe remediation pure helpers', () => {
  it('keeps the feature off unless explicitly set to shadow or on', () => {
    expect(getRecipeRemediationMode()).toBe('off');
    expect(getRecipeRemediationMode({})).toBe('off');
    expect(getRecipeRemediationMode({ RECIPE_REMEDIATION_V1: 'shadow' })).toBe('shadow');
    expect(getRecipeRemediationMode('enabled')).toBe('on');
    expect(getRecipeRemediationMode('unexpected')).toBe('off');
  });

  it('collects a graph violation and proposes a finite safe replacement', () => {
    const violations = collectViolations(butterRecipe, { hardAllergens: ['milk'] });
    expect(violations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        gate: 'allergen',
        code: 'ALLERGEN_SAFETY_BLOCK',
        allergen: 'milk',
        matchedTerm: 'butter',
        lineIndex: 0,
        field: 'ingredient',
      }),
    ]));

    const moves = proposeLegalMoves(violations, {
      recipe: butterRecipe,
      hardAllergens: ['milk'],
    });
    expect(moves).toEqual(expect.arrayContaining([
      expect.objectContaining({
        move: 'swap_graph_known',
        replacement: 'olive oil',
        requiresModelRevision: false,
      }),
    ]));
  });

  it('applies a graph move immutably and flags title changes for review', () => {
    const recipe = {
      ...butterRecipe,
      name: 'Butter rice',
    };
    const violations = collectViolations(recipe, { hardAllergens: ['milk'] });
    const [move] = proposeLegalMoves(violations, { recipe, hardAllergens: ['milk'] });
    const result = applyGraphMove(recipe, move);

    expect(result.recipe.ingredients[0]).toBe('1 tbsp olive oil');
    expect(result.recipe.name).toBe('Olive oil rice');
    expect(result.characterChange).toBe(true);
    expect(result.repair).toMatchObject({
      move: 'swap_graph_known',
      from: 'butter',
      to: 'olive oil',
      graphChecked: true,
      characterChange: true,
    });
    expect(recipe.ingredients[0]).toBe('1 tbsp butter');
    expect(analyzeRecipeAllergens(result.recipe, ['milk']).safe).toBe(true);
  });

  it('drops only an isolated ingredient line when there is no safe mapped move', () => {
    const recipe = {
      name: 'Herbed Rice Pilaf',
      ingredients: ['1 oz cheddar', '1 cup rice'],
      instructions: ['Cook rice until tender.'],
    };
    const violations = collectViolations(recipe, { hardAllergens: ['milk'] });
    const moves = proposeLegalMoves(violations, { recipe, hardAllergens: ['milk'] });
    expect(moves).toEqual(expect.arrayContaining([expect.objectContaining({ move: 'drop' })]));
    expect(moves).not.toEqual(expect.arrayContaining([expect.objectContaining({ move: 'swap_graph_known' })]));
  });

  it('does not offer a drop when the blocked term is part of the dish name', () => {
    const recipe = {
      name: 'Cheddar Rice',
      ingredients: ['1 oz cheddar', '1 cup rice'],
      instructions: ['Cook rice until tender.'],
    };
    const violations = collectViolations(recipe, { hardAllergens: ['milk'] });
    expect(proposeLegalMoves(violations, { recipe, hardAllergens: ['milk'] })).toEqual([]);
  });

  it('abstains on opaque allergen lines and process blocks rather than guessing', () => {
    const opaque = { ingredients: ['1 tbsp seasoning blend'], instructions: ['Stir into rice.'] };
    expect(collectViolations(opaque, { hardAllergens: ['peanuts'] })[0]).toMatchObject({
      gate: 'allergen',
      reason: 'opaque_or_precautionary_ingredient_terms',
      allowedMoves: [],
    });

    const processBlocked = {
      name: 'Shelf-stable chicken',
      ingredients: ['1 lb chicken'],
      instructions: ['Pressure-can chicken in jars for 90 minutes at 15 psi and store at room temperature.'],
    };
    const process = analyzeProcessSafety(processBlocked);
    expect(process.blocked.length).toBeGreaterThan(0);
    expect(collectViolations(processBlocked, {}).some((violation) => violation.gate === 'process')).toBe(true);
  });

  it('decides repaired, retry, and capped abstention states', () => {
    const failed = [{ gate: 'allergen' }];
    expect(decideStatus(failed, [], 1)).toMatchObject({ status: 'repaired', attempts: 1, abstained: false });
    expect(decideStatus(failed, failed, 1)).toMatchObject({ status: 'retry', attempts: 1, abstained: false });
    expect(decideStatus(failed, failed, 2)).toMatchObject({ status: 'abstained', attempts: 2, abstained: true });
  });
});
