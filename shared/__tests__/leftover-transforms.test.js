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

  it('suggests turkey remixes instead of a vegetable frittata', () => {
    const producer = {
      name: 'Herb Roast Turkey',
      ingredients: ['1 whole turkey', 'butter', 'sage'],
    }

    const transforms = suggestLeftoverTransforms(producer)
    expect(transforms.map(t => t.title)).toEqual([
      'Thanksgiving Turkey Stock',
      'Cranberry Turkey Sandwich',
      'Turkey Pot Pie',
      'Turkey Hash with Eggs',
    ])
    expect(transforms[0].lineageBadge).toContain('Herb Roast Turkey')
    expect(transforms[0].requiresFresh).toContain('Onion')
    expect(transforms.every(t => !/frittata/i.test(t.title))).toBe(true)
  })

  it('matches turkey from the ingredient list when the title does not say turkey', () => {
    const transforms = suggestLeftoverTransforms({
      name: 'Thursday roast',
      ingredients: ['turkey breast', 'salt'],
    })
    expect(transforms[0].id).toBe('turkey_stock')
  })

  it('does not treat a chicken roast as turkey', () => {
    const transforms = suggestLeftoverTransforms({
      name: 'Roast chicken',
      ingredients: ['whole chicken'],
    })
    expect(transforms[0].title).toBe('Chicken Tinga Tacos')
  })
})
