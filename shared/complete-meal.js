/**
 * Complete-meal composer helpers: suggests complementary sides, sauces, and starches
 * paired to a hero dish while enforcing cuisine coherence and allergen safety.
 */

export const COMPONENT_SLOTS = {
  SIDE_VEG: 'side_veg',
  STARCH: 'starch',
  SAUCE: 'sauce',
}

const CUISINE_SIDE_PAIRINGS = {
  italian: [
    { name: 'Garlic Butter Green Beans', type: COMPONENT_SLOTS.SIDE_VEG, prepMinutes: 10, ingredients: ['Green beans', 'Garlic', 'Butter'], instructions: ['Sauté green beans in butter with minced garlic until tender-crisp.'] },
    { name: 'Herb Roasted Baby Potatoes', type: COMPONENT_SLOTS.STARCH, prepMinutes: 20, ingredients: ['Baby potatoes', 'Rosemary', 'Olive oil'], instructions: ['Toss potatoes with rosemary and olive oil; roast until golden.'] },
    { name: 'Lemon Herb Gremolata', type: COMPONENT_SLOTS.SAUCE, prepMinutes: 5, ingredients: ['Parsley', 'Lemon zest', 'Garlic', 'Olive oil'], instructions: ['Finely chop parsley and combine with lemon zest and olive oil.'] },
  ],
  mexican: [
    { name: 'Charred Cumin Lime Corn', type: COMPONENT_SLOTS.SIDE_VEG, prepMinutes: 10, ingredients: ['Sweet corn', 'Lime', 'Cumin', 'Cilantro'], instructions: ['Pan-sear sweet corn with cumin and finish with fresh lime juice.'] },
    { name: 'Cilantro Lime Rice', type: COMPONENT_SLOTS.STARCH, prepMinutes: 15, ingredients: ['Long grain rice', 'Cilantro', 'Lime juice'], instructions: ['Cook rice and fold in minced cilantro and fresh lime juice.'] },
    { name: 'Creamy Avocado Crema', type: COMPONENT_SLOTS.SAUCE, prepMinutes: 5, ingredients: ['Avocado', 'Sour cream', 'Lime', 'Salt'], instructions: ['Blend avocado with sour cream and lime juice until silky.'] },
  ],
  american: [
    { name: 'Crispy Roasted Asparagus', type: COMPONENT_SLOTS.SIDE_VEG, prepMinutes: 12, ingredients: ['Asparagus', 'Olive oil', 'Black pepper', 'Lemon'], instructions: ['Roast asparagus at 400F for 10 minutes; finish with lemon juice.'] },
    { name: 'Garlic Mashed Potatoes', type: COMPONENT_SLOTS.STARCH, prepMinutes: 15, ingredients: ['Yukon gold potatoes', 'Garlic', 'Cream', 'Butter'], instructions: ['Boil potatoes, mash with sautéed garlic, cream, and butter.'] },
    { name: 'Chive Peppercorn Pan Sauce', type: COMPONENT_SLOTS.SAUCE, prepMinutes: 8, ingredients: ['Shallot', 'Beef broth', 'Black peppercorns', 'Chives'], instructions: ['Deglaze pan with broth and simmer with cracked peppercorns and chives.'] },
  ],
}

/**
 * Detects approximate cuisine style of a hero recipe.
 * @param {object} heroRecipe
 * @returns {string}
 */
export function inferHeroCuisine(heroRecipe) {
  if (!heroRecipe) return 'american'
  const text = `${heroRecipe.name || ''} ${(heroRecipe.ingredients || []).join(' ')} ${(heroRecipe.instructions || []).join(' ')}`.toLowerCase()

  if (text.includes('pasta') || text.includes('parmesan') || text.includes('risotto') || text.includes('basil') || text.includes('marinara')) {
    return 'italian'
  }
  if (text.includes('taco') || text.includes('salsa') || text.includes('cilantro') || text.includes('cumin') || text.includes('tortilla')) {
    return 'mexican'
  }
  return 'american'
}

/**
 * Composes complementary sides, starches, and sauces for a hero dish.
 * Filters out items containing any prohibited hard allergens.
 * @param {object} heroRecipe
 * @param {object} [options]
 * @param {string[]} [options.hardAllergens]
 * @param {string[]} [options.slots]
 * @returns {Array<object>}
 */
export function composeMealSides(heroRecipe, options = {}) {
  if (!heroRecipe) return []
  const cuisine = inferHeroCuisine(heroRecipe)
  const availablePairings = CUISINE_SIDE_PAIRINGS[cuisine] || CUISINE_SIDE_PAIRINGS.american
  const requestedSlots = options.slots || [COMPONENT_SLOTS.SIDE_VEG, COMPONENT_SLOTS.STARCH, COMPONENT_SLOTS.SAUCE]
  const hardAllergens = (options.hardAllergens || []).map(a => a.toLowerCase())

  return availablePairings.filter((side) => {
    if (!requestedSlots.includes(side.type)) return false
    // Allergen safety filter
    const sideIngredients = side.ingredients.map(i => i.toLowerCase())
    const hasAllergen = hardAllergens.some(allergen =>
      sideIngredients.some(ing => ing.includes(allergen))
    )
    return !hasAllergen
  }).map((side, idx) => ({
    id: `side-${cuisine}-${idx}`,
    ...side,
    cuisine,
    timingOffsetMinutes: 0,
  }))
}
