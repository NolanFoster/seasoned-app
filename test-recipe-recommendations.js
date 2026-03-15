#!/usr/bin/env node

/**
 * Test script for recipe recommendations
 * This script tests the recipe recommendation worker to verify it returns proper recipe data
 */

const RECOMMENDATION_WORKER_URL = 'https://recipe-recommendation-worker.nolanfoster.workers.dev';

async function testRecipeRecommendations() {
  console.log('🧪 Testing Recipe Recommendations...\n');

  try {
    // Test 1: Basic recommendation request
    console.log('1️⃣ Testing basic recommendation request...');
    const response = await fetch(`${RECOMMENDATION_WORKER_URL}/recommendations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        location: 'San Francisco, CA',
        date: '2024-01-15',
        limit: 3
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    console.log('✅ Recommendation request successful');
    console.log(`📊 Response structure:`, {
      hasRecommendations: !!data.recommendations,
      categoriesCount: data.recommendations ? Object.keys(data.recommendations).length : 0,
      isMockData: data.isMockData,
      season: data.season,
      location: data.location
    });

    // Test 2: Check recipe data quality
    if (data.recommendations) {
      console.log('\n2️⃣ Analyzing recipe data quality...');
      
      let totalRecipes = 0;
      let recipesWithNames = 0;
      let recipesWithDescriptions = 0;
      let recipesWithIngredients = 0;
      let recipesWithInstructions = 0;
      let unknownRecipes = 0;

      Object.entries(data.recommendations).forEach(([categoryName, recipes]) => {
        console.log(`\n📂 Category: ${categoryName}`);
        console.log(`   Recipes: ${recipes.length}`);
        
        recipes.forEach((recipe, index) => {
          totalRecipes++;
          
          if (recipe.name && recipe.name !== 'Unknown Recipe') {
            recipesWithNames++;
          } else {
            unknownRecipes++;
            console.log(`   ⚠️  Recipe ${index + 1}: ${recipe.name} (ID: ${recipe.id})`);
          }
          
          if (recipe.description && recipe.description.trim()) {
            recipesWithDescriptions++;
          }
          
          if (recipe.ingredients && Array.isArray(recipe.ingredients) && recipe.ingredients.length > 0) {
            recipesWithIngredients++;
          }
          
          if (recipe.instructions && Array.isArray(recipe.instructions) && recipe.instructions.length > 0) {
            recipesWithInstructions++;
          }
          
          console.log(`   ${index + 1}. ${recipe.name}`);
          console.log(`      Description: ${recipe.description ? recipe.description.substring(0, 100) + '...' : 'None'}`);
          console.log(`      Ingredients: ${recipe.ingredients ? recipe.ingredients.length : 0} items`);
          console.log(`      Instructions: ${recipe.instructions ? recipe.instructions.length : 0} steps`);
          console.log(`      Source: ${recipe.source || 'unknown'}`);
          console.log(`      Type: ${recipe.type || 'unknown'}`);
        });
      });

      console.log('\n📈 Recipe Data Quality Summary:');
      console.log(`   Total recipes: ${totalRecipes}`);
      console.log(`   Recipes with proper names: ${recipesWithNames} (${((recipesWithNames/totalRecipes)*100).toFixed(1)}%)`);
      console.log(`   Recipes with descriptions: ${recipesWithDescriptions} (${((recipesWithDescriptions/totalRecipes)*100).toFixed(1)}%)`);
      console.log(`   Recipes with ingredients: ${recipesWithIngredients} (${((recipesWithIngredients/totalRecipes)*100).toFixed(1)}%)`);
      console.log(`   Recipes with instructions: ${recipesWithInstructions} (${((recipesWithInstructions/totalRecipes)*100).toFixed(1)}%)`);
      console.log(`   Unknown recipes: ${unknownRecipes} (${((unknownRecipes/totalRecipes)*100).toFixed(1)}%)`);

      if (unknownRecipes > 0) {
        console.log('\n❌ ISSUE DETECTED: Some recipes have "Unknown Recipe" names');
        console.log('   This suggests the recipe data mapping is not working correctly.');
      } else {
        console.log('\n✅ SUCCESS: All recipes have proper names!');
      }
    }

    // Test 3: Health check
    console.log('\n3️⃣ Testing health endpoint...');
    const healthResponse = await fetch(`${RECOMMENDATION_WORKER_URL}/health`);
    if (healthResponse.ok) {
      const healthData = await healthResponse.json();
      console.log('✅ Health check successful');
      console.log(`   Status: ${healthData.status}`);
      console.log(`   AI Status: ${healthData.services?.ai || 'unknown'}`);
    } else {
      console.log('❌ Health check failed');
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

// Run the test
testRecipeRecommendations()
  .then(() => {
    console.log('\n🎉 Recipe recommendation test completed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Test failed with error:', error);
    process.exit(1);
  });

