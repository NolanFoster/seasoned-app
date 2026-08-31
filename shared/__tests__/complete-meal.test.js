import { describe, it, expect } from 'vitest'
import {
  COMPONENT_SLOTS,
  inferHeroCuisine,
  composeMealSides,
  pairSideToRecipeObject,
} from '../complete-meal.js'

describe('complete-meal composer helpers', () => {
  it('infers italian cuisine from pasta and parmesan keywords', () => {
    const hero = {
      name: 'Chicken Parmesan',
      ingredients: ['Chicken cutlets', 'Parmesan cheese', 'Marinara sauce'],
      instructions: ['Bake chicken with marinara and parmesan.'],
    }
    expect(inferHeroCuisine(hero)).toBe('italian')
  })

  it('infers mexican cuisine from taco and cilantro keywords', () => {
    const hero = {
      name: 'Steak Tacos',
      ingredients: ['Flank steak', 'Corn tortillas', 'Cilantro', 'Lime'],
      instructions: ['Sear steak and serve on warm tortillas with cilantro.'],
    }
    expect(inferHeroCuisine(hero)).toBe('mexican')
  })

  it('composes complementary sides matching the hero cuisine style', () => {
    const hero = {
      name: 'Grilled Ribeye Steak',
      ingredients: ['Ribeye steak', 'Salt', 'Black pepper'],
      instructions: ['Sear steak in cast iron skillet.'],
    }
    const sides = composeMealSides(hero)
    expect(sides.length).toBeGreaterThanOrEqual(2)
    expect(sides.some(s => s.type === COMPONENT_SLOTS.SIDE_VEG)).toBe(true)
    expect(sides.some(s => s.type === COMPONENT_SLOTS.STARCH)).toBe(true)
  })

  it('filters out side suggestions that violate hard allergens', () => {
    const hero = {
      name: 'Grilled Steak',
      ingredients: ['Steak'],
      instructions: ['Grill steak.'],
    }
    // Garlic Butter Green Beans and Garlic Mashed Potatoes contain garlic / dairy
    const sidesWithoutDairy = composeMealSides(hero, { hardAllergens: ['butter', 'cream'] })
    expect(sidesWithoutDairy.some(s => s.name.includes('Garlic Mashed Potatoes'))).toBe(false)
    expect(sidesWithoutDairy.some(s => s.name.includes('Crispy Roasted Asparagus'))).toBe(true)
  })

  it('transforms side pairing to a full recipe object', () => {
    const hero = { name: 'Roast Chicken', recipe_yield: '4 servings' }
    const side = {
      id: 'side-italian-0',
      name: 'Garlic Butter Green Beans',
      type: COMPONENT_SLOTS.SIDE_VEG,
      prepMinutes: 10,
      ingredients: ['Green beans', 'Garlic', 'Butter'],
      instructions: ['Sauté green beans in butter with minced garlic until tender-crisp.'],
    }
    const recipeObj = pairSideToRecipeObject(side, hero)
    expect(recipeObj.name).toBe('Garlic Butter Green Beans')
    expect(recipeObj.ingredients).toEqual(['Green beans', 'Garlic', 'Butter'])
    expect(recipeObj.instructions).toHaveLength(1)
    expect(recipeObj.recipe_yield).toBe('4 servings')
    expect(recipeObj.source).toBe('ai_generated')
  })

  it('handles empty or null parameters gracefully', () => {
    expect(composeMealSides(null)).toEqual([])
    expect(inferHeroCuisine(null)).toBe('american')
    expect(pairSideToRecipeObject(null)).toBeNull()

    const fallbackSide = { name: 'Basic Salad' }
    const defaultObj = pairSideToRecipeObject(fallbackSide)
    expect(defaultObj.name).toBe('Basic Salad')
    expect(defaultObj.prep_time).toBe('PT10M')
    expect(defaultObj.recipe_yield).toBe('4 servings')
  })

  it('filters by requested component slots', () => {
    const hero = { name: 'Pork Chop', ingredients: ['pork'] }
    const saucesOnly = composeMealSides(hero, { slots: [COMPONENT_SLOTS.SAUCE] })
    expect(saucesOnly.length).toBeGreaterThanOrEqual(1)
    expect(saucesOnly.every(s => s.type === COMPONENT_SLOTS.SAUCE)).toBe(true)
  })
})

