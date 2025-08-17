/**
 * Test script to test the normalization logic
 */

// Mock the raw recipe data from JSON-LD
const rawRecipe = {
  name: 'Baked Salmon Piccata Recipe:',
  author: {'@type': 'Person', 'name': 'What\'s Cooking America'},
  description: 'A delicious salmon recipe',
  datePublished: '2015-06-21T01:36:00+00:00',
  recipeYield: ['4', '4 servings'],
  prepTime: 'PT15M',
  cookTime: 'PT15M',
  totalTime: 'PT30M',
  recipeIngredient: [
    '4 salmon steaks, 1-inch thick',
    'All-purpose flour (for dredging)',
    '1/4 cup plus 3 tablespoons butter, (divided)'
  ],
  recipeInstructions: [
    {
      '@type': 'HowToStep',
      'text': 'Preheat oven to 400 degrees F. Wash salmon steaks, pat dry, and roll in flour.'
    },
    {
      '@type': 'HowToStep',
      'text': 'In a large ovenproof frying pan, heat 1/4 cup butter until it melts.'
    }
  ],
  recipeCategory: ['Main Course'],
  recipeCuisine: ['Italian'],
  keywords: 'Baked Salmon Piccata Recipe',
  image: 'https://whatscookingamerica.net/wp-content/uploads/2015/03/SalmonPiccata5.jpg'
};

console.log('🧪 Testing recipe normalization logic\n');

console.log('Raw recipe data:', {
  name: rawRecipe.name,
  image: rawRecipe.image,
  ingredientCount: rawRecipe.recipeIngredient?.length || 0,
  instructionCount: rawRecipe.recipeInstructions?.length || 0
});

// Mock the normalization functions
function normalizeImage(image) {
  if (typeof image === 'string') return image;
  if (Array.isArray(image) && image.length > 0) {
    return normalizeImage(image[0]);
  }
  if (image && typeof image === 'object') {
    return image.url || image.contentUrl || '';
  }
  return '';
}

function normalizeAuthor(author) {
  if (typeof author === 'string') return author;
  if (author && typeof author === 'object') {
    return author.name || '';
  }
  return '';
}

function normalizeYield(yield_) {
  if (!yield_) return '';
  if (Array.isArray(yield_)) {
    return yield_.join(', ');
  }
  return String(yield_);
}

function normalizeKeywords(keywords) {
  if (!keywords) return '';
  if (Array.isArray(keywords)) {
    return keywords.join(', ');
  }
  return String(keywords);
}

function normalizeIngredients(ingredients) {
  if (!ingredients) return [];
  if (!Array.isArray(ingredients)) {
    return [String(ingredients)];
  }
  return ingredients.map(ing => String(ing)).filter(ing => ing.length > 0);
}

function normalizeInstructions(instructions) {
  if (!instructions) return [];
  if (Array.isArray(instructions)) {
    return instructions.map(instruction => {
      if (typeof instruction === 'string') return instruction;
      if (instruction.text) return instruction.text;
      if (instruction.name) return instruction.name;
      return String(instruction);
    });
  }
  return [String(instructions)];
}

// Test the normalization
try {
  const normalized = {
    // Required fields
    name: rawRecipe.name || '',
    image: normalizeImage(rawRecipe.image),
    
    // Description
    description: rawRecipe.description || '',
    
    // Author
    author: normalizeAuthor(rawRecipe.author),
    
    // Dates
    datePublished: rawRecipe.datePublished || '',
    dateModified: rawRecipe.dateModified || '',
    
    // Times (already in ISO 8601 format in JSON-LD)
    prepTime: rawRecipe.prepTime || '',
    cookTime: rawRecipe.cookTime || '',
    totalTime: rawRecipe.totalTime || '',
    
    // Yield/Servings
    recipeYield: normalizeYield(rawRecipe.recipeYield),
    
    // Category and Cuisine
    recipeCategory: rawRecipe.recipeCategory || '',
    recipeCuisine: rawRecipe.recipeCuisine || '',
    
    // Keywords
    keywords: normalizeKeywords(rawRecipe.keywords),
    
    // Ingredients
    recipeIngredient: normalizeIngredients(rawRecipe.recipeIngredient),
    
    // Instructions
    recipeInstructions: normalizeInstructions(rawRecipe.recipeInstructions),
    
    // Nutrition
    nutrition: rawRecipe.nutrition || null,
    
    // Ratings
    aggregateRating: rawRecipe.aggregateRating || null,
    
    // Video
    video: rawRecipe.video || null
  };
  
  console.log('\nNormalized recipe:', {
    name: normalized.name,
    image: normalized.image,
    ingredientCount: normalized.recipeIngredient?.length || 0,
    instructionCount: normalized.recipeInstructions?.length || 0
  });
  
  // Validate required fields
  if (!normalized.name || !normalized.image || 
      !normalized.recipeIngredient || normalized.recipeIngredient.length === 0 ||
      !normalized.recipeInstructions || normalized.recipeInstructions.length === 0) {
    console.log('\n❌ Recipe validation FAILED - missing required fields:', {
      hasName: !!normalized.name,
      hasImage: !!normalized.image,
      hasIngredients: normalized.recipeIngredient?.length > 0,
      hasInstructions: normalized.recipeInstructions?.length > 0
    });
  } else {
    console.log('\n✅ Recipe validation PASSED - all required fields present');
  }
  
} catch (error) {
  console.error('Error during normalization:', error);
}
