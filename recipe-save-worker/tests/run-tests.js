#!/usr/bin/env node

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

// Check if we're in the correct directory
if (!existsSync(join(rootDir, 'package.json'))) {
  console.error('❌ Error: package.json not found. Please run tests from the worker directory.');
  process.exit(1);
}

console.log('🧪 Running Recipe Save Worker tests...\n');

const testFiles = [
  'tests/worker.test.js',
  'tests/image-processing.test.js'
];

let allTestsPassed = true;

for (const testFile of testFiles) {
  console.log(`\n📄 Running ${testFile}...`);
  
  try {
    // Run tests with coverage if c8 is available
    const command = process.argv.includes('--coverage') 
      ? `npx c8 --reporter=text --reporter=html node --experimental-vm-modules ${testFile}`
      : `node --experimental-vm-modules ${testFile}`;

    execSync(command, {
      stdio: 'inherit',
      cwd: rootDir,
      env: {
        ...process.env,
        NODE_ENV: 'test'
      }
    });
  } catch (error) {
    console.error(`\n❌ ${testFile} failed!`);
    allTestsPassed = false;
  }
}

if (allTestsPassed) {
  console.log('\n✅ All tests passed!');
} else {
  console.error('\n❌ Some tests failed!');
  process.exit(1);
}