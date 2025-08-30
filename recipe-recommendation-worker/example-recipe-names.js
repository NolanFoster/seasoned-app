/**
 * Example usage of the new /recipe-names endpoint
 * This demonstrates how to get AI-generated recipe names by category with limits
 */

// Example function to call the recipe-names endpoint
async function getRecipeNamesByCategory(categories, limit = 5) {
  try {
    const response = await fetch('http://localhost:8787/recipe-names', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        categories: categories,
        limit: limit
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error calling recipe-names endpoint:', error);
    throw error;
  }
}

// Example usage scenarios
async function demonstrateRecipeNames() {
  console.log('🍳 Recipe Names Endpoint Examples\n');

  try {
    // Example 1: Get Italian and Asian cuisine recipes
    console.log('1. Italian & Asian Cuisine Recipes:');
    const italianAsian = await getRecipeNamesByCategory(['Italian Cuisine', 'Asian Fusion'], 4);
    console.log(JSON.stringify(italianAsian, null, 2));
    console.log('\n');

    // Example 2: Get comfort food and desserts
    console.log('2. Comfort Food & Desserts:');
    const comfortDesserts = await getRecipeNamesByCategory(['Comfort Food', 'Desserts'], 3);
    console.log(JSON.stringify(comfortDesserts, null, 2));
    console.log('\n');

    // Example 3: Get healthy options with higher limit
    console.log('3. Healthy Options (8 recipes):');
    const healthy = await getRecipeNamesByCategory(['Healthy Options'], 8);
    console.log(JSON.stringify(healthy, null, 2));
    console.log('\n');

    // Example 4: Single category with default limit
    console.log('4. Quick Meals (default limit):');
    const quickMeals = await getRecipeNamesByCategory(['Quick Meals']);
    console.log(JSON.stringify(quickMeals, null, 2));

  } catch (error) {
    console.error('Demo failed:', error.message);
  }
}

// Example of the expected response structure
console.log('📋 Expected Response Structure:');
console.log(JSON.stringify({
  recipeNames: {
    "Italian Cuisine": [
      "Margherita Pizza",
      "Spaghetti Carbonara", 
      "Risotto ai Funghi",
      "Osso Buco",
      "Tiramisu"
    ],
    "Asian Fusion": [
      "Thai Green Curry",
      "Sushi Roll Combo",
      "Korean BBQ Beef",
      "Vietnamese Pho"
    ]
  },
  requestId: "req_1234567890_abc123",
  processingTime: "245ms",
  recipesPerCategory: 4,
  categories: ["Italian Cuisine", "Asian Fusion"]
}, null, 2));

console.log('\n🚀 To run the examples, start the worker with:');
console.log('   npm run dev');
console.log('\nThen in another terminal, run:');
console.log('   node example-recipe-names.js');

// Export for use in other modules
export { getRecipeNamesByCategory, demonstrateRecipeNames };

// If running directly, show the demo
if (import.meta.url === `file://${process.argv[1]}`) {
  demonstrateRecipeNames();
}