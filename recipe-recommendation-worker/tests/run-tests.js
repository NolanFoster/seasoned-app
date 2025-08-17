/**
 * Test runner for recipe recommendation worker tests
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runTests() {
  console.log('🧪 Running Recipe Recommendation Worker Tests...\n');
  
  const testDir = __dirname;
  const files = await fs.readdir(testDir);
  const testFiles = files.filter(f => f.endsWith('.test.js'));
  
  let totalTests = 0;
  let passedTests = 0;
  let failedTests = 0;
  
  for (const file of testFiles) {
    console.log(`\n📄 Running ${file}...`);
    console.log('─'.repeat(50));
    
    try {
      const testModule = await import(path.join(testDir, file));
      const results = await testModule.runTests();
      
      totalTests += results.total;
      passedTests += results.passed;
      failedTests += results.failed;
      
      console.log(`\n✅ ${file}: ${results.passed}/${results.total} tests passed`);
      
      if (results.failed > 0) {
        console.log(`❌ ${results.failed} tests failed`);
      }
    } catch (error) {
      console.error(`\n❌ Error running ${file}:`, error);
      failedTests++;
      totalTests++;
    }
  }
  
  // Summary
  console.log('\n' + '═'.repeat(50));
  console.log('📊 Test Summary:');
  console.log(`   Total Tests: ${totalTests}`);
  console.log(`   ✅ Passed: ${passedTests}`);
  console.log(`   ❌ Failed: ${failedTests}`);
  console.log('═'.repeat(50));
  
  process.exit(failedTests > 0 ? 1 : 0);
}

runTests().catch(console.error);