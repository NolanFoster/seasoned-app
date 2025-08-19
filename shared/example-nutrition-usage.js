/**
 * Example: Using the Nutrition Calculator in a Cloudflare Worker
 * 
 * This example shows how to integrate the nutrition calculator
 * into a Cloudflare Worker to add nutritional data to recipes.
 */

import { calculateNutritionalFacts, validateIngredients } from '../shared/nutrition-calculator.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    // Handle preflight requests
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // Endpoint to calculate nutrition for a recipe
      if (pathname === '/calculate-nutrition' && request.method === 'POST') {
        return await handleNutritionCalculation(request, env, corsHeaders);
      }

      // Endpoint to add nutrition to existing recipe
      if (pathname === '/enhance-recipe' && request.method === 'POST') {
        return await handleRecipeEnhancement(request, env, corsHeaders);
      }

      // Default response
      return new Response('Nutrition Calculator API', {
        status: 200,
        headers: corsHeaders
      });

    } catch (error) {
      console.error('Worker error:', error);
      return new Response(`Error: ${error.message}`, {
        status: 500,
        headers: corsHeaders
      });
    }
  }
};

/**
 * Handle nutrition calculation for ingredients
 */
async function handleNutritionCalculation(request, env, corsHeaders) {
  const body = await request.json();
  const { ingredients, servings = 1 } = body;

  // Validate required parameters
  if (!ingredients) {
    return new Response('Missing ingredients parameter', {
      status: 400,
      headers: corsHeaders
    });
  }

  if (!env.FDC_API_KEY) {
    return new Response('USDA API key not configured', {
      status: 500,
      headers: corsHeaders
    });
  }

  // Validate ingredients format
  const validation = validateIngredients(ingredients);
  if (!validation.valid) {
    return new Response(JSON.stringify({
      error: 'Invalid ingredients format',
      details: validation.errors
    }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    // Calculate nutrition
    const result = await calculateNutritionalFacts(ingredients, env.FDC_API_KEY, servings);

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Nutrition calculation error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Handle enhancing an existing recipe with nutrition data
 */
async function handleRecipeEnhancement(request, env, corsHeaders) {
  const body = await request.json();
  const { recipe } = body;

  // Validate required parameters
  if (!recipe || !recipe.recipeIngredient) {
    return new Response('Missing recipe or ingredients data', {
      status: 400,
      headers: corsHeaders
    });
  }

  if (!env.FDC_API_KEY) {
    return new Response('USDA API key not configured', {
      status: 500,
      headers: corsHeaders
    });
  }

  try {
    // Extract ingredients from recipe
    const ingredients = parseRecipeIngredients(recipe.recipeIngredient);
    
    if (ingredients.length === 0) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Could not parse ingredients from recipe'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Get servings from recipe
    const servings = parseInt(recipe.recipeYield || recipe.yield || 1);

    // Calculate nutrition
    const nutritionResult = await calculateNutritionalFacts(ingredients, env.FDC_API_KEY, servings);

    if (nutritionResult.success) {
      // Add nutrition to recipe
      const enhancedRecipe = {
        ...recipe,
        nutrition: nutritionResult.nutrition
      };

      return new Response(JSON.stringify({
        success: true,
        recipe: enhancedRecipe,
        nutritionCalculation: {
          processedIngredients: nutritionResult.processedIngredients,
          totalIngredients: nutritionResult.totalIngredients
        }
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    } else {
      return new Response(JSON.stringify(nutritionResult), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

  } catch (error) {
    console.error('Recipe enhancement error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Parse recipe ingredients into structured format for nutrition calculation
 * This is a simplified parser - you may need more sophisticated parsing
 * depending on your ingredient format.
 */
function parseRecipeIngredients(recipeIngredients) {
  const ingredients = [];

  for (const ingredientText of recipeIngredients) {
    try {
      // Simple regex to extract quantity, unit, and ingredient name
      // Format examples: "1 cup flour", "2 tablespoons olive oil", "1 large apple"
      const match = ingredientText.match(/^(\d+(?:\.\d+)?)\s*(\w+)?\s+(.+)$/);
      
      if (match) {
        const [, quantityStr, unit, name] = match;
        const quantity = parseFloat(quantityStr);
        
        if (quantity > 0 && name.trim()) {
          ingredients.push({
            name: name.trim(),
            quantity: quantity,
            unit: unit || 'piece'
          });
        }
      } else {
        // If no quantity found, assume 1 piece
        const cleanName = ingredientText.replace(/^(a|an|some|)\s*/i, '').trim();
        if (cleanName) {
          ingredients.push({
            name: cleanName,
            quantity: 1,
            unit: 'piece'
          });
        }
      }
    } catch (error) {
      console.warn(`Could not parse ingredient: ${ingredientText}`, error);
    }
  }

  return ingredients;
}

/* 
Example Usage:

1. Calculate nutrition for ingredients:
POST /calculate-nutrition
{
  "ingredients": [
    { "name": "apple", "quantity": 1, "unit": "medium" },
    { "name": "banana", "quantity": 1, "unit": "large" },
    { "name": "oats", "quantity": 0.5, "unit": "cup" }
  ],
  "servings": 2
}

2. Enhance existing recipe with nutrition:
POST /enhance-recipe
{
  "recipe": {
    "name": "Apple Banana Oatmeal",
    "recipeIngredient": [
      "1 medium apple",
      "1 large banana", 
      "0.5 cup oats",
      "1 cup milk"
    ],
    "recipeYield": "2",
    "description": "Healthy breakfast oatmeal"
  }
}

Environment Variables Required:
- FDC_API_KEY: Your USDA FoodData Central API key

Example wrangler.toml:
[vars]
FDC_API_KEY = "BTC4bopPVhYCMm30a7XtTojgvd3DFQBV86dO9n0K"

*/