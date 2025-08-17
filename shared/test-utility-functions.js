import { formatDuration, isValidUrl } from './utility-functions.js';

// Test formatDuration function
console.log('Testing formatDuration function:');
console.log('PT1H30M ->', formatDuration('PT1H30M')); // Should output: "1 h 30 m"
console.log('PT45M ->', formatDuration('PT45M')); // Should output: "45 m"
console.log('PT2H ->', formatDuration('PT2H')); // Should output: "2 h"
console.log('1 hour 30 minutes ->', formatDuration('1 hour 30 minutes')); // Should return as-is
console.log('Empty string ->', formatDuration('')); // Should return empty string
console.log('null ->', formatDuration(null)); // Should return empty string
console.log('undefined ->', formatDuration(undefined)); // Should return empty string

console.log('\nTesting isValidUrl function:');
console.log('https://example.com ->', isValidUrl('https://example.com')); // Should output: true
console.log('http://example.com ->', isValidUrl('http://example.com')); // Should output: true
console.log('www.example.com ->', isValidUrl('www.example.com')); // Should output: true
console.log('example.com ->', isValidUrl('example.com')); // Should output: true
console.log('sub.example.com ->', isValidUrl('sub.example.com')); // Should output: true
console.log('not-a-url ->', isValidUrl('not-a-url')); // Should output: false
console.log('example ->', isValidUrl('example')); // Should output: false
console.log('example. ->', isValidUrl('example.')); // Should output: false
console.log('example.c ->', isValidUrl('example.c')); // Should output: false
console.log('example.com/path ->', isValidUrl('example.com/path')); // Should output: true
console.log('example.com/path?param=value ->', isValidUrl('example.com/path?param=value')); // Should output: true

console.log('\nAll tests completed!');
