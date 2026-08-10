import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CULINARY_PROFILE,
  buildGenerationConstraints,
  mergeCulinaryProfile,
  normalizeCulinaryProfile,
  validateCulinaryProfileInput,
} from '../culinary-profile.js'

describe('culinary profile helpers', () => {
  it('normalizes structured tags and allergen aliases', () => {
    const profile = normalizeCulinaryProfile({
      dietTags: [' Vegetarian ', 'vegetarian'],
      hardAllergens: ['tree nuts', 'sesame', 'dairy'],
      equipment: ['Air Fryer'],
    })

    expect(profile.diet_tags).toEqual(['vegetarian'])
    expect(profile.hard_allergens).toEqual(['tree_nuts', 'sesame', 'milk'])
    expect(profile.equipment).toEqual(['air_fryer'])
  })

  it('merges partial updates without dropping existing preferences', () => {
    const merged = mergeCulinaryProfile(
      { diet_tags: ['vegan'], max_cook_time_min: 25 },
      { hard_allergens: ['sesame'], max_cook_time_min: 40 },
    )

    expect(merged.diet_tags).toEqual(['vegan'])
    expect(merged.hard_allergens).toEqual(['sesame'])
    expect(merged.max_cook_time_min).toBe(40)
  })

  it('applies explicit generation overrides before profile and defaults', () => {
    const constraints = buildGenerationConstraints(
      { diet_tags: ['vegan'], hard_allergens: ['peanuts'], default_servings: 2, max_cook_time_min: 25 },
      { dietary: ['vegetarian'], servings: 6 },
    )

    expect(constraints.dietary).toEqual(['vegetarian'])
    expect(constraints.hardAllergens).toEqual(['peanuts'])
    expect(constraints.servings).toBe(6)
    expect(constraints.maxCookTime).toBe(25)
  })

  it('returns safe defaults for an empty profile', () => {
    const constraints = buildGenerationConstraints()
    expect(constraints.dietary).toEqual(DEFAULT_CULINARY_PROFILE.diet_tags)
    expect(constraints.servings).toBe(4)
    expect(constraints.maxCookTime).toBe(60)
  })

  it('rejects malformed profile input', () => {
    expect(validateCulinaryProfileInput({ hard_allergens: ['sesame', 4] })).toContain('hard_allergens must be an array of strings')
    expect(validateCulinaryProfileInput({ skill_level: 'expert' })).toContain('skill_level must be beginner, intermediate, or advanced')
    expect(validateCulinaryProfileInput(null)).toEqual(['Profile must be a JSON object'])
  })
})
