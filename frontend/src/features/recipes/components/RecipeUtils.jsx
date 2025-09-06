// Recipe utility functions

// Get description for display - prioritize generated data for AI recipes
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

// Get ingredients for display - prioritize generated data for AI recipes
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

// Get instructions for display - prioritize generated data for AI recipes  
export const getFilteredInstructions = (recipe) => {
  // For AI-generated recipes, use the generated instructions directly
  if (recipe.source === 'ai_generated' && recipe.generatedAt) {
    console.log('🔍 AI Recipe - Using generated instructions:', recipe.instructions);
    console.log('🔍 AI Recipe - Instructions type:', typeof recipe.instructions);
    console.log('🔍 AI Recipe - Instructions length:', recipe.instructions?.length);
    
    const generatedInstructions = recipe.instructions || [];
    
    // For the sample response format where instructions contain everything,
    // provide a simplified display that shows all content in a readable way
    const cleanedInstructions = generatedInstructions.map(instruction => {
      const instructionText = typeof instruction === 'string' ? instruction : instruction.text || '';
      
      // Remove leading numbers and clean up formatting
      let cleanText = instructionText.replace(/^\d+\.\s*/, '').trim();
      
      // Remove excessive bold formatting but keep some structure for readability
      cleanText = cleanText.replace(/\*\*(.*?)\*\*/g, '$1');
      
      return cleanText;
    }).filter(instruction => 
      instruction.length > 5 // Must have some content
    );
    
    console.log('🔍 AI Recipe - Final instructions count:', cleanedInstructions.length);
    console.log('🔍 AI Recipe - Sample instruction:', cleanedInstructions[0]);
    
    return cleanedInstructions.length > 0 ? cleanedInstructions : generatedInstructions;
  }
  
  // For regular recipes, use the standard instruction fields
  return recipe.recipeInstructions || recipe.instructions || [];
};

// Decode HTML entities for proper display
export const decodeHtmlEntities = (text) => {
  if (!text) return text;
  
  const entities = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'",
    '&nbsp;': ' ',
    '&copy;': '©',
    '&reg;': '®',
    '&trade;': '™',
    '&mdash;': '—',
    '&ndash;': '–',
    '&bull;': '•',
    '&hellip;': '…',
    '&prime;': '′',
    '&Prime;': '″',
    '&lsquo;': '\u2018',
    '&rsquo;': '\u2019',
    '&ldquo;': '\u201C',
    '&rdquo;': '\u201D',
    '&deg;': '°',
    '&frac12;': '½',
    '&frac14;': '¼',
    '&frac34;': '¾',
    '&times;': '×',
    '&divide;': '÷',
    '&plusmn;': '±',
    '&eacute;': 'é',
    '&egrave;': 'è',
    '&ecirc;': 'ê',
    '&euml;': 'ë',
    '&agrave;': 'à',
    '&aacute;': 'á',
    '&acirc;': 'â',
    '&auml;': 'ä',
    '&oacute;': 'ó',
    '&ograve;': 'ò',
    '&ocirc;': 'ô',
    '&ouml;': 'ö',
    '&uacute;': 'ú',
    '&ugrave;': 'ù',
    '&ucirc;': 'û',
    '&uuml;': 'ü',
    '&ntilde;': 'ñ',
    '&ccedil;': 'ç'
  };
  
  let decodedText = String(text);
  
  // Replace known entities
  Object.entries(entities).forEach(([entity, char]) => {
    decodedText = decodedText.replace(new RegExp(entity, 'g'), char);
  });
  
  // Handle numeric entities (e.g., &#8217; for apostrophe)
  decodedText = decodedText.replace(/&#(\d+);/g, (match, dec) => {
    return String.fromCharCode(dec);
  });
  
  // Handle hex entities (e.g., &#x2019; for apostrophe)  
  decodedText = decodedText.replace(/&#x([0-9A-Fa-f]+);/g, (match, hex) => {
    return String.fromCharCode(parseInt(hex, 16));
  });
  
  return decodedText;
};

export default {
  getRecipeDescription,
  getFilteredIngredients,
  getFilteredInstructions,
  decodeHtmlEntities
};
