#!/usr/bin/env node

// Main test runner for Clipped Recipe DB Worker
import { runWorkerCoreTests } from './test-worker-core.js';
import { runEndpointTests } from './test-worker-endpoints.js';
import { runExtractionTests } from './test-recipe-extraction.js';
import { runIntegrationTests } from './test-integration.js';

console.log('🚀 Clipped Recipe DB Worker Test Suite');
console.log('=====================================\n');

async function runAllTests() {
  const results = {
    core: { passed: 0, failed: 0, total: 0 },
    endpoints: { passed: 0, failed: 0, total: 0 },
    extraction: { passed: 0, failed: 0, total: 0 },
    integration: { passed: 0, failed: 0, total: 0 }
  };

  try {
    // Run core tests
    console.log('\n📦 CORE FUNCTIONALITY TESTS');
    console.log('=' + '='.repeat(49) + '\n');
    results.core = await runWorkerCoreTests();
    
    // Run endpoint tests
    console.log('\n\n📡 ENDPOINT TESTS');
    console.log('=' + '='.repeat(49) + '\n');
    results.endpoints = await runEndpointTests();
    
    // Run extraction tests
    console.log('\n\n🔍 RECIPE EXTRACTION TESTS');
    console.log('=' + '='.repeat(49) + '\n');
    results.extraction = await runExtractionTests();
    
    // Run integration tests
    console.log('\n\n🔗 INTEGRATION TESTS');
    console.log('=' + '='.repeat(49) + '\n');
    results.integration = await runIntegrationTests();
    
  } catch (error) {
    console.error('\n❌ Test suite encountered an error:', error);
    process.exit(1);
  }

  // Calculate totals
  const totalPassed = Object.values(results).reduce((sum, r) => sum + r.passed, 0);
  const totalFailed = Object.values(results).reduce((sum, r) => sum + r.failed, 0);
  const totalTests = Object.values(results).reduce((sum, r) => sum + r.total, 0);

  // Print summary
  console.log('\n\n' + '='.repeat(60));
  console.log('📊 OVERALL TEST SUMMARY');
  console.log('='.repeat(60));
  console.log('\nTest Suite Results:');
  console.log(`  Core Tests:        ${results.core.passed}/${results.core.total} passed`);
  console.log(`  Endpoint Tests:    ${results.endpoints.passed}/${results.endpoints.total} passed`);
  console.log(`  Extraction Tests:  ${results.extraction.passed}/${results.extraction.total} passed`);
  console.log(`  Integration Tests: ${results.integration.passed}/${results.integration.total} passed`);
  console.log('\nTotal Results:');
  console.log(`  ✅ Passed: ${totalPassed}`);
  console.log(`  ❌ Failed: ${totalFailed}`);
  console.log(`  📁 Total:  ${totalTests}`);
  console.log(`  📈 Success Rate: ${((totalPassed / totalTests) * 100).toFixed(1)}%`);

  if (totalFailed === 0) {
    console.log('\n🎉 All tests passed! The worker is ready for deployment.');
    process.exit(0);
  } else {
    console.log('\n⚠️  Some tests failed. Please fix the issues before deploying.');
    process.exit(1);
  }
}

// Handle test execution
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
Usage: node test/run-tests.js [options]

Options:
  --core         Run only core functionality tests
  --endpoints    Run only endpoint tests  
  --extraction   Run only recipe extraction tests
  --integration  Run only integration tests
  --help, -h     Show this help message

Examples:
  node test/run-tests.js              # Run all tests
  node test/run-tests.js --core       # Run only core tests
  node test/run-tests.js --endpoints  # Run only endpoint tests
  `);
  process.exit(0);
}

// Check for specific test suite flags
const runCore = process.argv.includes('--core');
const runEndpoints = process.argv.includes('--endpoints');
const runExtraction = process.argv.includes('--extraction');
const runIntegration = process.argv.includes('--integration');
const runAll = !runCore && !runEndpoints && !runExtraction && !runIntegration;

// Run requested test suites
async function runSelectedTests() {
  if (runAll) {
    await runAllTests();
  } else {
    let totalPassed = 0;
    let totalFailed = 0;
    let totalTests = 0;

    if (runCore) {
      console.log('\n📦 CORE FUNCTIONALITY TESTS');
      console.log('=' + '='.repeat(49) + '\n');
      const result = await runWorkerCoreTests();
      totalPassed += result.passed;
      totalFailed += result.failed;
      totalTests += result.total;
    }

    if (runEndpoints) {
      console.log('\n📡 ENDPOINT TESTS');
      console.log('=' + '='.repeat(49) + '\n');
      const result = await runEndpointTests();
      totalPassed += result.passed;
      totalFailed += result.failed;
      totalTests += result.total;
    }

    if (runExtraction) {
      console.log('\n🔍 RECIPE EXTRACTION TESTS');
      console.log('=' + '='.repeat(49) + '\n');
      const result = await runExtractionTests();
      totalPassed += result.passed;
      totalFailed += result.failed;
      totalTests += result.total;
    }

    if (runIntegration) {
      console.log('\n🔗 INTEGRATION TESTS');
      console.log('=' + '='.repeat(49) + '\n');
      const result = await runIntegrationTests();
      totalPassed += result.passed;
      totalFailed += result.failed;
      totalTests += result.total;
    }

    // Print summary for selected tests
    console.log('\n' + '='.repeat(60));
    console.log('📊 SELECTED TEST SUMMARY');
    console.log('='.repeat(60));
    console.log(`  ✅ Passed: ${totalPassed}`);
    console.log(`  ❌ Failed: ${totalFailed}`);
    console.log(`  📁 Total:  ${totalTests}`);
    
    if (totalTests > 0) {
      console.log(`  📈 Success Rate: ${((totalPassed / totalTests) * 100).toFixed(1)}%`);
    }

    process.exit(totalFailed === 0 ? 0 : 1);
  }
}

// Run tests
runSelectedTests().catch(error => {
  console.error('Failed to run tests:', error);
  process.exit(1);
});