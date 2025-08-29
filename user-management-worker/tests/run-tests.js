#!/usr/bin/env node

const { execSync } = require('child_process');
const path = require('path');

console.log('🧪 User Management Worker Test Suite');
console.log('=====================================\n');

const testCommands = [
  {
    name: 'Unit Tests',
    command: 'npm run test:unit',
    description: 'Running unit tests for database service and API endpoints...'
  },
  {
    name: 'Integration Tests',
    command: 'npm run test:integration',
    description: 'Running integration tests for complete user workflows...'
  },
  {
    name: 'Performance Tests',
    command: 'npm run test:performance',
    description: 'Running performance and load tests...'
  },
  {
    name: 'All Tests with Coverage',
    command: 'npm run test:coverage',
    description: 'Running all tests with coverage report...'
  }
];

async function runTests() {
  let allTestsPassed = true;
  const results = [];

  for (const test of testCommands) {
    console.log(`\n📋 ${test.name}`);
    console.log(`${test.description}\n`);
    
    try {
      const startTime = Date.now();
      execSync(test.command, { 
        stdio: 'inherit',
        cwd: path.resolve(__dirname, '..')
      });
      const endTime = Date.now();
      const duration = ((endTime - startTime) / 1000).toFixed(2);
      
      console.log(`✅ ${test.name} completed successfully in ${duration}s`);
      results.push({ name: test.name, status: 'PASSED', duration });
    } catch (error) {
      console.log(`❌ ${test.name} failed`);
      results.push({ name: test.name, status: 'FAILED', error: error.message });
      allTestsPassed = false;
    }
  }

  // Summary
  console.log('\n📊 Test Summary');
  console.log('================');
  
  results.forEach(result => {
    const status = result.status === 'PASSED' ? '✅' : '❌';
    const duration = result.duration ? ` (${result.duration}s)` : '';
    console.log(`${status} ${result.name}${duration}`);
    
    if (result.status === 'FAILED') {
      console.log(`   Error: ${result.error}`);
    }
  });

  console.log(`\n${allTestsPassed ? '🎉 All tests passed!' : '💥 Some tests failed!'}`);
  
  if (!allTestsPassed) {
    process.exit(1);
  }
}

// Handle command line arguments
const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Usage: node run-tests.js [options]

Options:
  --help, -h     Show this help message
  --unit         Run only unit tests
  --integration  Run only integration tests
  --performance  Run only performance tests
  --coverage     Run all tests with coverage

Examples:
  node run-tests.js                    # Run all tests
  node run-tests.js --unit            # Run only unit tests
  node run-tests.js --coverage        # Run all tests with coverage
`);
  process.exit(0);
}

if (args.includes('--unit')) {
  testCommands.splice(1, testCommands.length - 1);
} else if (args.includes('--integration')) {
  testCommands.splice(0, 1);
  testCommands.splice(1, testCommands.length - 1);
} else if (args.includes('--performance')) {
  testCommands.splice(0, 2);
  testCommands.splice(1, testCommands.length - 1);
} else if (args.includes('--coverage')) {
  testCommands.splice(0, testCommands.length - 1);
}

runTests().catch(error => {
  console.error('💥 Test runner failed:', error);
  process.exit(1);
});
