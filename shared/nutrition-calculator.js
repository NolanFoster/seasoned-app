/**
 * Nutrition Calculator - Shared Library
 * 
 * Calculates nutritional facts for recipes using the USDA FoodData Central API.
 * Handles ingredient lookup, quantity conversion, and nutrition aggregation.
 * 
 * @author Recipe App Team
 */

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
    'small': 100,
    'medium': 150,
    'large': 200,
    'piece': 100,
    'pieces': 100,
    'item': 100,
    'items': 100,
    'serving': 100,
    'servings': 100
  },

  /**
   * Convert ingredient quantity to grams
   * @param {number} quantity - Quantity value
   * @param {string} unit - Unit of measurement
   * @param {number} density - Density for volume to weight conversion (g/ml)
   * @returns {number} Weight in grams
   */
  convertToGrams(quantity, unit, density = 1) {
    const normalizedUnit = unit.toLowerCase().trim();
    
    // Direct weight conversion
    if (this.weightToGrams[normalizedUnit]) {
      return quantity * this.weightToGrams[normalizedUnit];
    }
    
    // Volume to weight conversion (using density)
    if (this.volumeToMl[normalizedUnit]) {
      const volumeMl = quantity * this.volumeToMl[normalizedUnit];
      return volumeMl * density; // Convert ml to grams using density
    }
    
    // Count/serving conversion
    if (this.countToGrams[normalizedUnit]) {
      return quantity * this.countToGrams[normalizedUnit];
    }
    
    // Default: assume grams if unit not recognized
    console.warn(`Unknown unit "${unit}", assuming grams`);
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
      calories: this.formatNutrientValue(perServing.calories, 'kcal'),
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
   * @returns {string} Formatted value with unit
   */
  formatNutrientValue(value, unit) {
    if (value === undefined || value === null || isNaN(value)) {
      return '';
    }
    
    // Round to 1 decimal place for most nutrients
    const rounded = Math.round(value * 10) / 10;
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
          ingredient.density || 1
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