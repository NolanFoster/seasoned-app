// Test script for the Recipe Clipper Worker
// Run this with: node test-clipper.js

const testUrl = 'https://www.allrecipes.com/recipe/10813/best-chocolate-chip-cookies/';

async function testRecipeClipper() {
  console.log('🧪 Testing Recipe Clipper Worker...\n');
  
  try {
    // Test the clip endpoint
    console.log('📝 Testing recipe extraction from:', testUrl);
    
    const response = await fetch('http://localhost:8787/clip', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: testUrl
      })
    });
    
    if (response.ok) {
      const recipe = await response.json();
      console.log('✅ Recipe extracted successfully!');
      console.log('📋 Recipe Details:');
      console.log(`   Name: ${recipe.name}`);
      console.log(`   Description: ${recipe.description}`);
      console.log(`   Ingredients: ${recipe.ingredients?.length || 0} items`);
      console.log(`   Instructions: ${recipe.instructions?.length || 0} steps`);
      console.log(`   Image: ${recipe.image_url || 'None'}`);
      console.log(`   Prep Time: ${recipe.prep_time || 'Not specified'}`);
      console.log(`   Cook Time: ${recipe.cook_time || 'Not specified'}`);
      console.log(`   Servings: ${recipe.servings || 'Not specified'}`);
      console.log(`   Difficulty: ${recipe.difficulty || 'Not specified'}`);
      
      if (recipe.ingredients && recipe.ingredients.length > 0) {
        console.log('\n🥘 Sample Ingredients:');
        recipe.ingredients.slice(0, 3).forEach((ingredient, index) => {
          console.log(`   ${index + 1}. ${ingredient}`);
        });
      }
      
      if (recipe.instructions && recipe.instructions.length > 0) {
        console.log('\n👨‍🍳 Sample Instructions:');
        recipe.instructions.slice(0, 3).forEach((instruction, index) => {
          console.log(`   ${index + 1}. ${instruction}`);
        });
      }
    } else {
      const errorText = await response.text();
      console.error(`❌ Error: ${response.status} - ${errorText}`);
    }
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.log('\n💡 Make sure the worker is running with: npm run dev');
  }
}

async function testHealthEndpoint() {
  try {
    console.log('\n🏥 Testing health endpoint...');
    
    const response = await fetch('http://localhost:8787/health');
    
    if (response.ok) {
      const health = await response.json();
      console.log('✅ Health check passed:', health);
    } else {
      console.error('❌ Health check failed:', response.status);
    }
  } catch (error) {
    console.error('❌ Health check error:', error.message);
  }
}

// Run tests
async function runTests() {
  await testHealthEndpoint();
  await testRecipeClipper();
  
  console.log('\n🎯 Test completed!');
  console.log('\n📚 To use the worker in production:');
  console.log('   1. Deploy: npm run deploy');
  console.log('   2. The worker will automatically use Cloudflare Workers AI');
  console.log('   3. Update the frontend to use the new worker URL');
}

runTests().catch(console.error); 