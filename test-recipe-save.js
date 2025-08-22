#!/usr/bin/env node

// Test script for saving a recipe to KV storage using the recipe-save-worker

async function testRecipeSave() {
  const recipeUrl = 'https://www.allrecipes.com/recipe/23037/easy-beginners-turkey-with-stuffing/';
  
  // You'll need to update this with your actual worker URL
  // This could be local (using wrangler dev) or deployed
  const WORKER_URL = process.env.RECIPE_SAVE_WORKER_URL || 'http://localhost:8787';
  
  console.log('Testing recipe save functionality...');
  console.log('Recipe URL:', recipeUrl);
  console.log('Worker URL:', WORKER_URL);
  console.log('---');
  
  try {
    // First, we need to scrape the recipe data
    // In a real scenario, this would be done by the recipe-scraper worker
    const recipeData = {
      url: recipeUrl,
      title: "Easy Beginner's Turkey with Stuffing",
      description: "This is a simple recipe for beginners to make a delicious turkey with stuffing.",
      ingredients: [
        "1 (10 pound) whole turkey, neck and giblets removed",
        "1/2 cup butter, divided",
        "2 cups warm water",
        "1 (14 ounce) package herb-seasoned stuffing mix",
        "1 tablespoon dried sage",
        "1 tablespoon dried thyme",
        "1 tablespoon dried rosemary",
        "salt and pepper to taste"
      ],
      instructions: [
        "Preheat oven to 350 degrees F (175 degrees C).",
        "Rinse turkey and pat dry. Place turkey in a roasting pan.",
        "In a small bowl, combine 1/4 cup butter, sage, thyme, rosemary, salt, and pepper. Rub butter mixture all over the outside and inside of turkey.",
        "In a medium bowl, mix together stuffing mix, water, and remaining 1/4 cup butter. Spoon stuffing into body cavity of turkey.",
        "Cover turkey loosely with aluminum foil.",
        "Bake in the preheated oven for 3 to 3 1/2 hours, or until the internal temperature of the thigh reaches 180 degrees F (85 degrees C).",
        "Remove foil during last 45 minutes of cooking to brown the turkey."
      ],
      prepTime: "PT20M",
      cookTime: "PT3H30M",
      totalTime: "PT3H50M",
      servings: 10,
      imageUrl: "https://www.allrecipes.com/thmb/QSMcUYDYPbK-JhMaVoUAJBLqjQw=/750x0/filters:no_upscale():max_bytes(150000):strip_icc():format(webp)/23037-easy-beginners-turkey-with-stuffing-DDMFS-4x3-c06ade3655c6485590b1f4a01055ad66.jpg"
    };
    
    console.log('Sending save request to worker...');
    
    // Send save request to the worker
    const response = await fetch(`${WORKER_URL}/save`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        recipe: recipeData,
        options: {
          overwrite: true // Allow overwriting if recipe already exists
        }
      })
    });
    
    const result = await response.json();
    
    console.log('Response status:', response.status);
    console.log('Response body:', JSON.stringify(result, null, 2));
    
    if (response.ok && result.success) {
      console.log('\n✅ Recipe saved successfully!');
      console.log('Recipe ID:', result.id);
      
      // Now let's verify by fetching the recipe
      console.log('\nVerifying saved recipe...');
      const getResponse = await fetch(`${WORKER_URL}/get?id=${result.id}`);
      const savedRecipe = await getResponse.json();
      
      if (getResponse.ok) {
        console.log('✅ Recipe retrieved successfully!');
        console.log('Title:', savedRecipe.title);
        console.log('URL:', savedRecipe.url);
        console.log('Ingredients count:', savedRecipe.ingredients?.length);
        console.log('Instructions count:', savedRecipe.instructions?.length);
        console.log('Has image:', !!savedRecipe.imageUrl);
        console.log('Has nutrition:', !!savedRecipe.nutrition);
      } else {
        console.log('❌ Failed to retrieve recipe:', savedRecipe);
      }
    } else {
      console.log('\n❌ Failed to save recipe:', result);
    }
    
  } catch (error) {
    console.error('\n❌ Error during test:', error);
  }
}

// Check if we have a worker URL
if (!process.env.RECIPE_SAVE_WORKER_URL) {
  console.log('ℹ️  No RECIPE_SAVE_WORKER_URL environment variable set.');
  console.log('   Defaulting to http://localhost:8787');
  console.log('   To use a different URL, set: export RECIPE_SAVE_WORKER_URL=<your-worker-url>');
  console.log('');
}

// Run the test
testRecipeSave();