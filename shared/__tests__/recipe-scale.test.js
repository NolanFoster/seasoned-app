import { describe, it, expect } from 'vitest'
import {
  parseServings,
  formatYield,
  formatQuantity,
  scaleIngredientLine,
  scaleRecipe,
} from '../recipe-scale.js'

describe('recipe-scale', () => {
  it('parses a yield and rewrites the number in place', () => {
    expect(parseServings('Serves 8')).toBe(8)
    expect(parseServings(6)).toBe(6)
    expect(parseServings('a crowd')).toBeNull()
    expect(formatYield('Serves 6-8', 14)).toBe('Serves 14')
    expect(formatYield('4', 12)).toBe('12')
  })

  it('scales leading quantities, mixed numbers, and unicode fractions', () => {
    expect(scaleIngredientLine('2 cups stock', 2).line).toBe('4 cups stock')
    expect(scaleIngredientLine('1/2 tsp salt', 2).line).toBe('1 tsp salt')
    expect(scaleIngredientLine('1 1/2 cups broth', 2).line).toBe('3 cups broth')
    expect(scaleIngredientLine('½ onion', 2).line).toBe('1 onion')
    expect(scaleIngredientLine('200g spaghetti', 2).line).toBe('400g spaghetti')
    expect(scaleIngredientLine('3-4 cloves garlic', 2).line).toBe('6–8 cloves garlic')
  })

  it('leaves unparsed lines alone', () => {
    const result = scaleIngredientLine('Salt to taste', 2)
    expect(result.scaled).toBe(false)
    expect(result.line).toBe('Salt to taste')
  })

  it('scales a saved recipe and reports lines it could not rewrite', () => {
    const result = scaleRecipe({
      id: 'stuffing',
      name: 'Stuffing',
      recipe_yield: '8 servings',
      ingredients: ['2 cups broth', '1/2 cup butter', 'Salt to taste'],
    }, 12)

    expect(result.ok).toBe(true)
    expect(result.factor).toBe(1.5)
    expect(result.recipe.recipe_yield).toBe('12 servings')
    expect(result.recipe.ingredients[0]).toBe('3 cups broth')
    expect(result.recipe.ingredients[1]).toBe('3/4 cup butter')
    expect(result.unscaled).toEqual(['Salt to taste'])
    expect(result.recipe.scaleNote).toMatch(/8 to 12/)
    expect(result.recipe.scaleNote).toMatch(/temperatures are unchanged/)
  })

  it('refuses a missing yield or an out-of-range guest count', () => {
    expect(scaleRecipe({ name: 'Pie', ingredients: ['1 pie crust'] }, 8).ok).toBe(false)
    expect(scaleRecipe({ name: 'Pie', recipe_yield: '8', ingredients: [] }, 0).ok).toBe(false)
    expect(scaleRecipe({ name: 'Pie', recipe_yield: '8', ingredients: [] }, 60).ok).toBe(false)
  })

  it('formats awkward quantities as decimals', () => {
    expect(formatQuantity(1.2)).toBe('1.2')
    expect(formatQuantity(0.5)).toBe('1/2')
  })
})
