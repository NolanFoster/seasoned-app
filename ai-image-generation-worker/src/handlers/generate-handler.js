/**
 * Generate handler for AI image generation
 */

import { generatePromptFromRecipe } from '../utils/prompt-generator.js';
import { uploadImageToR2 } from '../utils/r2-uploader.js';
import { validateRecipe } from '../utils/validator.js';

export async function handleGenerate(request, env, _ctx) {
  try {
    // Parse request body
    const body = await request.json();
    
    // Validate recipe data
    const validationResult = validateRecipe(body.recipe);
    if (!validationResult.valid) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Invalid recipe data',
        details: validationResult.errors
      }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    const { recipe, style = 'realistic', aspectRatio = '1:1' } = body;
    
    // Generate a descriptive prompt from the recipe
    const prompt = generatePromptFromRecipe(recipe, style);
    
    // Map aspect ratio to dimensions
    const dimensions = mapAspectRatioDimensions(aspectRatio);
    
    console.log('Generating image with prompt:', prompt);
    console.log('Dimensions:', dimensions);

    // Generate image using FLUX model
    const imageResponse = await env.AI.run(
      '@cf/black-forest-labs/flux-1-schnell',
      {
        prompt: prompt,
        num_steps: 4, // FLUX schnell is optimized for 4 steps
        width: dimensions.width,
        height: dimensions.height
      }
    );

    // Check if image generation was successful
    if (!imageResponse || !imageResponse.image) {
      throw new Error('Image generation failed');
    }

    // Generate unique image ID
    const imageId = generateImageId(recipe);
    
    // Upload image to R2
    const imageUrl = await uploadImageToR2(
      env.RECIPE_IMAGES,
      imageResponse.image,
      imageId,
      env.IMAGE_DOMAIN
    );

    // Return success response
    return new Response(JSON.stringify({
      success: true,
      imageUrl: imageUrl,
      imageId: imageId,
      metadata: {
        recipeName: recipe.name || recipe.title,
        style: style,
        aspectRatio: aspectRatio,
        generatedAt: new Date().toISOString()
      }
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });

  } catch (error) {
    console.error('Image generation error:', error);
    
    return new Response(JSON.stringify({
      success: false,
      error: 'Failed to generate image',
      message: error.message
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
}

/**
 * Map aspect ratio string to dimensions
 */
function mapAspectRatioDimensions(aspectRatio) {
  const dimensionMap = {
    '1:1': { width: 1024, height: 1024 },
    '16:9': { width: 1024, height: 576 },
    '9:16': { width: 576, height: 1024 },
    '4:3': { width: 1024, height: 768 },
    '3:4': { width: 768, height: 1024 }
  };
  
  return dimensionMap[aspectRatio] || dimensionMap['1:1'];
}

/**
 * Generate unique image ID for the recipe
 */
function generateImageId(recipe) {
  const timestamp = Date.now();
  const recipeName = (recipe.name || recipe.title || 'recipe')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 50);
  
  return `recipe-${recipeName}-${timestamp}`;
}