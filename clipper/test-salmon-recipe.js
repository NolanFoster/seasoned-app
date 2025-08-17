/**
 * Test script for testing the clipper with the salmon recipe URL
 */

// Test configuration
const CLIPPER_URL = 'https://recipe-clipper-worker.nolanfoster.workers.dev'; // Update with your deployed clipper URL
const TEST_RECIPE_URL = 'https://whatscookingamerica.net/bksalpiccata.htm';

async function testSalmonRecipe() {
  console.log('🧪 Testing Recipe Clipper with Salmon Recipe\n');
  console.log('URL:', TEST_RECIPE_URL);
  console.log('Clipper:', CLIPPER_URL);
  
  try {
    // Test 1: Health check
    console.log('\n1. Testing health check...');
    const healthResponse = await fetch(`${CLIPPER_URL}/health`);
    if (!healthResponse.ok) {
      throw new Error(`Health check failed: ${healthResponse.status} ${healthResponse.statusText}`);
    }
    const healthData = await healthResponse.json();
    console.log('✅ Health check response:', healthData);
    
    // Test 2: Clip the salmon recipe
    console.log('\n2. Testing recipe clipping...');
    const clipResponse = await fetch(`${CLIPPER_URL}/clip`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: TEST_RECIPE_URL })
    });
    
    if (!clipResponse.ok) {
      const errorText = await clipResponse.text();
      console.error('❌ Clip failed:', clipResponse.status, clipResponse.statusText);
      console.error('Error details:', errorText);
      throw new Error(`Clip failed: ${clipResponse.status} ${clipResponse.statusText}`);
    }
    
    const clipData = await clipResponse.json();
    console.log('✅ Clip response received!');
    console.log('Recipe name:', clipData.name);
    console.log('Cached:', clipData.cached);
    console.log('Saved to KV:', clipData.savedToKV);
    console.log('Recipe ID:', clipData.recipeId);
    
    // Display recipe details
    if (clipData.recipeIngredient) {
      console.log('\n📝 Ingredients:', clipData.recipeIngredient.length);
      clipData.recipeIngredient.forEach((ingredient, i) => {
        console.log(`  ${i + 1}. ${ingredient}`);
      });
    }
    
    if (clipData.recipeInstructions) {
      console.log('\n👨‍🍳 Instructions:', clipData.recipeInstructions.length);
      clipData.recipeInstructions.forEach((instruction, i) => {
        const text = typeof instruction === 'string' ? instruction : instruction.text || instruction.name || JSON.stringify(instruction);
        console.log(`  ${i + 1}. ${text}`);
      });
    }
    
    if (clipData.description) {
      console.log('\n📖 Description:', clipData.description);
    }
    
    if (clipData.prepTime || clipData.cookTime || clipData.totalTime) {
      console.log('\n⏱️  Timing:');
      if (clipData.prepTime) console.log('  Prep time:', clipData.prepTime);
      if (clipData.cookTime) console.log('  Cook time:', clipData.cookTime);
      if (clipData.totalTime) console.log('  Total time:', clipData.totalTime);
    }
    
    if (clipData.recipeYield) {
      console.log('\n👥 Servings:', clipData.recipeYield);
    }
    
    console.log('\n🎉 Recipe clipping test completed successfully!');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error('Stack trace:', error.stack);
  }
}

// Run the test
testSalmonRecipe();
