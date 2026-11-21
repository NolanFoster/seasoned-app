import { describe, it, expect } from 'vitest'
import {
  MEAL_MODES,
  COMPONENT_ROLES,
  normalizeMealAtom,
  extractMealGroceryLines,
} from '../meal-atom.js'

describe('meal-atom helpers', () => {
  it('normalizes a hybrid meal with shared base and divergent protein components', () => {
    const raw = {
      title: 'Taco Tuesday Hybrid Plate',
      mode: MEAL_MODES.HYBRID,
      components: [
        {
          name: 'Warm Corn Tortillas & Salsa',
          role: COMPONENT_ROLES.HERO,
          diners: 'all',
          ingredients: ['Corn tortillas', 'Salsa verde', 'Cilantro'],
        },
        {
          name: 'Seasoned Ground Beef',
          role: COMPONENT_ROLES.HERO,
          diners: ['omnivore-diner'],
          ingredients: ['Ground beef', 'Taco seasoning'],
        },
        {
          name: 'Spiced Black Beans & Mushrooms',
          role: COMPONENT_ROLES.HERO,
          diners: ['veg-diner'],
          ingredients: ['Black beans', 'Cremini mushrooms', 'Taco seasoning'],
        },
      ],
    }

    const meal = normalizeMealAtom(raw)
    expect(meal.title).toBe('Taco Tuesday Hybrid Plate')
    expect(meal.mode).toBe(MEAL_MODES.HYBRID)
    expect(meal.components).toHaveLength(3)
  })

  it('unions grocery ingredients without duplicate identical items', () => {
    const meal = {
      components: [
        { ingredients: ['Corn tortillas', 'Cilantro', 'Lime'] },
        { ingredients: ['Ground beef', 'Lime'] },
      ],
    }

    const lines = extractMealGroceryLines(meal)
    expect(lines).toHaveLength(4)
    expect(lines).toContain('Lime')
    expect(lines).toContain('Corn tortillas')
    expect(lines).toContain('Ground beef')
  })
})
