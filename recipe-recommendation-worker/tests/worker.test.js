/**
 * Tests for Recipe Recommendation Worker
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getRecipeRecommendations, getSeason, getMockRecommendations } from '../src/index.js';

// Mock environment
const mockEnv = {
  AI: null
};

describe('Recipe Recommendation Worker', () => {
  describe('getSeason function', () => {
    it('should return correct seasons', () => {
      expect(getSeason(new Date('2024-01-15'))).toBe('Winter');
      expect(getSeason(new Date('2024-04-15'))).toBe('Spring');
      expect(getSeason(new Date('2024-07-15'))).toBe('Summer');
      expect(getSeason(new Date('2024-10-15'))).toBe('Fall');
    });
  });

  describe('getMockRecommendations', () => {
    it('should return seasonal data', () => {
      const winterRecs = getMockRecommendations('New York', '2024-01-15');
      expect(winterRecs.season).toBe('Winter');
      expect(winterRecs.location).toBe('New York');
      expect(winterRecs.date).toBe('2024-01-15');
      
      const summerRecs = getMockRecommendations('Los Angeles', '2024-07-15');
      expect(summerRecs.season).toBe('Summer');
      expect(summerRecs.location).toBe('Los Angeles');
      expect(summerRecs.date).toBe('2024-07-15');
    });

    it('should include specific seasonal tags', () => {
      const winterRecs = getMockRecommendations('Boston', '2024-02-10');
      const allWinterTags = Object.values(winterRecs.recommendations).flat();
      expect(allWinterTags).toContain('citrus');
      expect(allWinterTags).toContain('kale');
      
      const summerRecs = getMockRecommendations('Miami', '2024-07-20');
      const allSummerTags = Object.values(summerRecs.recommendations).flat();
      expect(allSummerTags).toContain('tomatoes');
      expect(allSummerTags).toContain('berries');
    });

    it('should have proper structure', () => {
      const recs = getMockRecommendations('Test City', '2024-06-15');
      expect(recs).toBeTypeOf('object');
      expect(recs.recommendations).toBeDefined();
      
      const categories = Object.keys(recs.recommendations);
      expect(categories).toHaveLength(3);
      
      categories.forEach(category => {
        expect(recs.recommendations[category]).toBeInstanceOf(Array);
        expect(recs.recommendations[category].length).toBeGreaterThan(0);
      });
    });

    it('should handle various date formats', () => {
      const dates = [
        '2024-12-25',  // Christmas
        '2024-01-01',  // New Year
        '2024-07-04',  // July 4th
        '2024-10-31',  // Halloween
      ];
      
      dates.forEach(date => {
        const recs = getMockRecommendations('Test', date);
        expect(recs.date).toBe(date);
        expect(recs.season).toBeDefined();
      });
    });

    it('should handle various location formats', () => {
      const locations = [
        'New York, NY',
        'San Francisco',
        'London, UK',
        'Tokyo, Japan',
        '90210'  // Zip code
      ];
      
      locations.forEach(location => {
        const recs = getMockRecommendations(location, '2024-06-15');
        expect(recs.location).toBe(location);
      });
    });

    it('should have appropriate seasonal recommendations content', () => {
      const seasons = {
        'Winter': { date: '2024-01-15', expectedTag: 'citrus' },
        'Spring': { date: '2024-04-15', expectedTag: 'asparagus' },
        'Summer': { date: '2024-07-15', expectedTag: 'tomatoes' },
        'Fall': { date: '2024-10-15', expectedTag: 'pumpkin' }
      };
      
      Object.entries(seasons).forEach(([season, data]) => {
        const recs = getMockRecommendations('Test', data.date);
        const allTags = Object.values(recs.recommendations).flat();
        expect(allTags).toContain(data.expectedTag);
      });
    });

    it('should have appropriate category names', () => {
      const recs = getMockRecommendations('Test', '2024-06-15');
      const categories = Object.keys(recs.recommendations);
      
      categories.forEach(category => {
        expect(category.length).toBeGreaterThan(0);
        expect(category).not.toContain('undefined');
      });
    });
  });

  describe('getRecipeRecommendations', () => {
    it('should return mock recommendations when AI is not available', async () => {
      const result = await getRecipeRecommendations('San Francisco', '2024-06-15', mockEnv);
      expect(result).toBeDefined();
      expect(result.recommendations).toBeDefined();
      expect(result.location).toBe('San Francisco');
      expect(result.date).toBe('2024-06-15');
    });
  });
});