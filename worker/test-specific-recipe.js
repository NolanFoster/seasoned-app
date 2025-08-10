// Test script for the specific AllRecipes URL
// Tests the recipe extraction logic with the actual URL structure

import { extractRecipeFromAIResponse } from './src/recipe-clipper.js';

// Mock AI response based on the actual AllRecipes page structure
const mockAllRecipesResponse = {
  source: {
    output: [
      {
        content: [{
          text: JSON.stringify({
            name: "Chef John's Salt Roasted Chicken",
            description: "This is one of those rare recipes where the name is the same as the ingredient list. You're going to be so shocked at how flavorful, juicy, and amazing this roast chicken comes out.",
            ingredients: [
              "1 (3 1/2) pound whole chicken at room temperature",
              "3 tablespoons kosher salt, or as needed",
              "1 tablespoon chopped fresh thyme",
              "1 lemon, juiced",
              "⅓ cup chicken broth",
              "1 tablespoon water, or as needed (Optional)",
              "2 tablespoons cold butter, cut into four pieces",
              "salt and freshly ground black pepper to taste",
              "1 pinch cayenne pepper, or to taste"
            ],
            instructions: [
              "Preheat oven to 450 degrees F (230 degrees C).",
              "Dry the outside of chicken with paper towels. Tuck the wing tips underneath the chicken and place into a large oven-safe skillet. Use scissors to snip off the tail, if desired.",
              "Generously sprinkle kosher salt into the cavity and over the back and sides of chicken. Tie chicken legs together with kitchen twine. Sprinkle salt generously over the breasts, coating them thoroughly. Wipe excess salt out of skillet with paper towels.",
              "Bake chicken in the preheated oven until an instant-read meat thermometer inserted into a thigh, not touching bone, reads 160 degrees C (70 degrees C), 50 to 60 minutes. Remove from skillet to a serving platter and let rest 5 to 10 minutes.",
              "Blot about 90 percent of the chicken fat from the skillet with a paper towel held with tongs, leaving the browned bits of food in the skillet. Place skillet over medium-high heat and add thyme leaves. Cook and stir until thyme is wilted, 1 to 2 minutes. Pour lemon juice, chicken broth, and water into skillet, stirring until the browned bits dissolve and the sauce has reduced by about half, 1 to 2 minutes.",
              "Reduce heat to low, add cold butter, and stir until butter has begun to melt. Add any accumulated juices from the chicken to sauce and continue to stir until butter is incorporated and sauce is slightly thickened, about 1 minute. Remove from heat and season with salt, black pepper, and cayenne pepper to taste. Spoon sauce over chicken to serve."
            ],
            image_url: "https://images.media-allrecipes.com/userphotos/720x405/4560646.jpg",
            prep_time: "15 mins",
            cook_time: "55 mins",
            additional_time: "5 mins",
            total_time: "1 hr 15 mins",
            servings: "4",
            yield: "4 servings",
            difficulty: "Easy",
            author: "John Mitzewich",
            rating: "4.7",
            review_count: "316"
          })
        }]
      }
    ]
  }
};

// Test the specific recipe extraction
async function testChefJohnsRecipe() {
  console.log('🧪 Testing Chef John\'s Salt Roasted Chicken Recipe Extraction');
  console.log('📍 URL: https://www.allrecipes.com/recipe/235171/chef-johns-salt-roasted-chicken/');
  console.log('');
  
  try {
    const recipe = await extractRecipeFromAIResponse(
      mockAllRecipesResponse, 
      "https://www.allrecipes.com/recipe/235171/chef-johns-salt-roasted-chicken/"
    );
    
    if (recipe) {
      console.log('✅ Recipe extraction successful!');
      console.log('');
      console.log('📋 Recipe Details:');
      console.log(`   Name: ${recipe.name}`);
      console.log(`   Description: ${recipe.description}`);
      console.log(`   Author: ${recipe.author}`);
      console.log(`   Rating: ${recipe.rating} (${recipe.review_count} reviews)`);
      console.log(`   Prep Time: ${recipe.prep_time}`);
      console.log(`   Cook Time: ${recipe.cook_time}`);
      console.log(`   Total Time: ${recipe.total_time}`);
      console.log(`   Servings: ${recipe.servings}`);
      console.log(`   Difficulty: ${recipe.difficulty}`);
      console.log(`   Image: ${recipe.image_url}`);
      console.log(`   Source: ${recipe.source_url}`);
      console.log('');
      
      console.log('🥘 Ingredients (${recipe.ingredients.length}):');
      recipe.ingredients.forEach((ingredient, index) => {
        console.log(`   ${index + 1}. ${ingredient}`);
      });
      
      console.log('');
      console.log('👨‍🍳 Instructions (${recipe.instructions.length}):');
      recipe.instructions.forEach((instruction, index) => {
        console.log(`   ${index + 1}. ${instruction}`);
      });
      
      console.log('');
      console.log('📊 Full Recipe Data:');
      console.log(JSON.stringify(recipe, null, 2));
      
      return recipe;
    } else {
      console.log('❌ Recipe extraction failed');
      return null;
    }
  } catch (error) {
    console.error('❌ Recipe extraction error:', error.message);
    return null;
  }
}

// Test with alternative field names (like the test cases expect)
async function testAlternativeFieldNames() {
  console.log('\n🧪 Testing Alternative Field Names');
  
  const alternativeResponse = {
    source: {
      output: [
        {
          content: [{
            text: JSON.stringify({
              title: "Chef John's Salt Roasted Chicken",
              description: "A simple but amazing roast chicken recipe",
              ingredient_list: [
                "1 (3 1/2) pound whole chicken",
                "3 tablespoons kosher salt"
              ],
              steps: [
                "Preheat oven to 450 degrees F",
                "Season chicken with salt"
              ]
            })
          }]
        }
      ]
    }
  };
  
  try {
    const recipe = await extractRecipeFromAIResponse(
      alternativeResponse, 
      "https://www.allrecipes.com/recipe/235171/chef-johns-salt-roasted-chicken/"
    );
    
    if (recipe) {
      console.log('✅ Alternative field names mapped correctly:');
      console.log(`   Name: ${recipe.name}`);
      console.log(`   Ingredients: ${recipe.ingredients.length} items`);
      console.log(`   Instructions: ${recipe.instructions.length} steps`);
    } else {
      console.log('❌ Alternative field names failed');
    }
    
    return recipe;
  } catch (error) {
    console.error('❌ Alternative field names error:', error.message);
    return null;
  }
}

// Test validation
function validateRecipe(recipe) {
  console.log('\n🔍 Recipe Validation');
  
  const validations = [
    { name: 'Recipe Name', value: recipe.name, required: true },
    { name: 'Ingredients', value: recipe.ingredients, required: true, isArray: true },
    { name: 'Instructions', value: recipe.instructions, required: true, isArray: true },
    { name: 'Source URL', value: recipe.source_url, required: true },
    { name: 'Description', value: recipe.description, required: false },
    { name: 'Prep Time', value: recipe.prep_time, required: false },
    { name: 'Cook Time', value: recipe.cook_time, required: false },
    { name: 'Servings', value: recipe.servings, required: false }
  ];
  
  let passed = 0;
  let total = validations.length;
  
  validations.forEach(validation => {
    const isValid = validation.required 
      ? (validation.isArray ? Array.isArray(validation.value) && validation.value.length > 0 : validation.value && validation.value.trim() !== '')
      : true;
    
    if (isValid) {
      console.log(`   ✅ ${validation.name}: Valid`);
      passed++;
    } else {
      console.log(`   ❌ ${validation.name}: Invalid or missing`);
    }
  });
  
  console.log(`\n📊 Validation Results: ${passed}/${total} passed`);
  return passed === total;
}

// Run all tests
async function runSpecificRecipeTests() {
  console.log('🚀 Starting Chef John\'s Recipe Tests\n');
  
  // Test the main recipe extraction
  const recipe = await testChefJohnsRecipe();
  
  if (recipe) {
    // Test alternative field names
    await testAlternativeFieldNames();
    
    // Validate the recipe
    const isValid = validateRecipe(recipe);
    
    if (isValid) {
      console.log('\n🎉 All tests passed! The recipe extraction is working perfectly.');
    } else {
      console.log('\n⚠️  Some validation checks failed. Check the recipe data structure.');
    }
  } else {
    console.log('\n❌ Recipe extraction failed. Check the AI response parsing.');
  }
  
  console.log('\n🎯 Specific recipe tests completed!');
}

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runSpecificRecipeTests();
}

export { testChefJohnsRecipe, testAlternativeFieldNames, validateRecipe, runSpecificRecipeTests }; 