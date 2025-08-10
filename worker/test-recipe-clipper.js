import { extractRecipeFromAIResponse } from './src/recipe-clipper.js';

// Mock Cloudflare AI response structure for null case
const mockNullResponse = {
  "source": {
    "output": [
      {
        "content": [{
          "text": "null"
        }]
      }
    ]
  }
};

// Test data for various scenarios
const testCases = [
  {
    name: "Null response from AI (truncated HTML)",
    response: mockNullResponse,
    expected: null,
    description: "AI correctly returns null when HTML is truncated and recipe data is incomplete"
  },
  {
    name: "Valid recipe response",
    response: {
      source: {
        output: [
          {
            content: [{
              text: JSON.stringify({
                name: "Test Recipe",
                description: "A test recipe",
                ingredients: ["ingredient 1", "ingredient 2"],
                instructions: ["step 1", "step 2"],
                image_url: "https://example.com/image.jpg",
                prep_time: "10 minutes",
                cook_time: "20 minutes",
                servings: "4",
                difficulty: "Easy"
              })
            }]
          }
        ]
      }
    },
    expected: {
      name: "Test Recipe",
      description: "A test recipe",
      ingredients: ["ingredient 1", "ingredient 2"],
      instructions: ["step 1", "step 2"],
      image_url: "https://example.com/image.jpg",
      source_url: "https://example.com",
      prep_time: "10 minutes",
      cook_time: "20 minutes",
      servings: "4",
      difficulty: "Easy"
    },
    description: "AI returns complete recipe data that should be parsed correctly"
  },
  {
    name: "Recipe with alternative field names",
    response: {
      source: {
        output: [
          {
            content: [{
              text: JSON.stringify({
                title: "Alternative Recipe",
                description: "Recipe with different field names",
                ingredient_list: ["item 1", "item 2"],
                steps: ["instruction 1", "instruction 2"],
                image_url: "https://example.com/image.jpg"
              })
            }]
          }
        ]
      }
    },
    expected: {
      name: "Alternative Recipe",
      description: "Recipe with different field names",
      ingredients: ["item 1", "item 2"],
      instructions: ["instruction 1", "instruction 2"],
      image_url: "https://example.com/image.jpg",
      source_url: "https://example.com",
      prep_time: "",
      cook_time: "",
      servings: "",
      difficulty: ""
    },
    description: "AI returns recipe with alternative field names that should be mapped correctly"
  },
  {
    name: "Recipe with string ingredients/instructions",
    response: {
      source: {
        output: [
          {
            content: [{
              text: JSON.stringify({
                name: "String Recipe",
                description: "Recipe with string arrays",
                ingredients: "ingredient 1\ningredient 2\ningredient 3",
                instructions: "step 1\nstep 2\nstep 3",
                image_url: "https://example.com/image.jpg"
              })
            }]
          }
        ]
      }
    },
    expected: {
      name: "String Recipe",
      description: "Recipe with string arrays",
      ingredients: ["ingredient 1", "ingredient 2", "ingredient 3"],
      instructions: ["step 1", "step 2", "step 3"],
      image_url: "https://example.com/image.jpg",
      source_url: "https://example.com",
      prep_time: "",
      cook_time: "",
      servings: "",
      difficulty: ""
    },
    description: "AI returns ingredients/instructions as strings that should be split into arrays"
  },
  {
    name: "Empty response object",
    response: {
      source: {
        output: []
      }
    },
    expected: null,
    description: "Empty response should return null"
  },
  {
    name: "Response with missing content",
    response: {
      source: {
        output: [
          {
            content: []
          }
        ]
      }
    },
    expected: null,
    description: "Response with missing content should return null"
  },
  {
    name: "Response with invalid JSON",
    response: {
      source: {
        output: [
          {
            content: [{
              text: "{ invalid json content"
            }]
          }
        ]
      }
    },
    expected: null,
    description: "Invalid JSON should return null"
  }
];

// Test runner
function runTests() {
  console.log('🧪 Running Recipe Clipper Tests\n');
  
  let passed = 0;
  let failed = 0;
  
  testCases.forEach((testCase, index) => {
    console.log(`Test ${index + 1}: ${testCase.name}`);
    console.log(`Description: ${testCase.description}`);
    
    try {
      const result = extractRecipeFromAIResponse(testCase.response, "https://example.com");
      
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
  
  console.log(`\n📊 Test Results: ${passed} passed, ${failed} failed`);
  
  if (failed === 0) {
    console.log('🎉 All tests passed!');
  } else {
    console.log('⚠️  Some tests failed. Check the output above for details.');
  }
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runTests();
}

export { runTests, testCases }; 