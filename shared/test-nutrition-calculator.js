/**
 * Test suite for nutrition-calculator.js
 * 
 * Tests the USDA API integration, unit conversion, and nutrition aggregation
 */

import { 
  calculateNutritionalFacts, 
  validateIngredients, 
  getSupportedUnits,
  UnitConverter,
  NutritionAggregator,
  USDANutritionClient
} from './nutrition-calculator.js';

// Mock environment for testing
const MOCK_API_KEY = 'test-api-key';
const TEST_API_KEY = process.env.FDC_API_KEY || MOCK_API_KEY;

// Test data
const sampleIngredients = [
  { name: 'apple', quantity: 1, unit: 'medium' },
  { name: 'banana', quantity: 1, unit: 'large' },
  { name: 'oats', quantity: 0.5, unit: 'cup' },
  { name: 'milk', quantity: 1, unit: 'cup' }
];

const invalidIngredients = [
  { name: '', quantity: 1, unit: 'cup' }, // missing name
  { name: 'apple', quantity: 0, unit: 'piece' }, // zero quantity
  { name: 'banana', quantity: -1, unit: 'piece' }, // negative quantity
  { name: 'milk', unit: 'cup' }, // missing quantity
  { quantity: 1, unit: 'cup' } // missing name
];

/**
 * Test utilities
 */
function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function assertApproxEqual(actual, expected, tolerance = 0.1, message = '') {
  const diff = Math.abs(actual - expected);
  if (diff > tolerance) {
    throw new Error(`Assertion failed: ${message}. Expected ~${expected}, got ${actual} (diff: ${diff})`);
  }
}

/**
 * Test Suite: Unit Converter
 */
function testUnitConverter() {
  console.log('Testing UnitConverter...');
  
  // Test weight conversions
  assert(UnitConverter.convertToGrams(1, 'kg') === 1000, 'kg to grams conversion');
  assert(UnitConverter.convertToGrams(1, 'lb') === 453.592, 'lb to grams conversion');
  assert(UnitConverter.convertToGrams(1, 'oz') === 28.3495, 'oz to grams conversion');
  
  // Test volume conversions (with default density of 1)
  assertApproxEqual(UnitConverter.convertToGrams(1, 'cup'), 236.588, 1, 'cup to grams conversion');
  assertApproxEqual(UnitConverter.convertToGrams(1, 'tbsp'), 14.787, 0.1, 'tbsp to grams conversion');
  assertApproxEqual(UnitConverter.convertToGrams(1, 'tsp'), 4.929, 0.1, 'tsp to grams conversion');
  
  // Test count conversions
  assert(UnitConverter.convertToGrams(1, 'medium') === 150, 'medium size conversion');
  assert(UnitConverter.convertToGrams(1, 'large') === 200, 'large size conversion');
  
  // Test unknown unit defaults to grams
  assert(UnitConverter.convertToGrams(100, 'unknown') === 100, 'unknown unit defaults to grams');
  
  console.log('✓ UnitConverter tests passed');
}

/**
 * Test Suite: Nutrition Aggregator
 */
function testNutritionAggregator() {
  console.log('Testing NutritionAggregator...');
  
  const aggregator = new NutritionAggregator();
  
  // Test nutrition extraction
  const mockFoodItem = {
    foodNutrients: [
      { nutrientId: 1008, value: 52 }, // calories
      { nutrientId: 1003, value: 0.26 }, // protein
      { nutrientId: 1004, value: 0.17 }, // fat
      { nutrientId: 1005, value: 13.81 }, // carbs
      { nutrientId: 1079, value: 2.4 }, // fiber
    ]
  };
  
  const nutrition = aggregator.extractNutrition(mockFoodItem, 100);
  assert(nutrition.calories === 52, 'calories extraction');
  assert(nutrition.proteinContent === 0.26, 'protein extraction');
  assert(nutrition.carbohydrateContent === 13.81, 'carbs extraction');
  
  // Test scaling (200g should double the values)
  const scaledNutrition = aggregator.extractNutrition(mockFoodItem, 200);
  assert(scaledNutrition.calories === 104, 'scaled calories');
  assert(scaledNutrition.proteinContent === 0.52, 'scaled protein');
  
  // Test aggregation
  const nutritionArray = [
    { calories: 50, proteinContent: 1, fatContent: 2 },
    { calories: 30, proteinContent: 2, fatContent: 1 },
    { calories: 20, proteinContent: 1, fatContent: 0.5 }
  ];
  
  const totals = aggregator.aggregateNutrition(nutritionArray);
  assert(totals.calories === 100, 'aggregated calories');
  assert(totals.proteinContent === 4, 'aggregated protein');
  assert(totals.fatContent === 3.5, 'aggregated fat');
  
  // Test recipe schema formatting
  const formatted = aggregator.formatForRecipeSchema(totals, 2);
  assert(formatted['@type'] === 'NutritionInformation', 'schema type');
  assert(formatted.calories === '50', 'formatted calories per serving');
  assert(formatted.proteinContent === '2g', 'formatted protein per serving');
  
  console.log('✓ NutritionAggregator tests passed');
}

/**
 * Test Suite: Ingredient Validation
 */
function testIngredientValidation() {
  console.log('Testing ingredient validation...');
  
  // Test valid ingredients
  const validResult = validateIngredients(sampleIngredients);
  assert(validResult.valid === true, 'valid ingredients should pass');
  assert(validResult.errors.length === 0, 'valid ingredients should have no errors');
  
  // Test invalid ingredients
  const invalidResult = validateIngredients(invalidIngredients);
  assert(invalidResult.valid === false, 'invalid ingredients should fail');
  assert(invalidResult.errors.length > 0, 'invalid ingredients should have errors');
  
  // Test non-array input
  const nonArrayResult = validateIngredients('not an array');
  assert(nonArrayResult.valid === false, 'non-array input should fail');
  assert(nonArrayResult.errors.includes('Ingredients must be an array'), 'should have array error');
  
  console.log('✓ Ingredient validation tests passed');
}

/**
 * Test Suite: Supported Units
 */
function testSupportedUnits() {
  console.log('Testing supported units...');
  
  const units = getSupportedUnits();
  
  assert(Array.isArray(units.weight), 'weight units should be an array');
  assert(Array.isArray(units.volume), 'volume units should be an array');
  assert(Array.isArray(units.count), 'count units should be an array');
  
  assert(units.weight.includes('g'), 'should include grams');
  assert(units.weight.includes('kg'), 'should include kilograms');
  assert(units.volume.includes('cup'), 'should include cups');
  assert(units.volume.includes('ml'), 'should include milliliters');
  assert(units.count.includes('medium'), 'should include medium');
  
  console.log('✓ Supported units tests passed');
}

/**
 * Test Suite: USDA API Client (Mock tests)
 */
function testUSDAClientMock() {
  console.log('Testing USDA API client (mock)...');
  
  const client = new USDANutritionClient(MOCK_API_KEY);
  
  // Test client initialization
  assert(client.apiKey === MOCK_API_KEY, 'API key should be set');
  assert(client.baseUrl === 'https://api.nal.usda.gov/fdc/v1', 'base URL should be correct');
  
  console.log('✓ USDA API client mock tests passed');
}

/**
 * Test Suite: Main Function (Mock tests)
 */
async function testCalculateNutritionalFactsMock() {
  console.log('Testing calculateNutritionalFacts (mock)...');
  
  // Test without API key
  try {
    await calculateNutritionalFacts(sampleIngredients, null);
    assert(false, 'should throw error without API key');
  } catch (error) {
    assert(error.message.includes('API key'), 'should require API key');
  }
  
  // Test with empty ingredients
  try {
    await calculateNutritionalFacts([], MOCK_API_KEY);
    assert(false, 'should throw error with empty ingredients');
  } catch (error) {
    assert(error.message.includes('must not be empty'), 'should require ingredients');
  }
  
  // Test with invalid ingredients
  const result = await calculateNutritionalFacts(invalidIngredients, MOCK_API_KEY);
  // This should handle gracefully and return partial results
  assert(typeof result === 'object', 'should return object');
  assert(typeof result.success === 'boolean', 'should have success property');
  
  console.log('✓ calculateNutritionalFacts mock tests passed');
}

/**
 * Integration Test: Real API (if API key provided)
 */
async function testRealAPIIntegration() {
  if (TEST_API_KEY === MOCK_API_KEY) {
    console.log('⚠️  Skipping real API tests (no API key provided)');
    console.log('   Set FDC_API_KEY environment variable to run integration tests');
    return;
  }
  
  console.log('Testing real USDA API integration...');
  
  try {
    const testIngredients = [
      { name: 'apple', quantity: 1, unit: 'medium' },
      { name: 'banana', quantity: 1, unit: 'large' }
    ];
    
    const result = await calculateNutritionalFacts(testIngredients, TEST_API_KEY, 1);
    
    assert(typeof result === 'object', 'should return object');
    assert(typeof result.success === 'boolean', 'should have success property');
    
    if (result.success) {
      assert(result.nutrition !== null, 'should have nutrition data');
      assert(result.nutrition['@type'] === 'NutritionInformation', 'should have correct schema type');
      assert(typeof result.processedIngredients === 'number', 'should have processed count');
      
      console.log('Sample nutrition result:', JSON.stringify(result.nutrition, null, 2));
    } else {
      console.warn('API integration test failed:', result.error);
    }
    
    console.log('✓ Real API integration tests completed');
    
  } catch (error) {
    console.error('Real API integration test error:', error);
    // Don't fail the test suite for API issues
  }
}

/**
 * Run all tests
 */
async function runAllTests() {
  console.log('🧪 Running Nutrition Calculator Test Suite\n');
  
  try {
    // Unit tests (no external dependencies)
    testUnitConverter();
    testNutritionAggregator();
    testIngredientValidation();
    testSupportedUnits();
    testUSDAClientMock();
    
    // Mock integration tests
    await testCalculateNutritionalFactsMock();
    
    // Real API integration test (if API key available)
    await testRealAPIIntegration();
    
    console.log('\n✅ All tests passed!');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllTests();
}

export { runAllTests };