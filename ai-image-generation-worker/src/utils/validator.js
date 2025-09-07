/**
 * Recipe validation utilities
 */

export function validateRecipe(recipe) {
  const errors = [];
  
  if (!recipe) {
    return {
      valid: false,
      errors: ['Recipe object is required']
    };
  }
  
  // Check for required fields
  if (!recipe.name && !recipe.title) {
    errors.push('Recipe must have a name or title');
  }
  
  // Check ingredients
  if (!recipe.ingredients && !recipe.recipeIngredient) {
    errors.push('Recipe must have ingredients');
  } else {
    const ingredients = recipe.ingredients || recipe.recipeIngredient;
    if (!Array.isArray(ingredients) || ingredients.length === 0) {
      errors.push('Ingredients must be a non-empty array');
    }
  }
  
  // Validate recipe structure for common fields
  if (recipe.name && typeof recipe.name !== 'string') {
    errors.push('Recipe name must be a string');
  }
  
  if (recipe.title && typeof recipe.title !== 'string') {
    errors.push('Recipe title must be a string');
  }
  
  if (recipe.description && typeof recipe.description !== 'string') {
    errors.push('Recipe description must be a string');
  }
  
  return {
    valid: errors.length === 0,
    errors: errors
  };
}

/**
 * Validate image generation parameters
 */
export function validateGenerationParams(params) {
  const errors = [];
  
  // Validate style
  const validStyles = ['realistic', 'artistic', 'rustic', 'modern'];
  if (params.style && !validStyles.includes(params.style)) {
    errors.push(`Invalid style. Must be one of: ${validStyles.join(', ')}`);
  }
  
  // Validate aspect ratio
  const validAspectRatios = ['1:1', '16:9', '9:16', '4:3', '3:4'];
  if (params.aspectRatio && !validAspectRatios.includes(params.aspectRatio)) {
    errors.push(`Invalid aspect ratio. Must be one of: ${validAspectRatios.join(', ')}`);
  }
  
  return {
    valid: errors.length === 0,
    errors: errors
  };
}