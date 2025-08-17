/**
 * Tests for Recipe Recommendation Worker
 */

import { getRecipeRecommendations, getSeason, getMockRecommendations } from '../src/index.js';

// Test utilities
function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

function assertEquals(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message || 'Assertion failed'}: expected ${expected}, got ${actual}`);
  }
}

function assertDeepEquals(actual, expected, message) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message || 'Deep assertion failed'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

// Mock environment
const mockEnv = {
  AI: null
};

// Test suite
export async function runTests() {
  const tests = [];
  let passed = 0;
  let failed = 0;

  // Test 1: getSeason function
  tests.push({
    name: 'getSeason should return correct seasons',
    fn: async () => {
      assertEquals(getSeason(new Date('2024-01-15')), 'Winter', 'January should be Winter');
      assertEquals(getSeason(new Date('2024-04-15')), 'Spring', 'April should be Spring');
      assertEquals(getSeason(new Date('2024-07-15')), 'Summer', 'July should be Summer');
      assertEquals(getSeason(new Date('2024-10-15')), 'Fall', 'October should be Fall');
    }
  });

  // Test 2: getMockRecommendations function
  tests.push({
    name: 'getMockRecommendations should return seasonal data',
    fn: async () => {
      const winterRecs = getMockRecommendations('New York', '2024-01-15');
      assert(winterRecs.recommendations, 'Should have recommendations');
      assert(winterRecs.season === 'Winter', 'Should identify winter season');
      assert(winterRecs.location === 'New York', 'Should include location');
      assert(winterRecs.date === '2024-01-15', 'Should include date');
      
      const summerRecs = getMockRecommendations('California', '2024-07-04');
      assert(summerRecs.season === 'Summer', 'Should identify summer season');
      assert(summerRecs.recommendations['BBQ & Grilling'], 'Summer should have BBQ category');
    }
  });

  // Test 3: getRecipeRecommendations without AI binding
  tests.push({
    name: 'getRecipeRecommendations should return mock data when no AI binding',
    fn: async () => {
      const result = await getRecipeRecommendations('Boston', '2024-03-15', mockEnv);
      assert(result.note && result.note.includes('mock'), 'Should indicate mock data');
      assert(result.season === 'Spring', 'Should have correct season');
    }
  });

  // Test 4: Mock recommendations structure validation
  tests.push({
    name: 'Mock recommendations should have proper structure',
    fn: async () => {
      const recs = getMockRecommendations('Test City', '2024-06-15');
      assert(typeof recs === 'object', 'Should return an object');
      assert(recs.recommendations, 'Should have recommendations property');
      
      const categories = Object.keys(recs.recommendations);
      assert(categories.length === 3, 'Should have 3 categories');
      
      categories.forEach(category => {
        assert(Array.isArray(recs.recommendations[category]), `${category} should be an array`);
        assert(recs.recommendations[category].length > 0, `${category} should have tags`);
      });
    }
  });

  // Test 5: Date edge cases
  tests.push({
    name: 'Should handle various date formats',
    fn: async () => {
      const dates = [
        '2024-12-25',  // Christmas
        '2024-01-01',  // New Year
        '2024-07-04',  // July 4th
        '2024-10-31',  // Halloween
      ];
      
      for (const date of dates) {
        const recs = getMockRecommendations('Test', date);
        assert(recs.date === date, `Should preserve date ${date}`);
        assert(recs.season, `Should have season for ${date}`);
      }
    }
  });

  // Test 6: Location handling
  tests.push({
    name: 'Should handle various location formats',
    fn: async () => {
      const locations = [
        'New York, NY',
        'San Francisco',
        'London, UK',
        'Tokyo, Japan',
        '90210'  // Zip code
      ];
      
      for (const location of locations) {
        const recs = getMockRecommendations(location, '2024-06-15');
        assert(recs.location === location, `Should preserve location ${location}`);
      }
    }
  });

  // Test 7: Seasonal recommendations content
  tests.push({
    name: 'Each season should have appropriate recommendations',
    fn: async () => {
      const seasons = {
        'Winter': { date: '2024-01-15', expectedTag: 'citrus' },
        'Spring': { date: '2024-04-15', expectedTag: 'asparagus' },
        'Summer': { date: '2024-07-15', expectedTag: 'tomatoes' },
        'Fall': { date: '2024-10-15', expectedTag: 'pumpkin' }
      };
      
      for (const [season, data] of Object.entries(seasons)) {
        const recs = getMockRecommendations('Test', data.date);
        const allTags = Object.values(recs.recommendations).flat();
        assert(allTags.includes(data.expectedTag), 
          `${season} should include ${data.expectedTag}`);
      }
    }
  });

  // Test 8: Recommendation categories
  tests.push({
    name: 'Should have appropriate category names',
    fn: async () => {
      const recs = getMockRecommendations('Test', '2024-06-15');
      const categories = Object.keys(recs.recommendations);
      
      categories.forEach(category => {
        assert(category.length > 0, 'Category name should not be empty');
        assert(!category.includes('undefined'), 'Category should not contain undefined');
      });
    }
  });

  // Run all tests
  for (const test of tests) {
    try {
      await test.fn();
      console.log(`✅ ${test.name}`);
      passed++;
    } catch (error) {
      console.log(`❌ ${test.name}`);
      console.log(`   Error: ${error.message}`);
      failed++;
    }
  }

  return {
    total: tests.length,
    passed,
    failed
  };
}