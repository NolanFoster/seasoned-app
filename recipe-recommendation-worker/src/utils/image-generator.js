/**
 * Image generation utilities for AI-generated recipes
 */

import { log as baseLog } from '../../../shared/utility-functions.js';

// Wrapper to automatically add worker context
function log(level, message, data = {}, context = {}) {
  return baseLog(level, message, data, { worker: 'recipe-recommendation-worker', ...context });
}

/**
 * Generate an image for an AI-generated recipe using the AI image generation worker
 * @param {Object} recipe - The recipe object
 * @param {Object} env - Environment bindings
 * @param {string} requestId - Request ID for logging
 * @param {string} style - Image style (realistic, artistic, rustic, modern)
 * @param {string} aspectRatio - Image aspect ratio (1:1, 16:9, 9:16, 4:3, 3:4)
 * @returns {Promise<string|null>} - Image URL or null if generation fails
 */
export async function generateRecipeImage(recipe, env, requestId, style = 'realistic', aspectRatio = '1:1') {
  const startTime = Date.now();
  
  try {
    // Check if AI_IMAGE_WORKER binding is available
    if (!env.AI_IMAGE_WORKER) {
      log('warn', 'AI_IMAGE_WORKER binding not available', { requestId });
      return null;
    }

    // Prepare recipe data for image generation
    const recipeData = {
      name: recipe.name || recipe.title || 'Generated Recipe',
      description: recipe.description || `A delicious ${recipe.name || 'recipe'}`,
      ingredients: recipe.ingredients || []
    };

    // If ingredients is not an array, try to extract from other fields
    if (!Array.isArray(recipeData.ingredients) || recipeData.ingredients.length === 0) {
      // Try to extract ingredients from recipe text or other fields
      if (recipe.recipeIngredient && Array.isArray(recipe.recipeIngredient)) {
        recipeData.ingredients = recipe.recipeIngredient;
      } else if (recipe.ingredient && Array.isArray(recipe.ingredient)) {
        recipeData.ingredients = recipe.ingredient;
      } else {
        // Create a basic ingredient list based on the recipe name
        recipeData.ingredients = ['fresh ingredients', 'seasonings', 'cooking oil'];
      }
    }

    log('info', 'Generating image for AI recipe', {
      requestId,
      recipeName: recipeData.name,
      style,
      aspectRatio,
      ingredientsCount: recipeData.ingredients.length
    });

    // Call the AI image generation worker
    const imageRequest = new Request('https://ai-image-generation-worker.nolanfoster.workers.dev/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        recipe: recipeData,
        style: style,
        aspectRatio: aspectRatio
      })
    });

    const response = await env.AI_IMAGE_WORKER.fetch(imageRequest);
    
    if (!response.ok) {
      log('warn', 'AI image generation failed', {
        requestId,
        status: response.status,
        statusText: response.statusText
      });
      return null;
    }

    const imageResult = await response.json();
    
    if (!imageResult.success || !imageResult.imageUrl) {
      log('warn', 'AI image generation returned unsuccessful result', {
        requestId,
        result: imageResult
      });
      return null;
    }

    const duration = Date.now() - startTime;
    
    log('info', 'AI image generated successfully', {
      requestId,
      recipeName: recipeData.name,
      imageUrl: imageResult.imageUrl,
      imageId: imageResult.imageId,
      duration: `${duration}ms`,
      style,
      aspectRatio
    });

    return imageResult.imageUrl;

  } catch (error) {
    const duration = Date.now() - startTime;
    
    log('error', 'AI image generation error', {
      requestId,
      recipeName: recipe.name || recipe.title || 'Unknown',
      error: error.message,
      duration: `${duration}ms`
    });

    // Return null on error - don't fail the entire recipe generation
    return null;
  }
}

/**
 * Generate images for multiple AI-generated recipes in parallel
 * @param {Array} recipes - Array of recipe objects
 * @param {Object} env - Environment bindings
 * @param {string} requestId - Request ID for logging
 * @param {string} style - Image style
 * @param {string} aspectRatio - Image aspect ratio
 * @returns {Promise<Array>} - Array of recipes with image URLs added
 */
export async function generateRecipeImages(recipes, env, requestId, style = 'realistic', aspectRatio = '1:1') {
  const startTime = Date.now();
  
  try {
    log('info', 'Generating images for AI recipes', {
      requestId,
      recipeCount: recipes.length,
      style,
      aspectRatio
    });

    // Generate images in parallel for better performance
    const imagePromises = recipes.map(async (recipe, index) => {
      log('debug', 'Starting image generation for recipe', {
        requestId,
        recipeIndex: index,
        recipeName: recipe.name,
        recipeId: recipe.id || 'no-id'
      });
      
      const imageUrl = await generateRecipeImage(recipe, env, requestId, style, aspectRatio);
      
      log('debug', 'Completed image generation for recipe', {
        requestId,
        recipeIndex: index,
        recipeName: recipe.name,
        imageUrl: imageUrl || 'failed'
      });
      
      return {
        ...recipe,
        image_url: imageUrl
      };
    });

    const recipesWithImages = await Promise.all(imagePromises);
    
    const duration = Date.now() - startTime;
    const successfulImages = recipesWithImages.filter(recipe => recipe.image_url).length;
    
    log('info', 'Recipe image generation completed', {
      requestId,
      totalRecipes: recipes.length,
      successfulImages,
      failedImages: recipes.length - successfulImages,
      duration: `${duration}ms`
    });

    return recipesWithImages;

  } catch (error) {
    const duration = Date.now() - startTime;
    
    log('error', 'Batch recipe image generation error', {
      requestId,
      recipeCount: recipes.length,
      error: error.message,
      duration: `${duration}ms`
    });

    // Return recipes without images on error
    return recipes.map(recipe => ({
      ...recipe,
      image_url: null
    }));
  }
}
