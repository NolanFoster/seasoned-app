import { describe, it, expect } from 'vitest'
import {
  COMPONENT_SLOTS,
  inferHeroCuisine,
  composeMealSides,
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
})
