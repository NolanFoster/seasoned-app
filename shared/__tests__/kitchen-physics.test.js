import { describe, it, expect } from 'vitest'
import {
  convertSaltMeasurement,
  applyHeatSourcePhysics,
  SALT_BRANDS,
  HEAT_SOURCES,
} from '../kitchen-physics.js'

describe('kitchen-physics helpers', () => {
  it('converts Diamond Crystal salt volume to Morton kosher salt equivalent', () => {
    // 1 tbsp Diamond Crystal (8.5g) ~ 0.6 tbsp Morton (14.2g per tbsp)
    const result = convertSaltMeasurement(1, SALT_BRANDS.DIAMOND_CRYSTAL, SALT_BRANDS.MORTON_KOSHER)
    expect(result.grams).toBe(8.5)
    expect(result.convertedTbsp).toBe(0.6)
    expect(result.note).toContain('diamond crystal')
  })

  it('adjusts boiling and pan heat cues for induction cooktops', () => {
    const rawStep = 'Bring water to a boil over high heat (about 10-12 mins).'
    const adapted = applyHeatSourcePhysics(rawStep, HEAT_SOURCES.INDUCTION)
    expect(adapted).toContain('approx 2-3 mins')
    expect(adapted).toContain('induction power mode')
  })
})
