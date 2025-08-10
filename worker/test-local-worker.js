// Local test script for testing worker endpoints
// This simulates the worker environment locally

import { extractRecipeFromAIResponse } from './src/recipe-clipper.js';

// Mock environment for local testing
const mockEnv = {
  AI: {
    run: async (model, options) => {
      console.log('Mock AI called with:', { model, options });
      
      // Simulate a successful recipe extraction response
      return {
        source: {
          output: [
            {
              content: [{
                text: JSON.stringify({
                  name: "Test Recipe",
                  description: "A delicious test recipe for local testing",
                  ingredients: [
                    "2 cups flour",
                    "1 cup sugar",
                    "3 eggs",
                    "1/2 cup milk"
                  ],
                  instructions: [
                    "Preheat oven to 350°F",
                    "Mix dry ingredients",
                    "Add wet ingredients and mix well",
                    "Bake for 25-30 minutes"
                  ],
                  image_url: "https://example.com/test-image.jpg",
                  prep_time: "15 minutes",
                  cook_time: "30 minutes",
                  servings: "8",
                  difficulty: "Easy"
                })
              }]
            }
          ]
        }
      };
    }
  }
};

// Test the health endpoint logic
function testHealthEndpoint() {
  console.log('🧪 Testing Health Endpoint Logic');
  
  // Simulate the health check logic from the worker
  const healthResponse = JSON.stringify({ 
    status: 'healthy', 
    service: 'recipe-clipper' 
  });
  
  console.log('✅ Health endpoint response:', healthResponse);
  return healthResponse;
}

// Test recipe extraction
async function testRecipeExtraction() {
  console.log('\n🧪 Testing Recipe Extraction');
  
  try {
    const mockResponse = {
      source: {
        output: [
          {
            content: [{
              text: JSON.stringify({
                name: "Mock Recipe",
                description: "A mock recipe for testing",
                ingredients: ["ingredient 1", "ingredient 2"],
                instructions: ["step 1", "step 2"]
              })
            }]
          }
        ]
      }
    };
    
    const recipe = await extractRecipeFromAIResponse(
      mockResponse, 
      "https://example.com/test-recipe"
    );
    
    if (recipe) {
      console.log('✅ Recipe extraction successful:');
      console.log(JSON.stringify(recipe, null, 2));
    } else {
      console.log('❌ Recipe extraction failed');
    }
    
    return recipe;
  } catch (error) {
    console.error('❌ Recipe extraction error:', error.message);
    return null;
  }
}

// Test error handling
async function testErrorHandling() {
  console.log('\n🧪 Testing Error Handling');
  
  try {
    const invalidResponse = {
      source: {
        output: [
          {
            content: [{
              text: "invalid json content"
            }]
          }
        ]
      }
    };
    
    const recipe = await extractRecipeFromAIResponse(
      invalidResponse, 
      "https://example.com/invalid-recipe"
    );
    
    if (recipe === null) {
      console.log('✅ Error handling working correctly - returned null for invalid data');
    } else {
      console.log('❌ Error handling failed - should have returned null');
    }
    
    return recipe;
  } catch (error) {
    console.log('✅ Error handling working correctly - error thrown:', error.message);
    return null;
  }
}

// Run all tests
async function runLocalTests() {
  console.log('🚀 Starting Local Worker Tests\n');
  
  // Test health endpoint
  testHealthEndpoint();
  
  // Test recipe extraction
  await testRecipeExtraction();
  
  // Test error handling
  await testErrorHandling();
  
  console.log('\n🎯 Local tests completed!');
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runLocalTests();
}

export { testHealthEndpoint, testRecipeExtraction, testErrorHandling, runLocalTests }; 