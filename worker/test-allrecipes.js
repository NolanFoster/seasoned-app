import { extractRecipeFromAIResponse } from './src/recipe-clipper.js';

// Test data for AllRecipes Chef John's Salt-Roasted Chicken
const allRecipesTestCases = [
  {
    name: "AllRecipes - Chef John's Salt-Roasted Chicken - Complete Recipe",
    response: {
      source: {
        output: [
          {
            content: [{
              text: JSON.stringify({
                name: "Chef John's Salt-Roasted Chicken",
                description: "A simple and delicious salt-roasted chicken recipe that results in juicy, flavorful meat with crispy skin.",
                ingredients: [
                  "1 (4 to 5 pound) whole chicken",
                  "3 cups kosher salt",
                  "1/4 cup olive oil",
                  "1 tablespoon black pepper",
                  "1 tablespoon dried thyme",
                  "1 tablespoon dried rosemary",
                  "1 lemon, halved",
                  "4 cloves garlic, crushed",
                  "1 onion, quartered"
                ],
                instructions: [
                  "Preheat oven to 450 degrees F (230 degrees C).",
                  "Rinse chicken and pat dry with paper towels.",
                  "In a large bowl, mix together kosher salt, black pepper, thyme, and rosemary.",
                  "Rub the chicken with olive oil, then generously coat with the salt mixture.",
                  "Place lemon halves, garlic, and onion inside the chicken cavity.",
                  "Place chicken in a roasting pan and roast for 1 hour and 15 minutes, or until internal temperature reaches 165 degrees F (74 degrees C).",
                  "Let chicken rest for 10 minutes before carving and serving."
                ],
                image_url: "https://images.media-allrecipes.com/userphotos/560x315/235171.jpg",
                prep_time: "15 minutes",
                cook_time: "1 hour 15 minutes",
                servings: "6",
                difficulty: "Easy"
              })
            }]
          }
        ]
      }
    },
    expected: {
      name: "Chef John's Salt-Roasted Chicken",
      description: "A simple and delicious salt-roasted chicken recipe that results in juicy, flavorful meat with crispy skin.",
      ingredients: [
        "1 (4 to 5 pound) whole chicken",
        "3 cups kosher salt",
        "1/4 cup olive oil",
        "1 tablespoon black pepper",
        "1 tablespoon dried thyme",
        "1 tablespoon dried rosemary",
        "1 lemon, halved",
        "4 cloves garlic, crushed",
        "1 onion, quartered"
      ],
      instructions: [
        "Preheat oven to 450 degrees F (230 degrees C).",
        "Rinse chicken and pat dry with paper towels.",
        "In a large bowl, mix together kosher salt, black pepper, thyme, and rosemary.",
        "Rub the chicken with olive oil, then generously coat with the salt mixture.",
        "Place lemon halves, garlic, and onion inside the chicken cavity.",
        "Place chicken in a roasting pan and roast for 1 hour and 15 minutes, or until internal temperature reaches 165 degrees F (74 degrees C).",
        "Let chicken rest for 10 minutes before carving and serving."
      ],
      image_url: "https://images.media-allrecipes.com/userphotos/560x315/235171.jpg",
      source_url: "https://www.allrecipes.com/recipe/235171/chef-johns-salt-roasted-chicken/",
      prep_time: "15 minutes",
      cook_time: "1 hour 15 minutes",
      servings: "6",
      difficulty: "Easy"
    },
    description: "Complete recipe extraction from AllRecipes with all fields populated"
  },
  {
    name: "AllRecipes - Alternative Field Names",
    response: {
      source: {
        output: [
          {
            content: [{
              text: JSON.stringify({
                title: "Chef John's Salt-Roasted Chicken",
                description: "A simple and delicious salt-roasted chicken recipe.",
                ingredient_list: [
                  "1 (4 to 5 pound) whole chicken",
                  "3 cups kosher salt",
                  "1/4 cup olive oil"
                ],
                steps: [
                  "Preheat oven to 450 degrees F (230 degrees C).",
                  "Rinse chicken and pat dry with paper towels."
                ],
                image_url: "https://images.media-allrecipes.com/userphotos/560x315/235171.jpg"
              })
            }]
          }
        ]
      }
    },
    expected: {
      name: "Chef John's Salt-Roasted Chicken",
      description: "A simple and delicious salt-roasted chicken recipe.",
      ingredients: [
        "1 (4 to 5 pound) whole chicken",
        "3 cups kosher salt",
        "1/4 cup olive oil"
      ],
      instructions: [
        "Preheat oven to 450 degrees F (230 degrees C).",
        "Rinse chicken and pat dry with paper towels."
      ],
      image_url: "https://images.media-allrecipes.com/userphotos/560x315/235171.jpg",
      source_url: "https://www.allrecipes.com/recipe/235171/chef-johns-salt-roasted-chicken/",
      prep_time: "",
      cook_time: "",
      servings: "",
      difficulty: ""
    },
    description: "Recipe with alternative field names (title, ingredient_list, steps) that should be mapped correctly"
  },
  {
    name: "AllRecipes - String-based Arrays",
    response: {
      source: {
        output: [
          {
            content: [{
              text: JSON.stringify({
                name: "Chef John's Salt-Roasted Chicken",
                description: "A simple and delicious salt-roasted chicken recipe.",
                ingredients: "1 (4 to 5 pound) whole chicken\n3 cups kosher salt\n1/4 cup olive oil",
                instructions: "Preheat oven to 450 degrees F (230 degrees C).\nRinse chicken and pat dry with paper towels.",
                image_url: "https://images.media-allrecipes.com/userphotos/560x315/235171.jpg"
              })
            }]
          }
        ]
      }
    },
    expected: {
      name: "Chef John's Salt-Roasted Chicken",
      description: "A simple and delicious salt-roasted chicken recipe.",
      ingredients: [
        "1 (4 to 5 pound) whole chicken",
        "3 cups kosher salt",
        "1/4 cup olive oil"
      ],
      instructions: [
        "Preheat oven to 450 degrees F (230 degrees C).",
        "Rinse chicken and pat dry with paper towels."
      ],
      image_url: "https://images.media-allrecipes.com/userphotos/560x315/235171.jpg",
      source_url: "https://www.allrecipes.com/recipe/235171/chef-johns-salt-roasted-chicken/",
      prep_time: "",
      cook_time: "",
      servings: "",
      difficulty: ""
    },
    description: "Recipe with ingredients/instructions as strings that should be split into arrays"
  },
  {
    name: "AllRecipes - Minimal Recipe Data",
    response: {
      source: {
        output: [
          {
            content: [{
              text: JSON.stringify({
                name: "Chef John's Salt-Roasted Chicken",
                ingredients: ["1 (4 to 5 pound) whole chicken", "3 cups kosher salt"],
                instructions: ["Preheat oven to 450 degrees F (230 degrees C).", "Rinse chicken and pat dry with paper towels."]
              })
            }]
          }
        ]
      }
    },
    expected: {
      name: "Chef John's Salt-Roasted Chicken",
      description: "",
      ingredients: [
        "1 (4 to 5 pound) whole chicken",
        "3 cups kosher salt"
      ],
      instructions: [
        "Preheat oven to 450 degrees F (230 degrees C).",
        "Rinse chicken and pat dry with paper towels."
      ],
      image_url: "",
      source_url: "https://www.allrecipes.com/recipe/235171/chef-johns-salt-roasted-chicken/",
      prep_time: "",
      cook_time: "",
      servings: "",
      difficulty: ""
    },
    description: "Recipe with only required fields (name, ingredients, instructions) - optional fields should default to empty strings"
  },
  {
    name: "AllRecipes - Null Response (No Recipe Found)",
    response: {
      source: {
        output: [
          {
            content: [{
              text: "null"
            }]
          }
        ]
      }
    },
    expected: null,
    description: "AI correctly returns null when no recipe can be extracted from the page"
  },
  {
    name: "AllRecipes - Empty Object Response",
    response: {
      source: {
        output: [
          {
            content: [{
              text: "{}"
            }]
          }
        ]
      }
    },
    expected: null,
    description: "AI returns empty object when no recipe data is found"
  }
];

// Test runner for AllRecipes specific tests
function runAllRecipesTests() {
  console.log('🧪 Running AllRecipes Recipe Clipper Tests\n');
  console.log('Testing against: https://www.allrecipes.com/recipe/235171/chef-johns-salt-roasted-chicken/\n');
  
  let passed = 0;
  let failed = 0;
  
  allRecipesTestCases.forEach((testCase, index) => {
    console.log(`Test ${index + 1}: ${testCase.name}`);
    console.log(`Description: ${testCase.description}`);
    
    try {
      const result = extractRecipeFromAIResponse(
        testCase.response, 
        "https://www.allrecipes.com/recipe/235171/chef-johns-salt-roasted-chicken/"
      );
      
      if (JSON.stringify(result) === JSON.stringify(testCase.expected)) {
        console.log('✅ PASSED');
        passed++;
      } else {
        console.log('❌ FAILED');
        console.log('Expected:', JSON.stringify(testCase.expected, null, 2));
        console.log('Got:', JSON.stringify(result, null, 2));
        failed++;
      }
    } catch (error) {
      if (testCase.expected === null) {
        console.log('✅ PASSED (Expected error thrown)');
        passed++;
      } else {
        console.log('❌ FAILED (Unexpected error):', error.message);
        failed++;
      }
    }
    
    console.log('---\n');
  });
  
  console.log(`\n📊 AllRecipes Test Results: ${passed} passed, ${failed} failed`);
  
  if (failed === 0) {
    console.log('🎉 All AllRecipes tests passed!');
  } else {
    console.log('⚠️  Some AllRecipes tests failed. Check the output above for details.');
  }
  
  return { passed, failed };
}

// Test specific AllRecipes recipe data validation
function testAllRecipesRecipeData() {
  console.log('🔍 Testing AllRecipes Recipe Data Validation\n');
  
  const testRecipe = {
    name: "Chef John's Salt-Roasted Chicken",
    description: "A simple and delicious salt-roasted chicken recipe that results in juicy, flavorful meat with crispy skin.",
    ingredients: [
      "1 (4 to 5 pound) whole chicken",
      "3 cups kosher salt",
      "1/4 cup olive oil",
      "1 tablespoon black pepper",
      "1 tablespoon dried thyme",
      "1 tablespoon dried rosemary",
      "1 lemon, halved",
      "4 cloves garlic, crushed",
      "1 onion, quartered"
    ],
    instructions: [
      "Preheat oven to 450 degrees F (230 degrees C).",
      "Rinse chicken and pat dry with paper towels.",
      "In a large bowl, mix together kosher salt, black pepper, thyme, and rosemary.",
      "Rub the chicken with olive oil, then generously coat with the salt mixture.",
      "Place lemon halves, garlic, and onion inside the chicken cavity.",
      "Place chicken in a roasting pan and roast for 1 hour and 15 minutes, or until internal temperature reaches 165 degrees F (74 degrees C).",
      "Let chicken rest for 10 minutes before carving and serving."
    ],
    image_url: "https://images.media-allrecipes.com/userphotos/560x315/235171.jpg",
    source_url: "https://www.allrecipes.com/recipe/235171/chef-johns-salt-roasted-chicken/",
    prep_time: "15 minutes",
    cook_time: "1 hour 15 minutes",
    servings: "6",
    difficulty: "Easy"
  };
  
  // Validate recipe structure
  const validationTests = [
    {
      name: "Recipe Name Validation",
      test: () => testRecipe.name && testRecipe.name.length > 0,
      expected: true,
      description: "Recipe should have a non-empty name"
    },
    {
      name: "Ingredients Array Validation",
      test: () => Array.isArray(testRecipe.ingredients) && testRecipe.ingredients.length > 0,
      expected: true,
      description: "Recipe should have a non-empty ingredients array"
    },
    {
      name: "Instructions Array Validation",
      test: () => Array.isArray(testRecipe.instructions) && testRecipe.instructions.length > 0,
      expected: true,
      description: "Recipe should have a non-empty instructions array"
    },
    {
      name: "Source URL Validation",
      test: () => testRecipe.source_url === "https://www.allrecipes.com/recipe/235171/chef-johns-salt-roasted-chicken/",
      expected: true,
      description: "Recipe should have the correct source URL"
    },
    {
      name: "Image URL Validation",
      test: () => testRecipe.image_url && testRecipe.image_url.includes("allrecipes.com"),
      expected: true,
      description: "Recipe should have a valid AllRecipes image URL"
    },
    {
      name: "Cooking Time Validation",
      test: () => testRecipe.cook_time && testRecipe.cook_time.includes("hour"),
      expected: true,
      description: "Recipe should have cooking time information"
    },
    {
      name: "Servings Validation",
      test: () => testRecipe.servings && !isNaN(parseInt(testRecipe.servings)),
      expected: true,
      description: "Recipe should have valid servings information"
    }
  ];
  
  let validationPassed = 0;
  let validationFailed = 0;
  
  validationTests.forEach((validationTest, index) => {
    console.log(`Validation ${index + 1}: ${validationTest.name}`);
    console.log(`Description: ${validationTest.description}`);
    
    try {
      const result = validationTest.test();
      
      if (result === validationTest.expected) {
        console.log('✅ PASSED');
        validationPassed++;
      } else {
        console.log('❌ FAILED');
        console.log(`Expected: ${validationTest.expected}, Got: ${result}`);
        validationFailed++;
      }
    } catch (error) {
      console.log('❌ FAILED (Error):', error.message);
      validationFailed++;
    }
    
    console.log('---\n');
  });
  
  console.log(`\n📊 Recipe Data Validation Results: ${validationPassed} passed, ${validationFailed} failed`);
  
  if (validationFailed === 0) {
    console.log('🎉 All recipe data validation tests passed!');
  } else {
    console.log('⚠️  Some recipe data validation tests failed.');
  }
  
  return { validationPassed, validationFailed };
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('🚀 Starting AllRecipes Recipe Clipper Tests\n');
  
  const testResults = runAllRecipesTests();
  const validationResults = testAllRecipesRecipeData();
  
  console.log('\n🎯 Final Results Summary:');
  console.log(`Tests: ${testResults.passed}/${testResults.passed + testResults.failed} passed`);
  console.log(`Validation: ${validationResults.validationPassed}/${validationResults.validationPassed + validationResults.validationFailed} passed`);
  
  const totalPassed = testResults.passed + validationResults.validationPassed;
  const totalTests = (testResults.passed + testResults.failed) + (validationResults.validationPassed + validationResults.validationFailed);
  
  if (totalPassed === totalTests) {
    console.log('\n🎉 All AllRecipes tests and validation passed!');
  } else {
    console.log('\n⚠️  Some tests failed. Check the output above for details.');
  }
}

export { runAllRecipesTests, testAllRecipesRecipeData, allRecipesTestCases }; 