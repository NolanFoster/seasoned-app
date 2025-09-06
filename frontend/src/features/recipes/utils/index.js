// Recipe utility functions

/**
 * Get recipe description for display - prioritize generated data for AI recipes
 */
export const getRecipeDescription = (recipe) => {
  // For AI-generated recipes, first check the generated description
  if (recipe.source === 'ai_generated' && recipe.generatedAt) {
    console.log('🔍 AI Recipe - Generated description:', recipe.description);
    
    // If there's a generated description, use it
    if (recipe.description && recipe.description.trim()) {
      return recipe.description;
    }
    
    // Otherwise, try to extract description from instructions
    const instructions = recipe.instructions || [];
    
    for (const instruction of instructions) {
      const instructionText = typeof instruction === 'string' ? instruction : instruction.text || '';
      const lowerText = instructionText.toLowerCase();
      
      // Look for description lines
      if (lowerText.includes('description:') || lowerText.includes('**description')) {
        const desc = instructionText.replace(/^\d+\.\s*/, '')
                                  .replace(/^\*\*description\*\*:?\s*/i, '')
                                  .replace(/^description:?\s*/i, '')
                                  .trim();
        if (desc.length > 20 && desc.length < 500) {
          console.log('🔍 AI Recipe - Extracted description:', desc);
          return desc;
        }
      }
    }
    
    return null;
  }
  
  // For regular recipes, use the description field
  return recipe.description && recipe.description.trim() ? recipe.description : null;
};

/**
 * Get ingredients for display - prioritize generated data for AI recipes
 */
export const getFilteredIngredients = (recipe) => {
  // For AI-generated recipes, use the generated ingredients directly
  if (recipe.source === 'ai_generated' && recipe.generatedAt) {
    console.log('🔍 AI Recipe - Using generated ingredients:', recipe.ingredients);
    console.log('🔍 AI Recipe - Recipe object keys:', Object.keys(recipe));
    
    // Use the ingredients from the generation API response
    const generatedIngredients = recipe.ingredients || [];
    
    // If the generated ingredients array is empty or very short, try to extract from instructions
    if (generatedIngredients.length < 3) {
      console.log('🔍 AI Recipe - Few ingredients, extracting from instructions');
      const instructions = recipe.instructions || [];
      const additionalIngredients = [];
      
      for (const instruction of instructions) {
        const instructionText = typeof instruction === 'string' ? instruction : instruction.text || '';
        const cleanText = instructionText.replace(/^\d+\.\s*/, '').trim();
        
        // Look for ingredient lines (start with - and have measurements or food items)
        if (cleanText.startsWith('- ') || cleanText.startsWith('• ')) {
          const ingredientText = cleanText.replace(/^[-•]\s*/, '').trim();
          const hasMeasurement = /\d+(\.\d+)?\s*(\/\d+\s*)?(cup|cups|tbsp|tablespoon|tablespoons|tsp|teaspoon|teaspoons|pound|pounds|lb|lbs|oz|ounce|ounces|gram|grams|g|ml|milliliter|milliliters|liter|liters|l|clove|cloves|slice|slices|piece|pieces|ball|balls|inch|inches|medium|large|small|ripe|fresh|dried)/i.test(ingredientText);
          const hasFoodWords = /\b(peach|peaches|cheese|oil|basil|salt|pepper|onion|garlic|chicken|beef|pork|fish|vegetable|fruit|herb|spice|flour|sugar|butter|milk|cream|egg|water|stock|broth|wine|vinegar|lemon|lime|tomato|potato|rice|pasta|bread)/i.test(ingredientText);
          
          if ((hasMeasurement || hasFoodWords) && ingredientText.length < 150) {
            additionalIngredients.push(ingredientText);
          }
        }
      }
      
      // Combine generated ingredients with extracted ones
      const allIngredients = [...generatedIngredients, ...additionalIngredients];
      const uniqueIngredients = allIngredients.filter((ingredient, index, self) => 
        index === self.findIndex(i => i.toLowerCase().trim() === ingredient.toLowerCase().trim())
      );
      
      console.log('🔍 AI Recipe - Final combined ingredients:', uniqueIngredients);
      return uniqueIngredients;
    }
    
    console.log('🔍 AI Recipe - Using generated ingredients as-is:', generatedIngredients);
    return generatedIngredients;
  }
  
  // For regular recipes, use the standard ingredient fields
  return recipe.recipeIngredient || recipe.ingredients || [];
};

/**
 * Get instructions for display - prioritize generated data for AI recipes  
 */
export const getFilteredInstructions = (recipe) => {
  // For AI-generated recipes, use the generated instructions directly
  if (recipe.source === 'ai_generated' && recipe.generatedAt) {
    console.log('🔍 AI Recipe - Using generated instructions:', recipe.instructions);
    
    // Use the instructions from the generation API response
    const generatedInstructions = recipe.instructions || [];
    
    // Filter out description lines and return clean instructions
    return generatedInstructions
      .map(instruction => {
        const instructionText = typeof instruction === 'string' ? instruction : instruction.text || '';
        return instructionText.replace(/^\d+\.\s*/, '').trim();
      })
      .filter(instruction => {
        const lowerText = instruction.toLowerCase();
        return !lowerText.includes('description:') && 
               !lowerText.includes('**description') &&
               instruction.length > 10;
      });
  }
  
  // For regular recipes, use the standard instruction fields
  const instructions = recipe.recipeInstructions || recipe.instructions || [];
  return instructions.map(instruction => {
    if (typeof instruction === 'string') {
      return instruction.replace(/^\d+\.\s*/, '').trim();
    }
    return instruction.text ? instruction.text.replace(/^\d+\.\s*/, '').trim() : '';
  }).filter(instruction => instruction.length > 0);
};

/**
 * Format ingredient amount for display
 */
export const formatIngredientAmount = (ingredient) => {
  if (typeof ingredient === 'string') return ingredient;
  if (ingredient && ingredient.text) return ingredient.text;
  if (ingredient && ingredient.name) return ingredient.name;
  return ingredient;
};

/**
 * Decode HTML entities in text
 */
export const decodeHtmlEntities = (text) => {
  if (!text) return '';
  
  const textarea = document.createElement('textarea');
  textarea.innerHTML = text;
  return textarea.value;
};

/**
 * Validate recipe data
 */
export const validateRecipe = (recipe) => {
  const errors = {};
  
  if (!recipe.name || recipe.name.trim().length === 0) {
    errors.name = 'Recipe name is required';
  }
  
  if (!recipe.ingredients || recipe.ingredients.length === 0) {
    errors.ingredients = 'At least one ingredient is required';
  }
  
  if (!recipe.instructions || recipe.instructions.length === 0) {
    errors.instructions = 'At least one instruction is required';
  }
  
  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
};

/**
 * Generate a unique recipe ID
 */
export const generateRecipeId = () => {
  return `recipe_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Calculate total cooking time
 */
export const calculateTotalTime = (prepTime, cookTime) => {
  const prepMinutes = parseTimeToMinutes(prepTime);
  const cookMinutes = parseTimeToMinutes(cookTime);
  return prepMinutes + cookMinutes;
};

/**
 * Parse time string to minutes
 */
const parseTimeToMinutes = (timeString) => {
  if (!timeString) return 0;
  
  const time = timeString.toLowerCase().trim();
  const number = parseInt(time.match(/\d+/)?.[0] || '0');
  
  if (time.includes('hour')) {
    return number * 60;
  }
  
  return number;
};
