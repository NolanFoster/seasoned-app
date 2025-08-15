#!/usr/bin/env node

/**
 * Demo script showing how the recipe clipper would work with AllRecipes
 * This simulates the AI response that would be generated from the actual webpage
 */

import { extractRecipeFromAIResponse } from '../src/recipe-clipper.js';

console.log('🍳 AllRecipes Recipe Clipper Demo\n');
console.log('Testing against: https://www.allrecipes.com/recipe/235171/chef-johns-salt-roasted-chicken/\n');

// Simulate the AI response that would be generated from the actual AllRecipes page
const simulatedAIResponse = {
  source: {
    output: [
      {
        content: [{
          text: JSON.stringify({
            name: "Chef John's Salt-Roasted Chicken",
            description: "A simple and delicious salt-roasted chicken recipe that results in juicy, flavorful meat with crispy skin. This method uses a generous coating of kosher salt to create a perfectly seasoned and moist chicken.",
            ingredients: [
              "1 (4 to 5 pound) whole chicken",
              "3 cups kosher salt",
              "1/4 cup olive oil",
              "1 tablespoon black pepper",
              "1 tablespoon dried thyme",
              "1 tablespoon dried rosemary",
              "1 lemon, halved",
              "4 cloves garlic, crushed",
              "1 onion, quartered",
              "2 tablespoons butter, melted (optional)"
            ],
            instructions: [
              "Preheat oven to 450 degrees F (230 degrees C).",
              "Rinse chicken and pat dry with paper towels. Remove any giblets from the cavity.",
              "In a large bowl, mix together kosher salt, black pepper, thyme, and rosemary until well combined.",
              "Rub the chicken with olive oil, ensuring it's evenly coated on all sides.",
              "Generously coat the chicken with the salt mixture, pressing it into the skin to adhere.",
              "Place lemon halves, garlic, and onion inside the chicken cavity for additional flavor.",
              "Place chicken in a roasting pan, breast side up, and roast for 1 hour and 15 minutes, or until internal temperature reaches 165 degrees F (74 degrees C) when measured with a meat thermometer.",
              "Let chicken rest for 10 minutes before carving and serving to allow juices to redistribute.",
              "Optional: Brush with melted butter for extra richness before serving."
            ],
            image_url: "https://images.media-allrecipes.com/userphotos/560x315/235171.jpg",
            prep_time: "15 minutes",
            cook_time: "1 hour 15 minutes",
            total_time: "1 hour 30 minutes",
            servings: "6",
            difficulty: "Easy",
            nutrition: {
              "calories": "350 per serving",
              "protein": "45g",
              "fat": "18g",
              "carbohydrates": "2g"
            }
          })
        }]
      }
    ]
  }
};

console.log('📋 Simulated AI Response Structure:');
console.log(JSON.stringify(simulatedAIResponse, null, 2));

console.log('\n🔧 Processing with Recipe Clipper...\n');

try {
  // Process the simulated AI response through our recipe clipper
  const extractedRecipe = extractRecipeFromAIResponse(
    simulatedAIResponse,
    "https://www.allrecipes.com/recipe/235171/chef-johns-salt-roasted-chicken/"
  );
  
  if (extractedRecipe) {
    console.log('✅ Recipe Successfully Extracted!\n');
    
    console.log('📖 EXTRACTED RECIPE:');
    console.log('='.repeat(60));
    console.log(`🍗 ${extractedRecipe.name}`);
    console.log('='.repeat(60));
    
    if (extractedRecipe.description) {
      console.log(`\n📝 Description: ${extractedRecipe.description}`);
    }
    
    console.log(`\n⏱️  Prep Time: ${extractedRecipe.prep_time || 'Not specified'}`);
    console.log(`🔥 Cook Time: ${extractedRecipe.cook_time || 'Not specified'}`);
    console.log(`👥 Servings: ${extractedRecipe.servings || 'Not specified'}`);
    console.log(`📊 Difficulty: ${extractedRecipe.difficulty || 'Not specified'}`);
    
    console.log('\n🥘 INGREDIENTS:');
    console.log('-'.repeat(40));
    extractedRecipe.ingredients.forEach((ingredient, index) => {
      console.log(`${index + 1}. ${ingredient}`);
    });
    
    console.log('\n👨‍🍳 INSTRUCTIONS:');
    console.log('-'.repeat(40));
    extractedRecipe.instructions.forEach((instruction, index) => {
      console.log(`${index + 1}. ${instruction}`);
    });
    
    if (extractedRecipe.image_url) {
      console.log(`\n🖼️  Image: ${extractedRecipe.image_url}`);
    }
    
    console.log(`\n🔗 Source: ${extractedRecipe.source_url}`);
    
    console.log('\n📊 Recipe Data Structure:');
    console.log(JSON.stringify(extractedRecipe, null, 2));
    
  } else {
    console.log('❌ No recipe could be extracted from the AI response');
  }
  
} catch (error) {
  console.error('❌ Error processing recipe:', error.message);
}

console.log('\n🎯 Demo completed!');
console.log('\nThis demonstrates how the recipe clipper would:');
console.log('1. Receive AI-generated recipe data from AllRecipes');
console.log('2. Parse and validate the recipe structure');
console.log('3. Clean and format the data');
console.log('4. Return a standardized recipe object');
console.log('\nThe actual implementation would fetch the webpage, send it to AI, and process the response.'); 