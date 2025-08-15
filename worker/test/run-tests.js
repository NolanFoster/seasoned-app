#!/usr/bin/env node

import { runEndpointTests } from './test-worker-endpoints.js';
import { runWorkerCoreTests } from './test-worker-core.js';

console.log('🚀 Starting Worker Test Suite\n');

// Run worker core tests
console.log('='.repeat(60));
console.log('WORKER CORE TESTS');
console.log('='.repeat(60));
runWorkerCoreTests();

// Run worker endpoint tests
console.log('\n' + '='.repeat(60));
console.log('WORKER ENDPOINT TESTS');
console.log('='.repeat(60));
runEndpointTests();

console.log('\n🎯 All worker test suites completed!'); 