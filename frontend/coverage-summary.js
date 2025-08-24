#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Read coverage summary
const coveragePath = path.join(__dirname, 'coverage', 'coverage-summary.json');

try {
  const coverageData = JSON.parse(fs.readFileSync(coveragePath, 'utf8'));
  
  console.log('\n📊 Test Coverage Summary\n');
  console.log('='.repeat(50));
  
  // Overall coverage
  const total = coverageData.total;
  console.log('\n🎯 Overall Coverage:');
  console.log(`  • Statements: ${total.statements.pct}% (${total.statements.covered}/${total.statements.total})`);
  console.log(`  • Branches:   ${total.branches.pct}% (${total.branches.covered}/${total.branches.total})`);
  console.log(`  • Functions:  ${total.functions.pct}% (${total.functions.covered}/${total.functions.total})`);
  console.log(`  • Lines:      ${total.lines.pct}% (${total.lines.covered}/${total.lines.total})`);
  
  // File-by-file breakdown
  console.log('\n📁 File Coverage:');
  console.log('-'.repeat(50));
  
  const files = Object.entries(coverageData)
    .filter(([key]) => key !== 'total')
    .sort(([, a], [, b]) => a.statements.pct - b.statements.pct);
  
  files.forEach(([file, coverage]) => {
    const fileName = path.basename(file);
    const emoji = coverage.statements.pct >= 80 ? '✅' : 
                  coverage.statements.pct >= 60 ? '⚠️' : '❌';
    
    console.log(`\n${emoji} ${fileName}`);
    console.log(`    Statements: ${coverage.statements.pct}%`);
    console.log(`    Branches:   ${coverage.branches.pct}%`);
    console.log(`    Functions:  ${coverage.functions.pct}%`);
    console.log(`    Lines:      ${coverage.lines.pct}%`);
  });
  
  // Coverage thresholds check
  console.log('\n📈 Coverage Thresholds (60%):');
  console.log('-'.repeat(50));
  
  const threshold = 60;
  const metrics = ['statements', 'branches', 'functions', 'lines'];
  let allPassing = true;
  
  metrics.forEach(metric => {
    const pct = total[metric].pct;
    const passing = pct >= threshold;
    const emoji = passing ? '✅' : '❌';
    console.log(`  ${emoji} ${metric.charAt(0).toUpperCase() + metric.slice(1)}: ${pct}% ${passing ? 'PASS' : 'FAIL'}`);
    if (!passing) allPassing = false;
  });
  
  console.log('\n' + '='.repeat(50));
  console.log(allPassing ? '✅ All coverage thresholds met!' : '❌ Some coverage thresholds not met.');
  console.log('='.repeat(50) + '\n');
  
} catch (error) {
  console.error('❌ Error reading coverage data:', error.message);
  console.log('Run `npm test -- --coverage` first to generate coverage data.');
  process.exit(1);
}