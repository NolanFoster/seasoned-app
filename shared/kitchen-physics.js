/**
 * Seasoning Density & Heat-Source Physics Packs V1 (#532)
 *
 * Implements salt density conversion matrices (Diamond Crystal vs Morton vs Table)
 * and cooktop heat source modifiers (induction vs gas vs electric).
 */

export const SALT_BRANDS = {
  DIAMOND_CRYSTAL: 'diamond_crystal',
  MORTON_KOSHER: 'morton_kosher',
  TABLE_SALT: 'table',
  SEA_SALT: 'sea_flake',
}

// Grams per 1 US Tablespoon (15 ml)
export const SALT_GRAMS_PER_TBSP = {
  diamond_crystal: 8.5,
  morton_kosher: 14.2,
  table: 17.5,
  sea_flake: 10.0,
}

export const HEAT_SOURCES = {
  GAS: 'gas',
  INDUCTION: 'induction',
  ELECTRIC_COIL: 'electric_coil',
  GLASS_TOP: 'glass_top',
}

/**
 * Converts salt volume measurements between different salt brands and weights in grams.
 * @param {number} amountTbsp
 * @param {string} fromBrand
 * @param {string} toBrand
 * @returns {{ grams: number, convertedTbsp: number, note: string }}
 */
export function convertSaltMeasurement(amountTbsp, fromBrand = 'diamond_crystal', toBrand = 'morton_kosher') {
  const fromGramsPerTbsp = SALT_GRAMS_PER_TBSP[fromBrand] || SALT_GRAMS_PER_TBSP.diamond_crystal
  const toGramsPerTbsp = SALT_GRAMS_PER_TBSP[toBrand] || SALT_GRAMS_PER_TBSP.morton_kosher

  const totalGrams = Math.round(amountTbsp * fromGramsPerTbsp * 10) / 10
  const convertedTbsp = Math.round((totalGrams / toGramsPerTbsp) * 10) / 10

  return {
    grams: totalGrams,
    convertedTbsp,
    note: `${amountTbsp} tbsp ${fromBrand.replace('_', ' ')} ≈ ${convertedTbsp} tbsp ${toBrand.replace('_', ' ')} (${totalGrams}g)`,
  }
}

/**
 * Modifies cooking time cues based on cooktop physics.
 * @param {string} instruction
 * @param {string} heatSource
 * @returns {string}
 */
export function applyHeatSourcePhysics(instruction, heatSource = 'gas') {
  if (!instruction || typeof instruction !== 'string') return ''

  if (heatSource === 'induction') {
    return instruction
      .replace(/bring water to a boil over high heat \(about \d+-\d+ mins\)/gi, 'bring water to a boil over induction power mode (approx 2-3 mins)')
      .replace(/heat oil over medium-high heat for \d+ minutes/gi, 'heat oil on induction medium (heats rapidly, watch closely)')
  }

  return instruction
}
