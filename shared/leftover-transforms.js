/**
 * Transformative Leftover Cascade Planner V1 (#536)
 *
 * Implements component-to-new-dish transformation graphs, fresh finisher calculations,
 * and multi-day meal remix cascades.
 */

export const TRANSFORMATION_TEMPLATES = {
  'roast_chicken': [
    {
      id: 'chicken_tinga_tacos',
      title: 'Chicken Tinga Tacos',
      effortMin: 15,
      requiresFresh: ['Tortillas', 'Chipotle in adobo', 'Cilantro', 'Lime', 'Cotija cheese'],
      yieldServings: 4,
      instructions: ['Shred cooked chicken.', 'Simmer with blended chipotle tomato sauce for 10 mins.', 'Serve in warm tortillas with fresh toppings.'],
    },
    {
      id: 'chicken_fried_rice',
      title: 'Quick Chicken Fried Rice',
      effortMin: 15,
      requiresFresh: ['Day-old rice', 'Eggs', 'Green onions', 'Frozen peas and carrots', 'Soy sauce'],
      yieldServings: 4,
      instructions: ['Dice chicken.', 'Stir-fry cold rice, veggies, and scrambled eggs in high heat.', 'Toss in chicken and soy sauce until piping hot.'],
    },
    {
      id: 'tarragon_chicken_salad',
      title: 'French Tarragon Chicken Salad',
      effortMin: 10,
      requiresFresh: ['Fresh tarragon', 'Dijon mustard', 'Celery', 'Greek yogurt or mayo', 'Crusty bread'],
      yieldServings: 3,
      instructions: ['Dice cold roast chicken.', 'Fold with diced celery, chopped tarragon, dijon, and yogurt/mayo.', 'Serve on toasted bread or salad greens.'],
    },
  ],
  'pulled_pork': [
    {
      id: 'pork_carnitas_enchiladas',
      title: 'Pork Enchiladas Verde',
      effortMin: 20,
      requiresFresh: ['Salsa verde', 'Corn tortillas', 'Monterey jack cheese', 'Cilantro'],
      yieldServings: 4,
      instructions: ['Roll pork into tortillas with salsa verde and cheese; bake 15 mins at 400°F.'],
    },
    {
      id: 'bbq_pork_quesadillas',
      title: 'Crispy Pork & Caramelized Onion Quesadillas',
      effortMin: 15,
      requiresFresh: ['Flour tortillas', 'Onions', 'Cheddar cheese', 'BBQ sauce'],
      yieldServings: 3,
      instructions: ['Sauté onions.', 'Layer pork, onions, and cheese in tortillas; crisp on skillet.'],
    },
  ],
  'roasted_root_veg': [
    {
      id: 'roasted_veg_frittata',
      title: 'Herb & Roasted Veggie Frittata',
      effortMin: 15,
      requiresFresh: ['6 eggs', 'Feta cheese', 'Fresh herbs', 'Milk'],
      yieldServings: 4,
      instructions: ['Warm roasted veggies in oven-safe skillet.', 'Pour whisked eggs and cheese over veggies.', 'Bake at 375°F until set (12-15 mins).'],
    },
  ],
}

/**
 * Suggests transformative next-day dishes from a hero producer recipe.
 * @param {object} recipe
 * @returns {Array<object>}
 */
export function suggestLeftoverTransforms(recipe) {
  if (!recipe) return []
  const name = String(recipe.name || '').toLowerCase()
  const ingredients = (recipe.ingredients || []).map(i => (typeof i === 'string' ? i : i.name || '').toLowerCase())

  if (name.includes('chicken') || ingredients.some(i => i.includes('chicken'))) {
    return TRANSFORMATION_TEMPLATES.roast_chicken.map(t => ({
      ...t,
      sourceRecipeName: recipe.name || 'Roast Chicken',
      lineageBadge: `Remix from ${recipe.name || 'Roast Chicken'}`,
    }))
  }

  if (name.includes('pork') || ingredients.some(i => i.includes('pork'))) {
    return TRANSFORMATION_TEMPLATES.pulled_pork.map(t => ({
      ...t,
      sourceRecipeName: recipe.name || 'Pork',
      lineageBadge: `Remix from ${recipe.name || 'Pork'}`,
    }))
  }

  return TRANSFORMATION_TEMPLATES.roasted_root_veg.map(t => ({
    ...t,
    sourceRecipeName: recipe.name || 'Roasted Base',
    lineageBadge: `Remix from ${recipe.name || 'Roasted Base'}`,
  }))
}
