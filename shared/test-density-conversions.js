import { UnitConverter } from './nutrition-calculator.js';

console.log('Testing improved density-based conversions...\n');

// Test cases with expected results
const testCases = [
  // Volume to weight conversions with specific densities
  { 
    name: 'olive oil', 
    quantity: 1, 
    unit: 'tablespoon',
    expected: 13.53, // 14.787 ml * 0.915 g/ml
    description: '1 tablespoon olive oil'
  },
  { 
    name: 'all-purpose flour', 
    quantity: 1, 
    unit: 'cup',
    expected: 140.4, // 236.588 ml * 0.593 g/ml
    description: '1 cup flour'
  },
  { 
    name: 'granulated sugar', 
    quantity: 1, 
    unit: 'cup',
    expected: 200.9, // 236.588 ml * 0.849 g/ml
    description: '1 cup sugar'
  },
  { 
    name: 'honey', 
    quantity: 1, 
    unit: 'tablespoon',
    expected: 21.0, // 14.787 ml * 1.42 g/ml
    description: '1 tablespoon honey'
  },
  { 
    name: 'milk', 
    quantity: 1, 
    unit: 'cup',
    expected: 243.7, // 236.588 ml * 1.03 g/ml
    description: '1 cup milk'
  },
  
  // Specific item weights
  { 
    name: 'garlic', 
    quantity: 2, 
    unit: 'cloves',
    expected: 8, // 2 * 4g per clove
    description: '2 garlic cloves'
  },
  { 
    name: 'egg', 
    quantity: 3, 
    unit: 'large',
    expected: 150, // 3 * 50g per large egg
    description: '3 large eggs'
  },
  
  // Test with variations
  { 
    name: 'vegetable oil', 
    quantity: 0.5, 
    unit: 'cup',
    expected: 108.8, // 118.294 ml * 0.92 g/ml
    description: '1/2 cup vegetable oil'
  },
  { 
    name: 'brown sugar', 
    quantity: 0.25, 
    unit: 'cup',
    expected: 42.6, // 59.147 ml * 0.721 g/ml
    description: '1/4 cup brown sugar'
  },
  
  // Default density (water)
  { 
    name: 'water', 
    quantity: 1, 
    unit: 'cup',
    expected: 236.6, // 236.588 ml * 1.0 g/ml
    description: '1 cup water'
  }
];

// Run tests
let passed = 0;
let failed = 0;

testCases.forEach(test => {
  const result = UnitConverter.convertToGrams(
    test.quantity, 
    test.unit, 
    test.name
  );
  
  const tolerance = 0.1; // Allow 0.1g tolerance for rounding
  const success = Math.abs(result - test.expected) < tolerance;
  
  if (success) {
    console.log(`✅ ${test.description}: ${result.toFixed(1)}g (expected ~${test.expected}g)`);
    passed++;
  } else {
    console.log(`❌ ${test.description}: ${result.toFixed(1)}g (expected ~${test.expected}g)`);
    failed++;
  }
});

console.log(`\n📊 Test Results: ${passed} passed, ${failed} failed`);

// Test density lookup
console.log('\n🔍 Testing density lookups:');
const densityTests = [
  'olive oil',
  'flour',
  'all purpose flour',
  'sugar',
  'brown sugar',
  'milk',
  'honey',
  'random ingredient'
];

densityTests.forEach(ingredient => {
  const density = UnitConverter.getDensityForIngredient(ingredient);
  console.log(`${ingredient}: ${density} g/ml`);
});

// Compare old vs new calculations
console.log('\n📈 Comparison of old (density=1) vs new calculations:');
const comparisons = [
  { name: 'olive oil', quantity: 2, unit: 'tablespoon' },
  { name: 'flour', quantity: 2, unit: 'cups' },
  { name: 'sugar', quantity: 0.5, unit: 'cup' },
  { name: 'garlic', quantity: 3, unit: 'cloves' }
];

comparisons.forEach(item => {
  const oldResult = UnitConverter.convertToGrams(item.quantity, item.unit, '', 1);
  const newResult = UnitConverter.convertToGrams(item.quantity, item.unit, item.name);
  const difference = ((oldResult - newResult) / oldResult * 100).toFixed(1);
  
  console.log(`${item.quantity} ${item.unit} ${item.name}:`);
  console.log(`  Old: ${oldResult.toFixed(1)}g | New: ${newResult.toFixed(1)}g | Difference: ${difference}%`);
});