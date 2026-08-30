/**
 * Coarse regional ingredient cost heuristics for budget constraint estimation.
 * Estimated cost per standard unit in USD.
 */
export const BUDGET_BANDS = Object.freeze(['low', 'medium', 'flexible'])

export const INGREDIENT_COST_ESTIMATES = Object.freeze({
  // Staples / Low cost
  rice: 0.15,
  beans: 0.20,
  pasta: 0.25,
  lentils: 0.20,
  potato: 0.30,
  onion: 0.30,
  carrot: 0.25,
  cabbage: 0.30,
  egg: 0.25,
  flour: 0.10,
  oats: 0.15,
  bread: 0.30,
  canned_tomatoes: 0.50,
  canned_beans: 0.60,
  garlic: 0.20,

  // Moderate
  tofu: 1.00,
  chicken_thigh: 1.25,
  chicken_breast: 1.75,
  ground_turkey: 1.50,
  pork_chop: 1.50,
  ground_beef: 2.00,
  milk: 0.50,
  cheese: 1.00,
  yogurt: 0.75,
  broccoli: 0.80,
  spinach: 0.90,
  bell_pepper: 0.75,
  apple: 0.50,
  banana: 0.25,

  // Specialty / Premium / High
  salmon: 4.00,
  shrimp: 3.50,
  steak: 5.00,
  pine_nuts: 4.00,
  saffron: 8.00,
  truffle: 10.00,
  parmesan_reggiano: 3.00,
  avocado: 1.25,
})

/**
 * Estimate the relative cost band and rough total cost for a recipe.
 * @param {Object} recipe 
 * @returns {{ costBand: 'low' | 'medium' | 'high', estimatedCostPerServingUsd: number, disclaimer: string }}
 */
export function estimateRecipeCost(recipe = {}) {
  const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : []
  const servings = Number(recipe.servings) || 4

  let estimatedTotalUsd = 0
  let specialtyItemCount = 0

  ingredients.forEach((ing) => {
    const text = (typeof ing === 'string' ? ing : ing?.name || ing?.text || '').toLowerCase()
    
    let matchedCost = 0.75 // Default moderate base per ingredient line
    
    for (const [key, cost] of Object.entries(INGREDIENT_COST_ESTIMATES)) {
      const normalizedKey = key.replace(/_/g, ' ')
      if (text.includes(normalizedKey)) {
        matchedCost = cost
        if (cost >= 3.00) {
          specialtyItemCount += 1
        }
        break
      }
    }
    estimatedTotalUsd += matchedCost
  })

  // Scale roughly by servings (assuming 4 is standard baseline batch)
  const servingMultiplier = Math.max(1, servings) / 4
  const finalTotal = estimatedTotalUsd * servingMultiplier
  const perServing = Math.round((finalTotal / Math.max(1, servings)) * 100) / 100

  let costBand = 'medium'
  if (perServing < 2.50 && specialtyItemCount === 0) {
    costBand = 'low'
  } else if (perServing > 5.50 || specialtyItemCount >= 2) {
    costBand = 'high'
  }

  return {
    costBand,
    estimatedCostPerServingUsd: perServing,
    estimatedTotalUsd: Math.round(finalTotal * 100) / 100,
    disclaimer: 'Estimated cost based on regional pantry staples. Actual prices at checkout vary.'
  }
}
