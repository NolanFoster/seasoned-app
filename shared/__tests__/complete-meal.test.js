import { describe, it, expect } from 'vitest'
import {
  COMPONENT_SLOTS,
  inferHeroCuisine,
  composeMealSides,
  pairSideToRecipeObject,
  normalizeGeneratedSides,
  completeWithCuratedSides,
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

  const heroesByCuisine = {
    italian: { name: 'Spaghetti Marinara', ingredients: ['Spaghetti', 'Marinara sauce', 'Basil'] },
    mexican: { name: 'Chicken Tacos', ingredients: ['Chicken thighs', 'Corn tortillas', 'Salsa'] },
    american: { name: 'Grilled Ribeye Steak', ingredients: ['Ribeye steak', 'Salt'] },
    asian: { name: 'Beef Stir Fry', ingredients: ['Flank steak', 'Soy sauce', 'Fresh ginger', 'Sesame oil'] },
    indian: { name: 'Chicken Tikka Masala', ingredients: ['Chicken', 'Garam masala', 'Turmeric', 'Cilantro', 'Cumin'] },
    mediterranean: { name: 'Chicken Shawarma', ingredients: ['Chicken thighs', 'Sumac', 'Pita', 'Tahini'] },
  }

  it.each(Object.entries(heroesByCuisine))('infers %s cuisine from its signature keywords', (cuisine, hero) => {
    expect(inferHeroCuisine(hero)).toBe(cuisine)
  })

  it.each(Object.entries(heroesByCuisine))('offers a complete, cookable %s pairing for every slot', (cuisine, hero) => {
    const sides = composeMealSides(hero)
    expect(sides.map((s) => s.type).sort()).toEqual(Object.values(COMPONENT_SLOTS).sort())
    for (const side of sides) {
      expect(side.cuisine).toBe(cuisine)
      expect(side.description.length).toBeGreaterThan(30)
      expect(side.ingredients.length).toBeGreaterThanOrEqual(5)
      expect(side.instructions.length).toBeGreaterThanOrEqual(4)
      // Every ingredient carries a measurement rather than a bare name
      for (const ing of side.ingredients) {
        expect(ing).toMatch(/^(\d|Pinch)/)
      }
      expect(side.prepMinutes).toBeGreaterThan(0)
      expect(side.cookMinutes).toBeGreaterThanOrEqual(0)
    }
  })

  it('uses stable ids that survive allergen filtering', () => {
    const hero = heroesByCuisine.american
    const all = composeMealSides(hero)
    const filtered = composeMealSides(hero, { hardAllergens: ['dairy'] })
    for (const side of filtered) {
      expect(all.find((s) => s.name === side.name).id).toBe(side.id)
    }
  })

  it('filters canonical allergen categories through the allergen graph', () => {
    const noDairy = composeMealSides(heroesByCuisine.american, { hardAllergens: ['dairy'] })
    expect(noDairy.map((s) => s.name)).toEqual(['Crispy Roasted Asparagus'])

    const noSoy = composeMealSides(heroesByCuisine.asian, { hardAllergens: ['soy'] })
    expect(noSoy.map((s) => s.name)).toEqual(['Ginger Scallion Jasmine Rice'])

    const noGluten = composeMealSides(heroesByCuisine.mediterranean, { hardAllergens: ['gluten'] })
    expect(noGluten.some((s) => s.name === 'Herbed Lemon Couscous')).toBe(false)
  })

  it('carries full timings, description, and allergen summary into the recipe object', () => {
    const hero = {
      name: 'Grilled Ribeye Steak',
      ingredients: ['Ribeye steak'],
      appliedConstraints: { hardAllergens: ['eggs'] },
    }
    const [side] = composeMealSides(hero, { slots: [COMPONENT_SLOTS.STARCH] })
    const recipeObj = pairSideToRecipeObject(side, hero)
    expect(recipeObj.prep_time).toBe(`PT${side.prepMinutes}M`)
    expect(recipeObj.cook_time).toBe(`PT${side.cookMinutes}M`)
    expect(recipeObj.total_time).toBe(`PT${side.prepMinutes + side.cookMinutes}M`)
    expect(recipeObj.description).toContain(side.description)
    expect(recipeObj.description).toContain('Pairs with Grilled Ribeye Steak.')
    expect(recipeObj.instructions).toEqual(side.instructions)
    expect(recipeObj.allergenSummary.safe).toBe(true)
  })

  it('omits cook time for no-cook sauces', () => {
    const [sauce] = composeMealSides(heroesByCuisine.italian, { slots: [COMPONENT_SLOTS.SAUCE] })
    const recipeObj = pairSideToRecipeObject(sauce)
    expect(recipeObj.cook_time).toBeUndefined()
    expect(recipeObj.prep_time).toBe(`PT${sauce.prepMinutes}M`)
  })

  describe('generated pairings', () => {
    const hero = { name: 'Grilled Ribeye Steak', ingredients: ['2 ribeye steaks'] }
    const rawSide = (overrides = {}) => ({
      name: 'Blistered Shishito Peppers',
      type: 'side_veg',
      description: 'Smoky charred peppers.',
      prepMinutes: 5,
      cookMinutes: 8,
      ingredients: ['8 oz shishito peppers', '1 tbsp neutral oil', '1/2 lime'],
      instructions: ['Heat a skillet.', 'Blister the peppers.'],
      ...overrides,
    })

    it('normalizes valid model output into curated-side shape', () => {
      const [side] = normalizeGeneratedSides([rawSide({ type: 'Side Veg', prepMinutes: '7', cookMinutes: 999 })], hero)
      expect(side).toMatchObject({
        id: 'side-ai-blistered-shishito-peppers',
        type: COMPONENT_SLOTS.SIDE_VEG,
        prepMinutes: 7,
        cookMinutes: 240,
        cuisine: 'american',
        generated: true,
      })
    })

    it('rejects unknown slots, incomplete recipes, duplicates, and allergen conflicts', () => {
      const sides = normalizeGeneratedSides([
        null,
        rawSide({ type: 'dessert' }),
        rawSide({ type: 'starch', ingredients: ['rice'] }),
        rawSide({ type: 'starch', instructions: ['Cook.'] }),
        rawSide(),
        rawSide({ name: 'Second Veg' }),
        rawSide({ type: 'sauce', name: 'Peanut Sauce', ingredients: ['1/2 cup peanut butter', '1 lime', '1 tbsp honey'] }),
      ], hero, { hardAllergens: ['peanuts'] })
      expect(sides.map((s) => s.name)).toEqual(['Blistered Shishito Peppers'])
      expect(normalizeGeneratedSides('nope', hero)).toEqual([])
    })

    it('defaults a missing prep time and orders sides by slot', () => {
      const sides = normalizeGeneratedSides([
        rawSide({ type: 'sauce', name: 'Chimichurri', prepMinutes: 0 }),
        rawSide(),
      ], hero)
      expect(sides.map((s) => s.type)).toEqual([COMPONENT_SLOTS.SIDE_VEG, COMPONENT_SLOTS.SAUCE])
      expect(sides[1].prepMinutes).toBe(5)
    })

    it('fills missing slots from the curated pairings', () => {
      const generated = normalizeGeneratedSides([rawSide()], hero)
      const full = completeWithCuratedSides(generated, hero)
      expect(full.map((s) => s.name)).toEqual([
        'Blistered Shishito Peppers',
        'Garlic Mashed Potatoes',
        'Creamy Peppercorn Pan Sauce',
      ])
      const complete = normalizeGeneratedSides([
        rawSide(),
        rawSide({ type: 'starch', name: 'Smashed Potatoes' }),
        rawSide({ type: 'sauce', name: 'Chimichurri' }),
      ], hero)
      expect(completeWithCuratedSides(complete, hero)).toBe(complete)
      expect(completeWithCuratedSides(null, hero)).toHaveLength(3)
    })
  })
})
