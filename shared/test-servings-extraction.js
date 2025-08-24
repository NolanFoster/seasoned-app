/**
 * Test file for the new servings extraction function
 * This tests various recipe yield formats to ensure accurate servings extraction
 */

import { extractServingsFromYield } from './nutrition-calculator.js';

// Test cases for various recipe yield formats
const testCases = [
  // Basic formats
  { input: '6 large crab cakes', expected: 6, description: 'Recipe yield with descriptive text' },
  { input: '4 servings', expected: 4, description: 'Simple servings count' },
  { input: '8 portions', expected: 8, description: 'Portions instead of servings' },
  { input: '2 people', expected: 2, description: 'People count' },
  { input: '1 loaf', expected: 1, description: 'Single item' },
  { input: '12 cookies', expected: 12, description: 'Count of items' },
  
  // "Makes" statements
  { input: 'Makes 8 servings', expected: 8, description: 'Makes statement with servings' },
  { input: 'Makes 6 people', expected: 6, description: 'Makes statement with people' },
  { input: 'Make 4 portions', expected: 4, description: 'Make statement with portions' },
  { input: 'Makes 24 cookies', expected: 24, description: 'Makes statement with cookies' },
  { input: 'Makes 1 cake', expected: 1, description: 'Makes statement with cake' },
  
  // "Serves" statements
  { input: 'Serves 6 people', expected: 6, description: 'Serves statement with people' },
  { input: 'Serve 4 guests', expected: 4, description: 'Serve statement with guests' },
  { input: 'Serves 8', expected: 8, description: 'Serves statement without unit' },
  
  // Ranges
  { input: '2-4 servings', expected: 3, description: 'Range of servings (average)' },
  { input: '4-6 people', expected: 5, description: 'Range of people (average)' },
  { input: '6-8 portions', expected: 7, description: 'Range of portions (average)' },
  
  // Edge cases
  { input: 'undefined', expected: 1, description: 'Undefined input' },
  { input: null, expected: 1, description: 'Null input' },
  { input: '', expected: 1, description: 'Empty string' },
  { input: 6, expected: 6, description: 'Number input' },
  { input: '0', expected: 0, description: 'Zero input' },
  
  // Complex formats
  { input: 'Makes approximately 6 large crab cakes', expected: 6, description: 'Complex makes statement' },
  { input: 'Serves about 4-6 people', expected: 5, description: 'Complex serves statement with range' },
  { input: 'Yields 8-10 servings', expected: 9, description: 'Yields statement with range' },
  { input: 'Recipe makes 12 medium cookies', expected: 12, description: 'Recipe makes statement' },
  
  // Real-world examples from the issue
  { input: '6 large crab cakes', expected: 6, description: 'Maryland Crab Cakes example' },
  { input: '4 servings', expected: 4, description: 'Standard servings format' },
  { input: 'Makes 8 servings', expected: 8, description: 'Makes format that was failing' },
  
  // Additional edge cases
  { input: 'one serving', expected: 1, description: 'Text number' },
  { input: 'two people', expected: 1, description: 'Text number (should default to 1)' },
  { input: 'several servings', expected: 1, description: 'Vague description (should default to 1)' },
  { input: 'a few cookies', expected: 1, description: 'Vague description (should default to 1)' }
];

// Test the servings extraction function
function testServingsExtraction() {
  console.log('🧪 Testing Servings Extraction Function\n');
  
  let passed = 0;
  let failed = 0;
  
  testCases.forEach((testCase, index) => {
    const result = extractServingsFromYield(testCase.input);
    const testPassed = result === testCase.expected;
    
    if (testPassed) {
      passed++;
      console.log(`✓ ${testCase.description}:`);
    } else {
      failed++;
      console.log(`✗ ${testCase.description}:`);
    }
    
    console.log(`  Input: "${testCase.input}"`);
    console.log(`  Expected: ${testCase.expected}, Got: ${result}`);
    console.log('');
  });
  
  console.log(`📊 Test Results: ${passed} passed, ${failed} failed`);
  
  if (failed === 0) {
    console.log('✅ All tests passed!');
  } else {
    console.log('❌ Some tests failed. Please review the implementation.');
  }
}

// Test specific edge cases
function testEdgeCases() {
  console.log('🔍 Testing Edge Cases\n');
  
  // Test with various data types
  console.log('Testing data types:');
  console.log(`  String: ${extractServingsFromYield('6 servings')}`);
  console.log(`  Number: ${extractServingsFromYield(6)}`);
  console.log(`  Null: ${extractServingsFromYield(null)}`);
  console.log(`  Undefined: ${extractServingsFromYield(undefined)}`);
  console.log(`  Empty string: ${extractServingsFromYield('')}`);
  console.log('');
  
  // Test with whitespace
  console.log('Testing whitespace handling:');
  console.log(`  "  6 servings  ": ${extractServingsFromYield('  6 servings  ')}`);
  console.log(`  "6  servings": ${extractServingsFromYield('6  servings')}`);
  console.log('');
  
  // Test with case sensitivity
  console.log('Testing case sensitivity:');
  console.log(`  "MAKES 6 SERVINGS": ${extractServingsFromYield('MAKES 6 SERVINGS')}`);
  console.log(`  "makes 6 servings": ${extractServingsFromYield('makes 6 servings')}`);
  console.log(`  "Makes 6 Servings": ${extractServingsFromYield('Makes 6 Servings')}`);
  console.log('');
}

// Test nutrition calculation integration
function testNutritionIntegration() {
  console.log('🍽️  Testing Nutrition Calculation Integration\n');
  
  // Simulate the nutrition calculation process
  const mockRecipe = {
    servings: '6 large crab cakes',
    yield: null,
    recipeYield: null
  };
  
  // Extract servings using the new function
  const servings = extractServingsFromYield(mockRecipe.servings || mockRecipe.yield || mockRecipe.recipeYield);
  
  console.log(`Recipe yield: "${mockRecipe.servings}"`);
  console.log(`Extracted servings: ${servings}`);
  
  // Simulate nutrition calculation
  const totalCalories = 1140; // Total calories for all ingredients
  const caloriesPerServing = totalCalories / servings;
  
  console.log(`Total calories for recipe: ${totalCalories}`);
  console.log(`Calories per serving: ${caloriesPerServing.toFixed(1)}`);
  console.log(`Expected per serving: ${(totalCalories / 6).toFixed(1)}`);
  
  if (Math.abs(caloriesPerServing - (totalCalories / 6)) < 0.1) {
    console.log('✅ Nutrition calculation is working correctly!');
  } else {
    console.log('❌ Nutrition calculation has an issue!');
  }
}

// Run all tests
function runAllTests() {
  testServingsExtraction();
  console.log('\n' + '='.repeat(50) + '\n');
  testEdgeCases();
  console.log('\n' + '='.repeat(50) + '\n');
  testNutritionIntegration();
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllTests();
}

export { testServingsExtraction, testEdgeCases, testNutritionIntegration };