#!/usr/bin/env node

// Test runner for Recipe Clipper Worker
// This file runs all available tests in the tests directory

import { execSync } from 'child_process';
import { readdirSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load crypto polyfill for Node.js test environment
import './setup-crypto-polyfill.js';

console.log('🧪 Running Recipe Clipper Tests...\n');

// Get all test files (excluding manual/integration tests)
const testFiles = readdirSync(__dirname)
  .filter(file => file.endsWith('.js') && 
    file !== 'run-tests.js' && 
    file !== 'setup-crypto-polyfill.js' && 
    file !== 'test-integration.js')  // Excluded from automated testing
  .sort();

console.log(`📋 Found ${testFiles.length} test files:`);
testFiles.forEach(file => console.log(`   - ${file}`));
console.log('');

let passedTests = 0;
let failedTests = 0;

// Run each test file
for (const testFile of testFiles) {
  console.log(`\n🔍 Running ${testFile}...`);
  console.log('─'.repeat(50));
  
  try {
    execSync(`node ${join(__dirname, testFile)}`, { 
      stdio: 'inherit',
      cwd: __dirname 
    });
    console.log(`✅ ${testFile} completed successfully`);
    passedTests++;
  } catch (error) {
    console.log(`❌ ${testFile} failed`);
    failedTests++;
  }
}

// Summary
console.log('\n' + '='.repeat(50));
console.log('📊 Test Summary:');
console.log(`   ✅ Passed: ${passedTests}`);
console.log(`   ❌ Failed: ${failedTests}`);
console.log(`   📁 Total: ${testFiles.length}`);

if (failedTests === 0) {
  console.log('\n🎉 All tests passed!');
  process.exit(0);
} else {
  console.log('\n⚠️  Some tests failed. Please check the output above.');
  process.exit(1);
}
