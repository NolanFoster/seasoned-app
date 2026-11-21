import { describe, it, expect } from 'vitest'
import {
  RECONCILE_DIFF_TYPES,
  reconcileGroceryArrival,
} from '../grocery-reconciliation.js'

describe('grocery-reconciliation helpers', () => {
  it('identifies exact matches, substitutions, and missing items', () => {
    const ordered = [
      { name: 'Oat Milk' },
      { name: 'Roma Tomatoes' },
      { name: 'Fresh Cilantro' },
    ]

    const arrived = [
      { name: 'Oat Milk' },
      { name: 'Heirloom Tomatoes' }, // sub for Roma Tomatoes
    ]

    const diffs = reconcileGroceryArrival(ordered, arrived)
    expect(diffs).toHaveLength(3)
    expect(diffs[0].type).toBe(RECONCILE_DIFF_TYPES.MATCH)
    expect(diffs[1].type).toBe(RECONCILE_DIFF_TYPES.SUBSTITUTION)
    expect(diffs[1].orderedName).toBe('Roma Tomatoes')
    expect(diffs[1].arrivedName).toBe('Heirloom Tomatoes')
    expect(diffs[2].type).toBe(RECONCILE_DIFF_TYPES.MISSING)
    expect(diffs[2].orderedName).toBe('Fresh Cilantro')
  })

  it('flags substitutions that violate hard allergen constraints', () => {
    const ordered = [{ name: 'Oat Milk' }]
    const arrived = [{ name: 'Almond Milk' }]

    const diffs = reconcileGroceryArrival(ordered, arrived, { hardAllergens: ['almond'] })
    expect(diffs[0].type).toBe(RECONCILE_DIFF_TYPES.SUBSTITUTION)
    expect(diffs[0].allergenConflict).toBe(true)
  })
})
