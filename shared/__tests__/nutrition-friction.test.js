import { describe, it, expect } from 'vitest'
import {
  TRAFFIC_LIGHT_LEVELS,
  computeTrafficLights,
  computeNutritionConfidence,
  evaluateNutritionFrictionGate,
} from '../nutrition-friction.js'

describe('nutrition-friction helpers', () => {
  it('computes traffic lights correctly for low / medium / high values', () => {
    const nutrition = {
      fatContent: '2.5g',       // green (<= 3g)
      saturatedFatContent: '6.5g', // red (> 5g)
      sugarContent: '12g',      // amber (> 5g, <= 22.5g)
      sodiumContent: '850mg',   // red (> 600mg)
    }

    const lights = computeTrafficLights(nutrition)
    expect(lights.fat.level).toBe(TRAFFIC_LIGHT_LEVELS.GREEN)
    expect(lights.saturates.level).toBe(TRAFFIC_LIGHT_LEVELS.RED)
    expect(lights.sugars.level).toBe(TRAFFIC_LIGHT_LEVELS.AMBER)
    expect(lights.salt.level).toBe(TRAFFIC_LIGHT_LEVELS.RED)
    expect(lights.hasRedLight).toBe(true)
  })

  it('handles missing or partial nutrition with unknown status', () => {
    const lights = computeTrafficLights(null)
    expect(lights.fat.level).toBe(TRAFFIC_LIGHT_LEVELS.UNKNOWN)
    expect(lights.hasRedLight).toBe(false)
  })

  it('computes high/medium/low confidence from grounding coverage', () => {
    expect(computeNutritionConfidence({ coverage_pct: 95, uncertain_ingredients: [] })).toBe('high')
    expect(computeNutritionConfidence({ coverage_pct: 75 })).toBe('medium')
    expect(computeNutritionConfidence({ coverage_pct: 40 })).toBe('low')
    expect(computeNutritionConfidence(null)).toBe('unknown')
  })

  it('evaluates friction gate requirement for red lights or low confidence', () => {
    const gatedRecipe = {
      nutrition: {
        fatContent: '25g', // red
        saturatedFatContent: '10g', // red
        sodiumContent: '1200mg', // red
      },
      nutritionProvenance: { coverage_pct: 50 }, // low
    }

    const result = evaluateNutritionFrictionGate(gatedRecipe)
    expect(result.requiresGate).toBe(true)
    expect(result.reasons.length).toBe(2)
  })
})
