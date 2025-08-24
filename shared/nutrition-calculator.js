/**
 * Nutrition Calculator - Shared Library
 * 
 * Calculates nutritional facts for recipes using the USDA FoodData Central API.
 * Handles ingredient lookup, quantity conversion, and nutrition aggregation.
 * 
 * @author Recipe App Team
 */

/**
 * Extract the number of servings from various recipe yield formats
 * @param {string|number} yieldValue - Recipe yield value (e.g., "6 large crab cakes", "4 servings", "Makes 8 servings")
 * @returns {number} Number of servings (defaults to 1 if cannot be determined)
 */
export function extractServingsFromYield(yieldValue) {
  if (!yieldValue) return 1;
  
  // If it's already a number, return it
  if (typeof yieldValue === 'number') return yieldValue;
  
  const yieldStr = String(yieldValue).toLowerCase().trim();
  
  // Handle empty strings
  if (yieldStr === '') return 1;
  
  // Common patterns for extracting servings
  const patterns = [
    // "6 large crab cakes" -> 6
    /^(\d+)\s+(?:large|medium|small|regular|standard)?\s*(?:crab\s+cakes?|cookies?|muffins?|pancakes?|waffles?|biscuits?|rolls?|slices?|pieces?|items?|portions?|servings?)/i,
    
    // "Makes 8 servings" -> 8
    /makes?\s+(\d+)\s*(?:servings?|portions?|people|cookies?|muffins?|pancakes?|waffles?|biscuits?|rolls?|slices?|pieces?|items?)/i,
    
    // "Serves 6 people" -> 6
    /serves?\s+(\d+)\s*(?:people|persons|guests?|servings?|portions?)/i,
    
    // "Serves about 4-6 people" -> 5 (average)
    /serves?\s+(?:about|approximately|roughly)?\s*(\d+)\s*-\s*(\d+)\s*(?:people|persons|guests?|servings?|portions?)/i,
    
    // "4 servings" -> 4
    /^(\d+)\s*(?:servings?|portions?|people|persons|guests?)/i,
    
    // "2-4 servings" -> 3 (average)
    /^(\d+)\s*-\s*(\d+)\s*(?:servings?|portions?|people|persons|guests?)/i,
    
    // "Yields 8-10 servings" -> 9 (average)
    /yields?\s+(?:about|approximately|roughly)?\s*(\d+)\s*-\s*(\d+)\s*(?:servings?|portions?|people|persons|guests?)/i,
    
    // "1 loaf" -> 1
    /^(\d+)\s*(?:loaf|loaves|cake|cakes|pie|pies|tart|tarts|pizza|pizzas|bread|roll|rolls|bun|buns)/i,
    
    // "12 cookies" -> 12
    /^(\d+)\s*(?:cookie|cookies|muffin|muffins|pancake|pancakes|waffle|waffles|biscuit|biscuits|roll|rolls|slice|slices|piece|pieces|item|items)/i,
    
    // Just a number
    /^(\d+)$/,
    
    // Number at the beginning of any string
    /^(\d+)/i
  ];
  
  for (const pattern of patterns) {
    const match = yieldStr.match(pattern);
    if (match) {
      if (match[2]) {
        // Handle ranges like "2-4 servings"
        const min = parseInt(match[1]);
        const max = parseInt(match[2]);
        return Math.round((min + max) / 2);
      } else {
        // Single number
        return parseInt(match[1]);
      }
    }
  }
  
  // If no pattern matches, try to find any number in the string
  const numberMatch = yieldStr.match(/\d+/);
  if (numberMatch) {
    return parseInt(numberMatch[0]);
  }
  
  // Default to 1 serving if we can't determine
  return 1;
}

/**
 * USDA FoodData Central API client for nutrition data
 */
class USDANutritionClient {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = 'https://api.nal.usda.gov/fdc/v1';
  }

  /**
   * Search for food items in USDA database
   * @param {string} query - Food search query
   * @param {number} pageSize - Number of results to return (default: 5)
   * @returns {Promise<Object>} Search results from USDA API
   */
  async searchFood(query, pageSize = 5) {
    const searchUrl = `${this.baseUrl}/foods/search`;
    const params = new URLSearchParams({
      query: query.trim(),
      pageSize: pageSize,
      api_key: this.apiKey,
      dataType: ['Foundation', 'SR Legacy'] // Focus on high-quality data
    });

    try {
      const response = await fetch(`${searchUrl}?${params}`);
      
      if (!response.ok) {
        throw new Error(`USDA API error: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error searching USDA food database:', error);
      throw error;
    }
  }

  /**
   * Get detailed nutrition information for a specific food item
   * @param {number} fdcId - FDC ID of the food item
   * @returns {Promise<Object>} Detailed food nutrition data
   */
  async getFoodDetails(fdcId) {
    const detailUrl = `${this.baseUrl}/food/${fdcId}`;
    const params = new URLSearchParams({
      api_key: this.apiKey
    });

    try {
      const response = await fetch(`${detailUrl}?${params}`);
      
      if (!response.ok) {
        throw new Error(`USDA API error: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error getting USDA food details:', error);
      throw error;
    }
  }
}

/**
 * Unit conversion utilities for ingredients
 */
const UnitConverter = {
  // Ingredient-specific densities (g/ml) for accurate volume-to-weight conversion
  ingredientDensities: {
    // Liquids and wet ingredients
    'water': 1.0,
    'milk': 1.03,
    'whole milk': 1.03,
    'skim milk': 1.033,
    'buttermilk': 1.03,
    'cream': 0.98,
    'heavy cream': 0.98,
    'whipping cream': 0.98,
    'sour cream': 1.0,
    'yogurt': 1.03,
    'greek yogurt': 1.1,
    
    // Oils and fats
    'oil': 0.92,
    'olive oil': 0.915,
    'vegetable oil': 0.92,
    'canola oil': 0.92,
    'coconut oil': 0.924,
    'butter': 0.911,
    'margarine': 0.91,
    'shortening': 0.867,
    'lard': 0.92,
    
    // Sweeteners
    'honey': 1.42,
    'maple syrup': 1.33,
    'corn syrup': 1.38,
    'molasses': 1.41,
    'agave': 1.32,
    
    // Vinegars and condiments
    'vinegar': 1.01,
    'apple cider vinegar': 1.01,
    'balsamic vinegar': 1.08,
    'soy sauce': 1.13,
    'ketchup': 1.14,
    'mayonnaise': 0.91,
    'mustard': 1.05,
    
    // Alcohols
    'wine': 0.99,
    'beer': 1.01,
    'spirits': 0.95,
    'vodka': 0.95,
    'rum': 0.95,
    'whiskey': 0.95,
    
    // Dry ingredients (when measured by volume)
    'flour': 0.593,
    'all-purpose flour': 0.593,
    'bread flour': 0.606,
    'cake flour': 0.496,
    'whole wheat flour': 0.606,
    'sugar': 0.849,
    'granulated sugar': 0.849,
    'brown sugar': 0.721,
    'powdered sugar': 0.561,
    'confectioners sugar': 0.561,
    
    // Salts and leaveners
    'salt': 1.217,
    'table salt': 1.217,
    'kosher salt': 0.608,
    'sea salt': 1.02,
    'baking powder': 0.721,
    'baking soda': 0.689,
    'yeast': 0.512,
    
    // Grains and starches
    'rice': 0.753,
    'white rice': 0.753,
    'brown rice': 0.88,
    'oats': 0.41,
    'rolled oats': 0.41,
    'quinoa': 0.658,
    'cornstarch': 0.629,
    'cornmeal': 0.673,
    
    // Nuts and seeds (roughly chopped)
    'almonds': 0.529,
    'walnuts': 0.481,
    'pecans': 0.449,
    'cashews': 0.545,
    'peanuts': 0.657,
    'sunflower seeds': 0.609,
    'sesame seeds': 0.641,
    'chia seeds': 0.61,
    'flax seeds': 0.673,
    
    // Other common ingredients
    'cocoa powder': 0.497,
    'protein powder': 0.449,
    'breadcrumbs': 0.241,
    'parmesan cheese': 0.561,
    'shredded cheese': 0.241
  },

  // Specific count/item weights for common ingredients
  specificItemWeights: {
    // Vegetables
    'garlic clove': 4,
    'garlic': 4,
    'onion small': 110,
    'onion medium': 170,
    'onion large': 285,
    'egg': 50,
    'egg large': 50,
    'egg medium': 44,
    'egg small': 38,
    
    // Fruits
    'lemon': 60,
    'lime': 44,
    'orange': 154,
    'apple': 182,
    'banana': 118,
    'strawberry': 12,
    'blueberry': 1,
    
    // Other items
    'slice bread': 25,
    'slice bacon': 8,
    'chicken breast': 174,
    'cookie': 16,
    'cracker': 3
  },

  // Common volume conversions to milliliters
  volumeToMl: {
    'ml': 1,
    'milliliter': 1,
    'milliliters': 1,
    'l': 1000,
    'liter': 1000,
    'liters': 1000,
    'cup': 236.588,
    'cups': 236.588,
    'tbsp': 14.787,
    'tablespoon': 14.787,
    'tablespoons': 14.787,
    'tsp': 4.929,
    'teaspoon': 4.929,
    'teaspoons': 4.929,
    'fl oz': 29.574,
    'fluid ounce': 29.574,
    'fluid ounces': 29.574,
    'pint': 473.176,
    'pints': 473.176,
    'quart': 946.353,
    'quarts': 946.353,
    'gallon': 3785.41,
    'gallons': 3785.41
  },

  // Common weight conversions to grams
  weightToGrams: {
    'g': 1,
    'gram': 1,
    'grams': 1,
    'kg': 1000,
    'kilogram': 1000,
    'kilograms': 1000,
    'oz': 28.3495,
    'ounce': 28.3495,
    'ounces': 28.3495,
    'lb': 453.592,
    'pound': 453.592,
    'pounds': 453.592
  },

  // Common count/serving conversions (approximate)
  countToGrams: {
    'small': 50,
    'medium': 100,
    'large': 150,
    'piece': 50,
    'pieces': 50,
    'item': 50,
    'items': 50,
    'serving': 100,
    'servings': 100,
    'slice': 30,
    'slices': 30,
    'clove': 4,
    'cloves': 4,
    'head': 150,
    'bunch': 150,
    'sprig': 2,
    'sprigs': 2,
    'leaf': 1,
    'leaves': 1,
    'stalk': 40,
    'stalks': 40
  },

  /**
   * Get the appropriate density for an ingredient
   * @param {string} ingredientName - Name of the ingredient
   * @returns {number} Density in g/ml
   */
  getDensityForIngredient(ingredientName) {
    const normalized = ingredientName.toLowerCase().trim();
    
    // Direct match
    if (this.ingredientDensities[normalized]) {
      return this.ingredientDensities[normalized];
    }
    
    // Check if ingredient contains key words
    for (const [key, density] of Object.entries(this.ingredientDensities)) {
      if (normalized.includes(key) || key.includes(normalized)) {
        return density;
      }
    }
    
    // Check for common patterns
    if (normalized.includes('flour')) return this.ingredientDensities['flour'];
    if (normalized.includes('sugar') && !normalized.includes('brown') && !normalized.includes('powdered')) return this.ingredientDensities['sugar'];
    if (normalized.includes('oil')) return this.ingredientDensities['oil'];
    if (normalized.includes('butter')) return this.ingredientDensities['butter'];
    if (normalized.includes('milk')) return this.ingredientDensities['milk'];
    if (normalized.includes('cream')) return this.ingredientDensities['cream'];
    if (normalized.includes('honey')) return this.ingredientDensities['honey'];
    if (normalized.includes('syrup')) return this.ingredientDensities['maple syrup'];
    
    // Default density
    return 1.0;
  },

  /**
   * Get specific weight for counted items
   * @param {string} ingredientName - Name of the ingredient
   * @param {string} unit - Unit of measurement
   * @returns {number|null} Weight in grams or null if not found
   */
  getSpecificItemWeight(ingredientName, unit) {
    const normalizedIngredient = ingredientName.toLowerCase().trim();
    const normalizedUnit = unit.toLowerCase().trim();
    
    // Check for specific item weights
    if (this.specificItemWeights[normalizedIngredient]) {
      return this.specificItemWeights[normalizedIngredient];
    }
    
    // Check for patterns like "garlic clove"
    const combined = `${normalizedIngredient} ${normalizedUnit}`;
    if (this.specificItemWeights[combined]) {
      return this.specificItemWeights[combined];
    }
    
    // Check if the unit contains size information
    if (normalizedUnit.includes('small') || normalizedUnit.includes('medium') || normalizedUnit.includes('large')) {
      const sizeKey = `${normalizedIngredient} ${normalizedUnit}`;
      if (this.specificItemWeights[sizeKey]) {
        return this.specificItemWeights[sizeKey];
      }
    }
    
    return null;
  },

  /**
   * Convert ingredient quantity to grams
   * @param {number} quantity - Quantity value
   * @param {string} unit - Unit of measurement
   * @param {string} ingredientName - Name of the ingredient (optional)
   * @param {number} customDensity - Custom density override (optional)
   * @returns {number} Weight in grams
   */
  convertToGrams(quantity, unit, ingredientName = '', customDensity = null) {
    const normalizedUnit = unit.toLowerCase().trim();
    
    // Direct weight conversion
    if (this.weightToGrams[normalizedUnit]) {
      return quantity * this.weightToGrams[normalizedUnit];
    }
    
    // Check for specific item weights first
    if (ingredientName) {
      const specificWeight = this.getSpecificItemWeight(ingredientName, normalizedUnit);
      if (specificWeight !== null) {
        return quantity * specificWeight;
      }
    }
    
    // Volume to weight conversion (using density)
    if (this.volumeToMl[normalizedUnit]) {
      const volumeMl = quantity * this.volumeToMl[normalizedUnit];
      // Use custom density, ingredient-specific density, or default
      const density = customDensity || 
                     (ingredientName ? this.getDensityForIngredient(ingredientName) : 1.0);
      return volumeMl * density;
    }
    
    // Count/serving conversion
    if (this.countToGrams[normalizedUnit]) {
      return quantity * this.countToGrams[normalizedUnit];
    }
    
    // Default: assume grams if unit not recognized
    console.warn(`Unknown unit "${unit}" for ingredient "${ingredientName}", assuming grams`);
    return quantity;
  }
};

/**
 * Nutrition data aggregator and formatter
 */
class NutritionAggregator {
  constructor() {
    // Map USDA nutrient IDs to recipe schema fields
    this.nutrientMapping = {
      1008: 'calories', // Energy
      1003: 'proteinContent', // Protein
      1004: 'fatContent', // Total lipid (fat)
      1005: 'carbohydrateContent', // Carbohydrate, by difference
      1079: 'fiberContent', // Fiber, total dietary
      2000: 'sugarContent', // Sugars, total including NLEA
      1093: 'sodiumContent', // Sodium, Na
      1253: 'cholesterolContent', // Cholesterol
      1258: 'saturatedFatContent', // Fatty acids, total saturated
      1257: 'transFatContent', // Fatty acids, total trans
      // Note: unsaturatedFat is calculated as total fat - saturated fat - trans fat
    };
  }

  /**
   * Extract and normalize nutrition data from USDA food item
   * @param {Object} foodItem - USDA food item with foodNutrients array
   * @param {number} weightGrams - Weight of ingredient in grams
   * @returns {Object} Normalized nutrition data per serving
   */
  extractNutrition(foodItem, weightGrams) {
    const nutrition = {};
    const baseWeight = 100; // USDA data is typically per 100g
    const scaleFactor = weightGrams / baseWeight;

    if (!foodItem.foodNutrients || !Array.isArray(foodItem.foodNutrients)) {
      return nutrition;
    }

    // Process each nutrient
    foodItem.foodNutrients.forEach(nutrient => {
      const nutrientId = nutrient.nutrientId;
      const mappedField = this.nutrientMapping[nutrientId];
      
      if (mappedField && nutrient.value !== undefined && nutrient.value !== null) {
        // Scale the value based on ingredient weight
        nutrition[mappedField] = nutrient.value * scaleFactor;
      }
    });

    // Calculate unsaturated fat if we have the components
    if (nutrition.fatContent && nutrition.saturatedFatContent) {
      const transFat = nutrition.transFatContent || 0;
      nutrition.unsaturatedFatContent = Math.max(0, 
        nutrition.fatContent - nutrition.saturatedFatContent - transFat
      );
    }

    return nutrition;
  }

  /**
   * Aggregate nutrition data from multiple ingredients
   * @param {Array} nutritionDataArray - Array of nutrition objects
   * @returns {Object} Aggregated nutrition totals
   */
  aggregateNutrition(nutritionDataArray) {
    const totals = {};

    nutritionDataArray.forEach(nutrition => {
      Object.keys(nutrition).forEach(key => {
        if (typeof nutrition[key] === 'number' && !isNaN(nutrition[key])) {
          totals[key] = (totals[key] || 0) + nutrition[key];
        }
      });
    });

    return totals;
  }

  /**
   * Format nutrition data to match recipe schema
   * @param {Object} nutritionTotals - Aggregated nutrition data
   * @param {number} servings - Number of servings (default: 1)
   * @returns {Object} Formatted nutrition object for recipe schema
   */
  formatForRecipeSchema(nutritionTotals, servings = 1) {
    const perServing = {};
    
    // Calculate per-serving values
    Object.keys(nutritionTotals).forEach(key => {
      if (typeof nutritionTotals[key] === 'number') {
        perServing[key] = nutritionTotals[key] / servings;
      }
    });

    return {
      "@type": "NutritionInformation",
      calories: this.formatNutrientValue(perServing.calories, '', true),  // No unit for calories
      proteinContent: this.formatNutrientValue(perServing.proteinContent, 'g'),
      fatContent: this.formatNutrientValue(perServing.fatContent, 'g'),
      carbohydrateContent: this.formatNutrientValue(perServing.carbohydrateContent, 'g'),
      fiberContent: this.formatNutrientValue(perServing.fiberContent, 'g'),
      sugarContent: this.formatNutrientValue(perServing.sugarContent, 'g'),
      sodiumContent: this.formatNutrientValue(perServing.sodiumContent, 'mg'),
      cholesterolContent: this.formatNutrientValue(perServing.cholesterolContent, 'mg'),
      saturatedFatContent: this.formatNutrientValue(perServing.saturatedFatContent, 'g'),
      transFatContent: this.formatNutrientValue(perServing.transFatContent, 'g'),
      unsaturatedFatContent: this.formatNutrientValue(perServing.unsaturatedFatContent, 'g'),
      servingSize: servings.toString()
    };
  }

  /**
   * Format a nutrient value with appropriate precision and unit
   * @param {number} value - Nutrient value
   * @param {string} unit - Unit of measurement
   * @param {boolean} isCalories - Whether this is for calories (special formatting)
   * @returns {string} Formatted value with unit
   */
  formatNutrientValue(value, unit, isCalories = false) {
    if (value === undefined || value === null || isNaN(value)) {
      return '';
    }
    
    // Round to 1 decimal place for most nutrients
    const rounded = Math.round(value * 10) / 10;
    
    // For calories, return just the number without unit
    if (isCalories || !unit) {
      return rounded.toString();
    }
    
    return `${rounded}${unit}`;
  }
}

/**
 * Main nutrition calculator function
 * @param {Array} ingredients - Array of ingredient objects with name, quantity, and unit
 * @param {string} apiKey - USDA FoodData Central API key
 * @param {number} servings - Number of servings the recipe makes (default: 1)
 * @returns {Promise<Object>} Nutrition information in recipe schema format
 */
export async function calculateNutritionalFacts(ingredients, apiKey, servings = 1) {
  if (!apiKey) {
    throw new Error('USDA API key is required');
  }

  if (!Array.isArray(ingredients) || ingredients.length === 0) {
    throw new Error('Ingredients array is required and must not be empty');
  }

  const client = new USDANutritionClient(apiKey);
  const aggregator = new NutritionAggregator();
  const nutritionDataArray = [];

  try {
    // Process each ingredient
    for (const ingredient of ingredients) {
      if (!ingredient.name || !ingredient.quantity) {
        console.warn('Skipping ingredient with missing name or quantity:', ingredient);
        continue;
      }

      try {
        // Search for the ingredient in USDA database
        const searchResults = await client.searchFood(ingredient.name);
        
        if (!searchResults.foods || searchResults.foods.length === 0) {
          console.warn(`No USDA data found for ingredient: ${ingredient.name}`);
          continue;
        }

        // Use the first (most relevant) result
        const foodItem = searchResults.foods[0];
        
        // Convert ingredient quantity to grams
        const weightGrams = UnitConverter.convertToGrams(
          ingredient.quantity,
          ingredient.unit || 'g',
          ingredient.name,
          ingredient.density || null
        );

        // Extract nutrition data for this ingredient
        const nutrition = aggregator.extractNutrition(foodItem, weightGrams);
        
        if (Object.keys(nutrition).length > 0) {
          nutritionDataArray.push(nutrition);
        }

        // Add small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (error) {
        console.error(`Error processing ingredient "${ingredient.name}":`, error);
        // Continue processing other ingredients
      }
    }

    // Aggregate all nutrition data
    const nutritionTotals = aggregator.aggregateNutrition(nutritionDataArray);
    
    // Format for recipe schema
    const formattedNutrition = aggregator.formatForRecipeSchema(nutritionTotals, servings);

    return {
      success: true,
      nutrition: formattedNutrition,
      processedIngredients: nutritionDataArray.length,
      totalIngredients: ingredients.length
    };

  } catch (error) {
    console.error('Error calculating nutritional facts:', error);
    return {
      success: false,
      error: error.message,
      nutrition: null
    };
  }
}

/**
 * Utility function to validate ingredient format
 * @param {Array} ingredients - Array of ingredients to validate
 * @returns {Object} Validation result with errors if any
 */
export function validateIngredients(ingredients) {
  const errors = [];
  
  if (!Array.isArray(ingredients)) {
    return { valid: false, errors: ['Ingredients must be an array'] };
  }

  ingredients.forEach((ingredient, index) => {
    if (!ingredient.name || typeof ingredient.name !== 'string') {
      errors.push(`Ingredient ${index + 1}: name is required and must be a string`);
    }
    
    if (!ingredient.quantity || typeof ingredient.quantity !== 'number' || ingredient.quantity <= 0) {
      errors.push(`Ingredient ${index + 1}: quantity is required and must be a positive number`);
    }
    
    if (ingredient.unit && typeof ingredient.unit !== 'string') {
      errors.push(`Ingredient ${index + 1}: unit must be a string if provided`);
    }
  });

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Get supported units for ingredient measurements
 * @returns {Object} Object containing arrays of supported units by type
 */
export function getSupportedUnits() {
  return {
    weight: Object.keys(UnitConverter.weightToGrams),
    volume: Object.keys(UnitConverter.volumeToMl),
    count: Object.keys(UnitConverter.countToGrams)
  };
}

// Export classes for advanced usage
export { USDANutritionClient, UnitConverter, NutritionAggregator };