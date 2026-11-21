/**
 * Produce Box & CSA Intake V1 (#535)
 *
 * Implements raw list/text parsing into produce items, storage tips coach,
 * shelf-life estimation, and box-coverage scoring for meal planning.
 */

export const PRODUCE_SHELF_LIFE_DAYS = {
  'kohlrabi': 14,
  'garlic scapes': 10,
  'bok choy': 5,
  'swiss chard': 4,
  'kale': 7,
  'spinach': 4,
  'arugula': 4,
  'radish': 10,
  'carrots': 21,
  'beets': 21,
  'zucchini': 7,
  'summer squash': 7,
  'cabbage': 21,
  'heirloom tomatoes': 5,
  'cilantro': 5,
  'parsley': 7,
  'dill': 5,
}

export const PRODUCE_STORAGE_TIPS = {
  'kohlrabi': 'Trim greens; store bulb in crisper drawer (2-3 weeks).',
  'garlic scapes': 'Wrap in a damp paper towel in a sealed container in the fridge.',
  'bok choy': 'Keep in a perforated plastic bag in the vegetable crisper (4-5 days).',
  'swiss chard': 'Store unwashed in a loose bag with a paper towel.',
  'kale': 'Wrap stems in damp towel or store in produce bag.',
  'heirloom tomatoes': 'Store at room temperature stem-side down; do not refrigerate unless very ripe.',
  'cilantro': 'Store upright in a jar with an inch of water, loosely covered in fridge.',
}

/**
 * Parses raw text lines from a CSA or farmers market produce share.
 * @param {string} rawText
 * @returns {Array<{ name: string, quantity: number, unit: string, shelfLifeDays: number, storageTip: string }>}
 */
export function parseProduceBoxLines(rawText) {
  if (!rawText || typeof rawText !== 'string') return []

  const lines = rawText.split('\n')
    .map(line => line.trim().replace(/^[-*•\d.)]+\s*/, ''))
    .filter(Boolean)

  return lines.map((rawLine) => {
    // Strip leading quantities like "1 bunch", "2 lbs", "3"
    const cleanedName = rawLine.replace(/^(\d+(\.\d+)?\s*(bunch|bunches|lb|lbs|bag|bags|heads?|pieces?)?\s*(of\s+)?)/i, '').trim()
    const name = cleanedName || rawLine
    const lower = name.toLowerCase()
    let matchedDays = 4 // conservative default for unknown fresh greens
    let matchedTip = 'Store in produce crisper drawer and consume early in the week.'

    for (const [key, days] of Object.entries(PRODUCE_SHELF_LIFE_DAYS)) {
      if (lower.includes(key)) {
        matchedDays = days
        break
      }
    }

    for (const [key, tip] of Object.entries(PRODUCE_STORAGE_TIPS)) {
      if (lower.includes(key)) {
        matchedTip = tip
        break
      }
    }

    return {
      name,
      quantity: 1,
      unit: 'bunch',
      shelfLifeDays: matchedDays,
      storageTip: matchedTip,
      identityConfidence: 'high',
    }
  })
}

/**
 * Calculates what percentage of ingredients in a recipe match produce in the box.
 * @param {object} recipe
 * @param {Array<{ name: string }>} boxItems
 * @returns {number} Score from 0 to 100
 */
export function calculateBoxCoverageScore(recipe, boxItems) {
  if (!recipe || !Array.isArray(recipe.ingredients) || !Array.isArray(boxItems) || boxItems.length === 0) {
    return 0
  }

  const boxNames = boxItems.map(item => (typeof item === 'string' ? item : item.name || '').toLowerCase())
  let matchedCount = 0

  for (const ing of recipe.ingredients) {
    const ingText = (typeof ing === 'string' ? ing : ing.name || '').toLowerCase()
    const matches = boxNames.some(b => b.length > 2 && ingText.includes(b))
    if (matches) matchedCount++
  }

  return Math.round((matchedCount / recipe.ingredients.length) * 100)
}
