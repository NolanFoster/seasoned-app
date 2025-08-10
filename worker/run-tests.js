#!/usr/bin/env node

import { runTests } from './test-recipe-clipper.js';
import { runAllTests as runNullTests } from './test-null-response.js';
import { runAllRecipesTests, testAllRecipesRecipeData } from './test-allrecipes.js';

console.log('🚀 Starting Recipe Clipper Test Suite\n');

// Run comprehensive tests
console.log('='.repeat(60));
console.log('COMPREHENSIVE TESTS');
console.log('='.repeat(60));
runTests();

console.log('\n' + '='.repeat(60));
console.log('NULL RESPONSE TESTS');
console.log('='.repeat(60));
runNullTests();

console.log('\n' + '='.repeat(60));
console.log('ALLRECIPES SPECIFIC TESTS');
console.log('='.repeat(60));
runAllRecipesTests();

console.log('\n' + '='.repeat(60));
console.log('ALLRECIPES RECIPE DATA VALIDATION');
console.log('='.repeat(60));
testAllRecipesRecipeData();

console.log('\n🎯 All test suites completed!'); 