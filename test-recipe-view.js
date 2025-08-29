#!/usr/bin/env node

// Test script for recipe-view-worker

const RECIPE_URL = 'https://www.allrecipes.com/recipe/23037/easy-beginners-turkey-with-stuffing/';
const SAVE_WORKER_URL = process.env.RECIPE_SAVE_WORKER_URL || 'http://localhost:8787';
const VIEW_WORKER_URL = process.env.RECIPE_VIEW_WORKER_URL || 'http://localhost:8789';

// Function to generate recipe ID (same logic as in the workers)
async function generateRecipeId(url) {
  const encoder = new TextEncoder();
  const data = encoder.encode(url);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex.substring(0, 16); // Use first 16 characters
}

async function testRecipeView() {
  console.log('🧪 Testing Recipe View Worker');
  console.log('=============================');
  console.log('Recipe URL:', RECIPE_URL);
  console.log('Save Worker URL:', SAVE_WORKER_URL);
  console.log('View Worker URL:', VIEW_WORKER_URL);
  console.log('');

  try {
    // Step 1: Calculate the recipe ID
    console.log('📋 Step 1: Calculating recipe ID...');
    const recipeId = await generateRecipeId(RECIPE_URL);
    console.log('Recipe ID:', recipeId);
    console.log('');

    // Step 2: Check if recipe exists in storage
    console.log('🔍 Step 2: Checking if recipe exists in storage...');
    const checkResponse = await fetch(`${SAVE_WORKER_URL}/get?id=${recipeId}`);
    
    if (!checkResponse.ok) {
      console.log('⚠️  Recipe not found in storage. Let me save it first...');
      
      // Save the recipe
      const recipeData = {
        url: RECIPE_URL,
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

      const saveResponse = await fetch(`${SAVE_WORKER_URL}/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipe: recipeData, options: { overwrite: true } })
      });

      const saveResult = await saveResponse.json();
      if (!saveResponse.ok || !saveResult.success) {
        throw new Error(`Failed to save recipe: ${JSON.stringify(saveResult)}`);
      }
      console.log('✅ Recipe saved successfully!');
    } else {
      const recipe = await checkResponse.json();
      console.log('✅ Recipe found in storage!');
      console.log('   Title:', recipe.title);
    }
    console.log('');

    // Step 3: Test the recipe view endpoint
    console.log('🌐 Step 3: Testing recipe view endpoint...');
    const viewUrl = `${VIEW_WORKER_URL}/recipe/${recipeId}`;
    console.log('View URL:', viewUrl);
    
    const viewResponse = await fetch(viewUrl);
    
    if (!viewResponse.ok) {
      throw new Error(`View request failed: ${viewResponse.status} ${viewResponse.statusText}`);
    }

    const html = await viewResponse.text();
    console.log('✅ Recipe view returned successfully!');
    console.log('   Status:', viewResponse.status);
    console.log('   Content-Type:', viewResponse.headers.get('content-type'));
    console.log('   Content Length:', html.length, 'bytes');
    console.log('');

    // Step 4: Analyze the HTML content
    console.log('📄 Step 4: Analyzing HTML content...');
    
    // Check for key elements in the HTML
    const checks = {
      'Has title': html.includes("Easy Beginner's Turkey with Stuffing") || html.includes("Easy Beginners Turkey"),
      'Has ingredients section': html.includes('ingredient') || html.includes('Ingredient'),
      'Has instructions section': html.includes('instruction') || html.includes('Instruction'),
      'Has turkey ingredient': html.includes('turkey'),
      'Has HTML structure': html.includes('<!DOCTYPE html>') || html.includes('<html'),
      'Has recipe schema': html.includes('application/ld+json') || html.includes('Recipe'),
      'Has responsive meta tag': html.includes('viewport')
    };

    Object.entries(checks).forEach(([check, passed]) => {
      console.log(`   ${passed ? '✅' : '❌'} ${check}`);
    });
    console.log('');

    // Step 5: Test API endpoint
    console.log('🔌 Step 5: Testing API endpoint...');
    const apiResponse = await fetch(`${VIEW_WORKER_URL}/api/recipe/${recipeId}`);
    
    if (apiResponse.ok) {
      const apiData = await apiResponse.json();
      console.log('✅ API endpoint returned data!');
      console.log('   Recipe ID:', apiData.id || recipeId);
      console.log('   Title:', apiData.title);
      console.log('   Has nutrition:', !!apiData.nutrition);
    } else {
      console.log('ℹ️  No API endpoint available (HTML-only view worker)');
    }

    // Display the view URL for manual testing
    console.log('\n🎉 Test completed successfully!');
    console.log('\n📱 To view the recipe in your browser, visit:');
    console.log(`   ${viewUrl}`);
    
    // If running locally, also show deployed URL
    if (VIEW_WORKER_URL.includes('localhost')) {
      console.log('\n   Or use the deployed version:');
      console.log(`   https://recipe-view-worker.nolanfoster.workers.dev/recipe/${recipeId}`);
    }

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

// Display usage instructions
console.log('📋 Usage Instructions:');
console.log('1. Start the recipe-save-worker:');
console.log('   cd recipe-save-worker && npx wrangler dev --port 8787');
console.log('');
console.log('2. Start the recipe-view-worker:');
console.log('   cd recipe-view-worker && npx wrangler dev --port 8789');
console.log('');
console.log('3. Run this test:');
console.log('   node test-recipe-view.js');
console.log('');
console.log('Or test against deployed workers:');
console.log('   RECIPE_SAVE_WORKER_URL=<url> RECIPE_VIEW_WORKER_URL=<url> node test-recipe-view.js');
console.log('');
console.log('Starting test in 3 seconds...\n');

// Give user time to read instructions
setTimeout(testRecipeView, 3000);