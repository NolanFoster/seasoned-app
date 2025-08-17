/**
 * Test script to test the validation logic
 */

// Mock the normalized recipe data
const mockRecipe = {
  name: 'Baked Salmon Piccata Recipe:',
  image: 'https://whatscookingamerica.net/wp-content/uploads/2015/03/SalmonPiccata5.jpg',
  description: 'A delicious salmon recipe',
  author: 'What\'s Cooking America',
  datePublished: '2015-06-21T01:36:00+00:00',
  dateModified: '',
  prepTime: 'PT15M',
  cookTime: 'PT15M',
  totalTime: 'PT30M',
  recipeYield: '4 servings',
  recipeCategory: 'Main Course',
  recipeCuisine: 'Italian',
  keywords: 'Baked Salmon Piccata Recipe',
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
  nutrition: null,
  aggregateRating: null,
  video: null
};

console.log('🧪 Testing recipe validation logic\n');

console.log('Recipe data:', {
  name: mockRecipe.name,
  image: mockRecipe.image,
  ingredientCount: mockRecipe.recipeIngredient?.length || 0,
  instructionCount: mockRecipe.recipeInstructions?.length || 0
});

// Test the validation logic
const hasName = !!mockRecipe.name;
const hasImage = !!mockRecipe.image;
const hasIngredients = mockRecipe.recipeIngredient && mockRecipe.recipeIngredient.length > 0;
const hasInstructions = mockRecipe.recipeInstructions && mockRecipe.recipeInstructions.length > 0;

console.log('\nValidation results:');
console.log('✅ Has name:', hasName);
console.log('✅ Has image:', hasImage);
console.log('✅ Has ingredients:', hasIngredients);
console.log('✅ Has instructions:', hasInstructions);

if (!hasName || !hasImage || !hasIngredients || !hasInstructions) {
  console.log('\n❌ Recipe validation FAILED - missing required fields:', {
    hasName,
    hasImage,
    hasIngredients,
    hasInstructions
  });
} else {
  console.log('\n✅ Recipe validation PASSED - all required fields present');
}

// Test the specific validation that's used in the clipper
const validationCheck = !mockRecipe.name || !mockRecipe.image || 
    !mockRecipe.recipeIngredient || mockRecipe.recipeIngredient.length === 0 ||
    !mockRecipe.recipeInstructions || mockRecipe.recipeInstructions.length === 0;

console.log('\nFinal validation result:', !validationCheck ? 'PASSED' : 'FAILED');
console.log('Validation expression result:', validationCheck);
