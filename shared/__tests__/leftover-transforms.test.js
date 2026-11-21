import { describe, it, expect } from 'vitest'
import {
  suggestLeftoverTransforms,
  TRANSFORMATION_TEMPLATES,
} from '../leftover-transforms.js'

describe('leftover-transforms helpers', () => {
  it('suggests distinct transformed dish identities for a roast chicken producer meal', () => {
    const producer = {
      name: 'Sunday Herb Roast Chicken',
      ingredients: ['1 whole chicken', 'rosemary', 'garlic', 'butter'],
    }

    const transforms = suggestLeftoverTransforms(producer)
    expect(transforms).toHaveLength(3)
    expect(transforms[0].title).toBe('Chicken Tinga Tacos')
    expect(transforms[0].requiresFresh).toContain('Tortillas')
    expect(transforms[0].lineageBadge).toContain('Sunday Herb Roast Chicken')

    expect(transforms[1].title).toBe('Quick Chicken Fried Rice')
  })

  it('suggests pork transforms for pork-based dishes', () => {
    const producer = {
      name: 'Slow Cooker Carnitas Pork',
      ingredients: ['Pork shoulder', 'Cumin', 'Orange'],
    }

    const transforms = suggestLeftoverTransforms(producer)
    expect(transforms[0].title).toBe('Pork Enchiladas Verde')
  })
})
