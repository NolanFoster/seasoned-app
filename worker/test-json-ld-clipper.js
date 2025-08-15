// Integration test for JSON-LD recipe clipper
import fetch from 'node-fetch';

const CLIPPER_URL = process.env.CLIPPER_URL || 'http://localhost:8788';

async function testJsonLdClipper() {
  console.log('Testing JSON-LD recipe clipper...\n');
  console.log('Using clipper URL:', CLIPPER_URL);
  
  // Test with a URL known to have JSON-LD
  const testUrl = 'https://www.allrecipes.com/recipe/222000/spaghetti-aglio-e-olio/';
  
  console.log('\nTesting recipe extraction from:', testUrl);
  console.log('='.repeat(60));
  
  try {
    const startTime = Date.now();
    
    const response = await fetch(`${CLIPPER_URL}/clip`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url: testUrl })
    });
    
    const elapsed = Date.now() - startTime;
    
    if (!response.ok) {
      const error = await response.text();
      console.log(`❌ Failed: ${response.status} ${response.statusText}`);
      console.log('Error:', error);
      return;
    }
    
    const recipe = await response.json();
    
    console.log('✅ Recipe extracted successfully!');
    console.log('Time taken:', elapsed, 'ms');
    console.log('\nRecipe details:');
    console.log('- Name:', recipe.name);
    console.log('- Description:', recipe.description?.substring(0, 100) + '...');
    console.log('- Author:', recipe.author);
    console.log('- Prep time:', recipe.prepTime);
    console.log('- Cook time:', recipe.cookTime);
    console.log('- Total time:', recipe.totalTime);
    console.log('- Yield:', recipe.recipeYield);
    console.log('- Category:', recipe.recipeCategory);
    console.log('- Cuisine:', recipe.recipeCuisine);
    console.log('- Ingredients:', recipe.recipeIngredient?.length || 0);
    console.log('- Instructions:', recipe.recipeInstructions?.length || 0);
    console.log('- Has nutrition:', !!recipe.nutrition);
    console.log('- Has rating:', !!recipe.aggregateRating);
    console.log('- Has image:', !!recipe.image);
    
    // If extraction was very fast (< 2 seconds), it likely used JSON-LD
    if (elapsed < 2000) {
      console.log('\n✨ Extraction was very fast - likely used JSON-LD instead of LLM!');
    } else {
      console.log('\n⚡ Extraction took longer - might have used LLM fallback');
    }
    
    // Show sample ingredients
    if (recipe.recipeIngredient?.length > 0) {
      console.log('\nSample ingredients:');
      recipe.recipeIngredient.slice(0, 3).forEach((ing, i) => {
        console.log(`  ${i + 1}. ${ing}`);
      });
      if (recipe.recipeIngredient.length > 3) {
        console.log(`  ... and ${recipe.recipeIngredient.length - 3} more`);
      }
    }
    
    // Show sample instructions
    if (recipe.recipeInstructions?.length > 0) {
      console.log('\nSample instructions:');
      recipe.recipeInstructions.slice(0, 2).forEach((step, i) => {
        const text = typeof step === 'string' ? step : step.text;
        console.log(`  ${i + 1}. ${text?.substring(0, 100)}...`);
      });
      if (recipe.recipeInstructions.length > 2) {
        console.log(`  ... and ${recipe.recipeInstructions.length - 2} more steps`);
      }
    }
    
  } catch (error) {
    console.log('❌ Error:', error.message);
  }
}

// Run the test
testJsonLdClipper().catch(console.error);