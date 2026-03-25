/**
 * Meal plan migration utilities.
 * Handles detection and conversion of legacy flat-array format to the
 * new meal-type-organized format.
 */

export const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'];

export const MEAL_TYPE_DISPLAY = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
};

/**
 * Detects if stored meals are in legacy (flat array) format.
 * @param {any} stored - Value parsed from localStorage
 * @returns {boolean}
 */
export function isLegacyFormat(stored) {
  if (!stored || typeof stored !== 'object') return false;
  return Object.values(stored).some((v) => Array.isArray(v));
}

/**
 * Converts legacy flat-array format to new meal-type-organized format.
 * All recipes from the flat array migrate to 'lunch' by default.
 * @param {Object} legacy - Legacy meals object: { dateString: recipe[] }
 * @returns {Object} - New format meals object
 */
export function migrateFromLegacy(legacy) {
  const migrated = {};
  Object.entries(legacy).forEach(([dateString, recipes]) => {
    if (!Array.isArray(recipes)) {
      // Already new format for this date entry
      migrated[dateString] = recipes;
      return;
    }
    migrated[dateString] = {
      breakfast: [],
      lunch: recipes,
      dinner: [],
      snack: [],
    };
  });
  return migrated;
}

/**
 * Validates a meal type string against the known set.
 * @param {string} mealType
 * @returns {boolean}
 */
export function isValidMealType(mealType) {
  return MEAL_TYPES.includes(mealType);
}

/**
 * Returns a fresh empty day structure with arrays for every meal type.
 * @returns {{ breakfast: [], lunch: [], dinner: [], snack: [] }}
 */
export function createEmptyDay() {
  return {
    breakfast: [],
    lunch: [],
    dinner: [],
    snack: [],
  };
}
