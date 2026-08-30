/**
 * Canonical seasonal produce heuristics and climate-smart guides (#347)
 */

export const HEMISPHERES = Object.freeze(['n', 's']);
export const CLIMATE_BIASES = Object.freeze(['off', 'prefer_lower_impact', 'flexitarian_nudge']);

// Northern hemisphere produce matrix (1 = Jan, 12 = Dec)
const NORTHERN_SEASONAL_PRODUCE = {
  spring: ['asparagus', 'peas', 'spinach', 'strawberries', 'radishes', 'artichokes', 'rhubarb'],
  summer: ['tomatoes', 'zucchini', 'corn', 'berries', 'peaches', 'peppers', 'eggplant', 'cucumbers', 'basil'],
  fall: ['apples', 'pumpkins', 'squash', 'kale', 'sweet potatoes', 'cranberries', 'mushrooms', 'pears'],
  winter: ['citrus', 'oranges', 'grapefruit', 'cabbage', 'carrots', 'beets', 'parsnips', 'brussels sprouts', 'leeks']
};

export function getSeasonForMonth(month, hemisphere = 'n') {
  const m = Number(month);
  if (m < 1 || m > 12) {
    throw new Error('Month must be between 1 and 12');
  }

  let season = 'winter';
  if (m >= 3 && m <= 5) season = 'spring';
  else if (m >= 6 && m <= 8) season = 'summer';
  else if (m >= 9 && m <= 11) season = 'fall';
  else season = 'winter';

  if (hemisphere === 's') {
    const sMap = { spring: 'fall', summer: 'winter', fall: 'spring', winter: 'summer' };
    return sMap[season];
  }

  return season;
}

export function getPeakProduce(month, hemisphere = 'n') {
  const season = getSeasonForMonth(month, hemisphere);
  return NORTHERN_SEASONAL_PRODUCE[season] || [];
}

export function getSeasonalitySummary(month = new Date().getMonth() + 1, hemisphere = 'n') {
  const season = getSeasonForMonth(month, hemisphere);
  const peak = getPeakProduce(month, hemisphere);
  return {
    season,
    hemisphere,
    peakProduce: peak,
    label: `${season.charAt(0).toUpperCase() + season.slice(1)} Peak Produce (${hemisphere === 'n' ? 'Northern' : 'Southern'} Hemisphere)`
  };
}
