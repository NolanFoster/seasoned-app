/**
 * Test suite for MetricsCollector
 * Tests the metrics collection functionality
 */

import { MetricsCollector, metrics } from './metrics-collector.js';

// Test utilities
function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function assertDeepEqual(actual, expected, message) {
  const actualStr = JSON.stringify(actual, null, 2);
  const expectedStr = JSON.stringify(expected, null, 2);
  if (actualStr !== expectedStr) {
    throw new Error(`Assertion failed: ${message}\nExpected: ${expectedStr}\nActual: ${actualStr}`);
  }
}

// Test MetricsCollector class
async function testMetricsCollector() {
  console.log('Testing MetricsCollector...');
  
  const collector = new MetricsCollector();
  
  // Test increment functionality
  collector.increment('test_counter');
  collector.increment('test_counter', 5);
  collector.increment('test_counter_with_tags', 1, { environment: 'test' });
  
  const metrics = collector.getMetrics();
  assert(metrics['test_counter:{}'].count === 6, 'Counter should be 6');
  assert(metrics['test_counter_with_tags:{"environment":"test"}'].count === 1, 'Tagged counter should be 1');
  
  // Test timing functionality
  collector.timing('test_timer', 100);
  collector.timing('test_timer', 200);
  collector.timing('test_timer', 150);
  
  const timingMetrics = collector.getMetrics();
  const timerKey = 'test_timer_duration:{}';
  assert(timingMetrics[timerKey].count === 3, 'Timer count should be 3');
  assert(timingMetrics[timerKey].total === 450, 'Timer total should be 450');
  assert(timingMetrics[timerKey].avg === 150, 'Timer average should be 150');
  assert(timingMetrics[timerKey].min === 100, 'Timer min should be 100');
  assert(timingMetrics[timerKey].max === 200, 'Timer max should be 200');
  
  // Test getMetricsByName
  const counterMetrics = collector.getMetricsByName('test_counter');
  assert(Object.keys(counterMetrics).length === 2, 'Should have 2 counter metrics');
  
  // Test getSummary
  const summary = collector.getSummary();
  assert(summary.totalMetrics > 0, 'Summary should have metrics');
  assert(summary.counters.test_counter === 6, 'Summary counter should be 6');
  assert(summary.timings.test_timer.count === 3, 'Summary timing count should be 3');
  
  // Test reset
  collector.reset();
  const emptyMetrics = collector.getMetrics();
  assert(Object.keys(emptyMetrics).length === 0, 'Metrics should be empty after reset');
  
  console.log('✓ MetricsCollector tests passed');
}

// Test global metrics instance
async function testGlobalMetrics() {
  console.log('Testing global metrics instance...');
  
  // Reset to ensure clean state
  metrics.reset();
  
  metrics.increment('global_test');
  const globalMetrics = metrics.getMetrics();
  assert(globalMetrics['global_test:{}'].count === 1, 'Global metrics should work');
  
  console.log('✓ Global metrics tests passed');
}

// Test edge cases
async function testEdgeCases() {
  console.log('Testing edge cases...');
  
  const collector = new MetricsCollector();
  
  // Test with zero duration
  collector.timing('zero_timer', 0);
  const zeroMetrics = collector.getMetrics();
  assert(zeroMetrics['zero_timer_duration:{}'].min === 0, 'Min should handle zero');
  
  // Test with negative values
  collector.increment('negative_test', -1);
  const negativeMetrics = collector.getMetrics();
  assert(negativeMetrics['negative_test:{}'].count === -1, 'Should handle negative increments');
  
  // Test with complex tags
  collector.increment('complex_tags', 1, { 
    environment: 'test', 
    version: '1.0.0',
    nested: { key: 'value' }
  });
  const complexMetrics = collector.getMetrics();
  const complexKey = Object.keys(complexMetrics).find(k => k.includes('complex_tags'));
  assert(complexKey, 'Should handle complex tags');
  
  console.log('✓ Edge case tests passed');
}

// Test performance
async function testPerformance() {
  console.log('Testing performance...');
  
  const collector = new MetricsCollector();
  const start = Date.now();
  
  // Add many metrics quickly
  for (let i = 0; i < 1000; i++) {
    collector.increment('perf_test', 1, { iteration: i % 10 });
    collector.timing('perf_timer', Math.random() * 100, { batch: Math.floor(i / 100) });
  }
  
  const duration = Date.now() - start;
  console.log(`Added 2000 metrics in ${duration}ms`);
  
  const perfMetrics = collector.getMetrics();
  assert(Object.keys(perfMetrics).length > 0, 'Should have performance metrics');
  
  console.log('✓ Performance tests passed');
}

// Run all tests
async function runTests() {
  try {
    await testMetricsCollector();
    await testGlobalMetrics();
    await testEdgeCases();
    await testPerformance();
    
    console.log('\n🎉 All MetricsCollector tests passed!');
    return true;
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    return false;
  }
}

// Export for use in other test files
export { testMetricsCollector, testGlobalMetrics, testEdgeCases, testPerformance };

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runTests().then(success => {
    process.exit(success ? 0 : 1);
  });
}
