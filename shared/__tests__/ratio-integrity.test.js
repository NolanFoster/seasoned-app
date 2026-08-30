import { describe, it, expect } from 'vitest'
import {
  RATIO_INTEGRITY_STATUS,
  evaluateRatioIntegrity,
} from '../ratio-integrity.js'

describe('ratio-integrity critic', () => {
  it('flags a stitched Frankenstein key lime pie recipe with excessive condensed milk and missing yolks', () => {
    const badPie = {
      name: 'Classic Key Lime Pie',
      ingredients: [
        '2 cans condensed milk',
        '1/2 cup key lime juice',
        '1 graham cracker crust',
      ],
      instructions: ['Mix and pour into crust.'],
    }

    const report = evaluateRatioIntegrity(badPie)
    expect(report.status).toBe(RATIO_INTEGRITY_STATUS.NEEDS_REVIEW)
    expect(report.findings[0]).toContain('Excessive condensed milk')
    expect(report.suggestedFixes[0]).toContain('3-4 large egg yolks')
  })

  it('passes a well-balanced key lime pie recipe', () => {
    const goodPie = {
      name: 'Traditional Key Lime Pie',
      ingredients: [
        '1 can (14 oz) sweetened condensed milk',
        '4 egg yolks',
        '1/2 cup fresh key lime juice',
        '1 tbsp lime zest',
        '1 graham cracker crust',
      ],
      instructions: ['Whisk yolks, milk, and lime juice. Bake 15 mins at 350F.'],
    }

    const report = evaluateRatioIntegrity(goodPie)
    expect(report.status).toBe(RATIO_INTEGRITY_STATUS.PASS)
    expect(report.findings).toHaveLength(0)
  })
})
