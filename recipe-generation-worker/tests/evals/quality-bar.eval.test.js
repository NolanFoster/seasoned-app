import { describe, expect, it } from 'vitest';
import { evaluateRecipeQuality } from '../../src/quality-bar.js';

const prompts = [
  ['weeknight tomato pasta', 'Italian'],
  ['vegetable curry', 'Indian'],
  ['black bean tacos', 'Mexican'],
  ['miso rice bowl', 'Japanese'],
  ['lemon herb chicken', 'Mediterranean'],
  ['coconut lentil soup', 'Thai'],
  ['roasted salmon salad', 'Nordic'],
  ['chickpea shakshuka', 'North African'],
  ['ginger beef noodles', 'Chinese'],
  ['corn and bean stew', 'Southwestern']
];

const constraintPacks = [
  { label: 'vegetarian', dietary: ['vegetarian'], ingredient: 'white beans' },
  { label: 'weeknight', maxCookTime: 30, ingredient: 'quick-cooking rice' },
  { label: 'beginner', skillLevel: 'beginner', ingredient: 'olive oil' },
  { label: 'stovetop', equipment: ['stovetop'], ingredient: 'canned tomatoes' },
  { label: 'two servings', servings: 2, ingredient: 'fresh herbs' }
];

// Ten representative dishes x five constraint packs gives a stable, offline
// 50-prompt regression suite. It intentionally validates deterministic rules,
// not a live model or an external service.
const cases = prompts.flatMap(([dish, cuisine]) => constraintPacks.map((pack) => ({
  id: `${dish.replaceAll(' ', '-')}-${pack.label.replaceAll(' ', '-')}`,
  prompt: `${dish} (${pack.label})`,
  cuisine,
  constraints: pack,
  recipe: {
    name: dish,
    cuisine,
    ingredients: ['1 cup rice', '1 cup vegetables', `2 tablespoons ${pack.ingredient}`],
    instructions: [
      'Prepare the rice according to the package directions.',
      'Cook the vegetables with the rice until tender.',
      `Stir in the ${pack.ingredient} and serve.`
    ],
    prepTime: '10 minutes',
    cookTime: '20 minutes',
    totalTime: '30 minutes',
    servings: pack.servings || 4
  }
})));

describe('offline generative quality evaluation suite', () => {
  it('contains 50 prompts across diet, time, skill, equipment, and serving constraints', () => {
    expect(cases).toHaveLength(50);
    expect(new Set(cases.map(({ constraints }) => constraints.label))).toEqual(new Set([
      'vegetarian', 'weeknight', 'beginner', 'stovetop', 'two servings'
    ]));
  });

  it.each(cases)('$id satisfies deterministic quality rules', ({ recipe }) => {
    const result = evaluateRecipeQuality(recipe);
    expect(result.passed).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(95);
    expect(result.checks.hasIngredients.status).toBe('passed');
    expect(result.checks.hasInstructions.status).toBe('passed');
  });

  it('catches catastrophic empty output regressions', () => {
    expect(evaluateRecipeQuality({ name: 'No ingredients', instructions: ['Serve.'] }).passed).toBe(false);
    expect(evaluateRecipeQuality({ name: 'No instructions', ingredients: ['1 cup rice'] }).passed).toBe(false);
  });
});
