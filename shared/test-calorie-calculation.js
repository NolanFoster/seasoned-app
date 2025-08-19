import { calculateNutritionalFacts } from './nutrition-calculator.js';

// Test with a simple recipe
async function testCalorieCalculation() {
  // Example: Simple pasta recipe
  const ingredients = [
    { name: 'pasta', quantity: 200, unit: 'g' },  // ~350 cal per 100g = 700 cal
    { name: 'olive oil', quantity: 2, unit: 'tablespoon' }, // ~120 cal per tbsp = 240 cal
    { name: 'garlic', quantity: 2, unit: 'clove' }, // ~4 cal per clove = 8 cal
    { name: 'tomato sauce', quantity: 1, unit: 'cup' } // ~35 cal per 100g, 1 cup = ~240g = 84 cal
  ];
  
  // Total expected: ~1032 calories for entire recipe
  // Per serving (4 servings): ~258 calories
  
  const apiKey = process.env.USDA_API_KEY;
  if (!apiKey) {
    console.error('Please set USDA_API_KEY environment variable');
    return;
  }
  
  try {
    const result = await calculateNutritionalFacts(ingredients, apiKey, 4);
    
    console.log('Calculation Result:');
    console.log('Success:', result.success);
    console.log('Processed ingredients:', result.processedIngredients, '/', result.totalIngredients);
    
    if (result.nutrition) {
      console.log('\nNutrition per serving:');
      console.log('Calories:', result.nutrition.calories);
      console.log('Protein:', result.nutrition.proteinContent);
      console.log('Fat:', result.nutrition.fatContent);
      console.log('Carbs:', result.nutrition.carbohydrateContent);
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

// Run the test
testCalorieCalculation();