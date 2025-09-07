/**
 * Generate descriptive prompts from recipe data for AI image generation
 */

export function generatePromptFromRecipe(recipe, style = 'realistic') {
  const title = recipe.name || recipe.title || 'Delicious dish';
  const description = recipe.description || '';
  const ingredients = recipe.ingredients || recipe.recipeIngredient || [];
  const cuisine = recipe.cuisine || recipe.recipeCuisine || '';
  
  // Extract key ingredients for visual emphasis
  const keyIngredients = extractKeyIngredients(ingredients);
  
  // Build style-specific prompt
  let stylePrompt = '';
  switch (style) {
    case 'realistic':
      stylePrompt = 'A professional food photography style image, beautifully plated and styled, natural lighting, high resolution, appetizing presentation';
      break;
    case 'artistic':
      stylePrompt = 'An artistic illustration in watercolor style, vibrant colors, creative composition';
      break;
    case 'rustic':
      stylePrompt = 'A rustic, homestyle presentation on wooden table, warm lighting, cozy atmosphere';
      break;
    case 'modern':
      stylePrompt = 'A modern, minimalist presentation, clean plating, contemporary style, elegant composition';
      break;
    default:
      stylePrompt = 'A beautifully presented dish, professional food photography';
  }
  
  // Construct the main prompt
  let prompt = `${stylePrompt} of ${title}`;
  
  // Add cuisine context if available
  if (cuisine) {
    prompt += `, ${cuisine} cuisine`;
  }
  
  // Add key ingredients for visual context
  if (keyIngredients.length > 0) {
    prompt += `, featuring ${keyIngredients.slice(0, 3).join(', ')}`;
  }
  
  // Add description elements if available
  if (description && description.length > 0) {
    const cleanDescription = description
      .replace(/[^a-zA-Z0-9\s,.-]/g, '')
      .substring(0, 100);
    prompt += `, ${cleanDescription}`;
  }
  
  // Add final styling instructions
  prompt += ', appetizing, delicious looking, food photography, high quality, detailed';
  
  return prompt;
}

/**
 * Extract key ingredients from ingredient list
 */
function extractKeyIngredients(ingredients) {
  if (!Array.isArray(ingredients)) return [];
  
  // Common words to filter out
  const filterWords = new Set([
    'cup', 'cups', 'teaspoon', 'teaspoons', 'tablespoon', 'tablespoons',
    'pound', 'pounds', 'ounce', 'ounces', 'gram', 'grams',
    'small', 'medium', 'large', 'fresh', 'dried', 'chopped', 'diced',
    'sliced', 'minced', 'ground', 'whole', 'half', 'quarter',
    'to', 'taste', 'optional', 'for', 'serving', 'garnish'
  ]);
  
  const keyIngredients = [];
  
  for (const ingredient of ingredients) {
    const text = typeof ingredient === 'string' ? ingredient : ingredient.text || '';
    
    // Extract main ingredient words
    const words = text.toLowerCase().split(/\s+/);
    const meaningfulWords = words.filter(word => 
      word.length > 2 && 
      !filterWords.has(word) && 
      !/^\d/.test(word)
    );
    
    if (meaningfulWords.length > 0) {
      // Take the most significant word (usually the last meaningful word)
      const keyWord = meaningfulWords[meaningfulWords.length - 1];
      if (!keyIngredients.includes(keyWord)) {
        keyIngredients.push(keyWord);
      }
    }
    
    // Limit to top ingredients
    if (keyIngredients.length >= 5) break;
  }
  
  return keyIngredients;
}