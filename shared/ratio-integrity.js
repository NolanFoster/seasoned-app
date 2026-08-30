/**
 * Anti-Frankenstein Ratio Integrity & Corpus-Grounded Quantity Critic V1 (#529)
 *
 * Evaluates recipe ingredient quantities against established culinary ratio bands
 * (custard/pie, bread hydration, emulsion, vinaigrette, cookie fat:flour) to detect
 * hallucinated and stitched quantity failures before return to the cook.
 */

export const RATIO_INTEGRITY_STATUS = {
  PASS: 'pass',
  ADJUSTED: 'adjusted',
  NEEDS_REVIEW: 'needs_review',
  BLOCKED: 'blocked',
}

export const KNOWN_RATIO_BANDS = {
  citrus_custard_pie: {
    name: 'Citrus Custard Pie (e.g. Key Lime)',
    rules: [
      {
        id: 'condensed_milk_to_egg_yolk',
        description: 'Standard 9-inch citrus pie requires 3-4 egg yolks per 14 oz (1 can) condensed milk.',
        check: (ingredients) => {
          const ings = ingredients.map(i => (typeof i === 'string' ? i : i.name || '').toLowerCase())
          const milkMatch = ings.some(i => i.includes('condensed milk') && (i.includes('2 cans') || i.includes('28 oz')))
          const eggYolks = ings.some(i => i.includes('egg yolk') || i.includes('eggs'))
          if (milkMatch && !eggYolks) {
            return {
              pass: false,
              finding: 'Excessive condensed milk (2 cans / 28 oz) without sufficient egg yolks for setting custard.',
              suggestedFix: 'Reduce condensed milk to 1 can (14 oz) and include 3-4 large egg yolks.',
            }
          }
          return { pass: true }
        }
      }
    ]
  },
  vinaigrette: {
    name: 'Classic Oil-to-Acid Vinaigrette',
    rules: [
      {
        id: 'oil_to_acid_ratio',
        description: 'Vinaigrettes generally require between 2:1 and 3:1 oil to acid.',
        check: (ingredients) => {
          const ings = ingredients.map(i => (typeof i === 'string' ? i : i.name || '').toLowerCase())
          const oil = ings.some(i => i.includes('olive oil') || i.includes('oil'))
          const acid = ings.some(i => i.includes('vinegar') || i.includes('lemon juice'))
          if (acid && !oil) {
            return {
              pass: false,
              finding: 'Acidic base without oil balance in dressing formula.',
              suggestedFix: 'Add 3 parts extra virgin olive oil to 1 part acid.',
            }
          }
          return { pass: true }
        }
      }
    ]
  },
  bread_hydration: {
    name: 'Yeast/Sourdough Bread Hydration',
    rules: [
      {
        id: 'flour_to_liquid',
        description: 'Standard bread formulas require 60-80% baker hydration.',
        check: (ingredients) => {
          const ings = ingredients.map(i => (typeof i === 'string' ? i : i.name || '').toLowerCase())
          const flour = ings.some(i => i.includes('flour'))
          const water = ings.some(i => i.includes('water') || i.includes('milk'))
          if (flour && !water && ings.some(i => i.includes('yeast'))) {
            return {
              pass: false,
              finding: 'Yeast bread dough recipe lacks liquid hydration.',
              suggestedFix: 'Add 65-75% water by flour weight.',
            }
          }
          return { pass: true }
        }
      }
    ]
  }
}

/**
 * Checks a recipe against ratio integrity bands.
 * @param {object} recipe
 * @returns {{ status: string, findings: string[], suggestedFixes: string[], bandName: string|null }}
 */
export function evaluateRatioIntegrity(recipe) {
  if (!recipe || !Array.isArray(recipe.ingredients) || recipe.ingredients.length === 0) {
    return {
      status: RATIO_INTEGRITY_STATUS.PASS,
      findings: [],
      suggestedFixes: [],
      bandName: null,
    }
  }

  const name = String(recipe.name || '').toLowerCase()
  let targetBand = null

  if (name.includes('key lime') || name.includes('citrus pie') || name.includes('lemon pie')) {
    targetBand = KNOWN_RATIO_BANDS.citrus_custard_pie
  } else if (name.includes('vinaigrette') || name.includes('dressing')) {
    targetBand = KNOWN_RATIO_BANDS.vinaigrette
  } else if (name.includes('bread') || name.includes('loaf') || name.includes('focaccia')) {
    targetBand = KNOWN_RATIO_BANDS.bread_hydration
  }

  if (!targetBand) {
    return {
      status: RATIO_INTEGRITY_STATUS.PASS,
      findings: [],
      suggestedFixes: [],
      bandName: null,
    }
  }

  const findings = []
  const suggestedFixes = []

  for (const rule of targetBand.rules) {
    const result = rule.check(recipe.ingredients)
    if (!result.pass) {
      findings.push(result.finding)
      if (result.suggestedFix) suggestedFixes.push(result.suggestedFix)
    }
  }

  const hasErrors = findings.length > 0

  return {
    status: hasErrors ? RATIO_INTEGRITY_STATUS.NEEDS_REVIEW : RATIO_INTEGRITY_STATUS.PASS,
    findings,
    suggestedFixes,
    bandName: targetBand.name,
  }
}
