/**
 * Canonical ingredient locale nomenclature and substitution proxy graph (#346)
 */

export const SUPPORTED_LOCALES = Object.freeze(['US', 'UK', 'AU', 'CA']);

// Mapping canonical US terminology to international regional naming
export const INGREDIENT_LOCALE_NAMES = Object.freeze({
  cilantro: { UK: 'fresh coriander', AU: 'coriander', CA: 'cilantro' },
  arugula: { UK: 'rocket', AU: 'rocket', CA: 'arugula' },
  scallions: { UK: 'spring onions', AU: 'spring onions', CA: 'green onions' },
  'green onions': { UK: 'spring onions', AU: 'spring onions', CA: 'green onions' },
  zucchini: { UK: 'courgette', AU: 'zucchini', CA: 'zucchini' },
  eggplant: { UK: 'aubergine', AU: 'eggplant', CA: 'eggplant' },
  'heavy cream': { UK: 'double cream', AU: 'thickened cream', CA: 'heavy whipping cream' },
  'all-purpose flour': { UK: 'plain flour', AU: 'plain flour', CA: 'all-purpose flour' },
  'powdered sugar': { UK: 'icing sugar', AU: 'icing sugar', CA: 'icing sugar' },
  'bell pepper': { UK: 'pepper', AU: 'capsicum', CA: 'bell pepper' },
  molasses: { UK: 'treacle', AU: 'treacle', CA: 'molasses' },
  canola_oil: { UK: 'rapeseed oil', AU: 'canola oil', CA: 'canola oil' }
});

// Proxies for harder to source specialty ingredients
export const INGREDIENT_PROXIES = Object.freeze({
  mirin: [
    { to: 'dry sherry with sugar', quality: 'equivalent', notes: '1 tbsp sherry + 1/2 tsp sugar' },
    { to: 'sweet white wine', quality: 'acceptable' }
  ],
  shaoxing_wine: [
    { to: 'dry sherry', quality: 'equivalent', notes: 'Direct 1:1 substitute' },
    { to: 'mirin without extra sugar', quality: 'acceptable' }
  ],
  fish_sauce: [
    { to: 'soy sauce with minced anchovy', quality: 'equivalent' },
    { to: 'tamari with lime juice', quality: 'acceptable' }
  ],
  buttermilk: [
    { to: 'milk with lemon juice or vinegar', quality: 'equivalent', notes: 'Let sit 5 mins to curdle' },
    { to: 'plain yogurt thinned with milk', quality: 'equivalent' }
  ],
  creme_fraiche: [
    { to: 'sour cream with heavy cream', quality: 'equivalent' },
    { to: 'greek yogurt', quality: 'acceptable' }
  ]
});

/**
 * Localize an ingredient name for a given target country
 */
export function getLocalizedIngredientName(ingredientName, country = 'US') {
  if (!ingredientName || typeof ingredientName !== 'string') return '';
  const key = ingredientName.trim().toLowerCase();
  const c = String(country).toUpperCase();

  if (INGREDIENT_LOCALE_NAMES[key] && INGREDIENT_LOCALE_NAMES[key][c]) {
    return INGREDIENT_LOCALE_NAMES[key][c];
  }

  return ingredientName.trim();
}

/**
 * Get available substitution proxies for an ingredient
 */
export function getIngredientProxies(ingredientName) {
  if (!ingredientName || typeof ingredientName !== 'string') return [];
  const key = ingredientName.trim().toLowerCase().replace(/[\s-]+/g, '_');
  return INGREDIENT_PROXIES[key] || [];
}
