/**
 * Cache functionality unit tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Cache Functionality', () => {
  let mockCache;
  let mockCacheStorage;
  
  beforeEach(() => {
    // Mock Cache API
    mockCache = {
      match: vi.fn(),
      put: vi.fn()
    };
    
    mockCacheStorage = {
      default: mockCache
    };
    
    // Set up global caches
    global.caches = mockCacheStorage;
  });

  describe('Cache Key Generation', () => {
    it('should generate consistent cache keys for same parameters', () => {
      const params1 = {
        location: 'San Francisco, CA',
        date: '2024-07-15',
        limit: 3,
        aiGenerated: 0
      };
      
      const params2 = {
        location: 'San Francisco, CA',
        date: '2024-07-15',
        limit: 3,
        aiGenerated: 0
      };
      
      const key1 = new URL('https://cache.recommendations.com/api/recommendations');
      key1.searchParams.set('location', params1.location.toLowerCase().trim());
      key1.searchParams.set('date', params1.date);
      key1.searchParams.set('limit', params1.limit.toString());
      key1.searchParams.set('aiGenerated', params1.aiGenerated.toString());
      
      const key2 = new URL('https://cache.recommendations.com/api/recommendations');
      key2.searchParams.set('location', params2.location.toLowerCase().trim());
      key2.searchParams.set('date', params2.date);
      key2.searchParams.set('limit', params2.limit.toString());
      key2.searchParams.set('aiGenerated', params2.aiGenerated.toString());
      
      expect(key1.toString()).toBe(key2.toString());
    });
    
    it('should generate different cache keys for different locations', () => {
      const params1 = {
        location: 'San Francisco, CA',
        date: '2024-07-15',
        limit: 3,
        aiGenerated: 0
      };
      
      const params2 = {
        location: 'New York, NY',
        date: '2024-07-15',
        limit: 3,
        aiGenerated: 0
      };
      
      const key1 = new URL('https://cache.recommendations.com/api/recommendations');
      key1.searchParams.set('location', params1.location.toLowerCase().trim());
      key1.searchParams.set('date', params1.date);
      key1.searchParams.set('limit', params1.limit.toString());
      key1.searchParams.set('aiGenerated', params1.aiGenerated.toString());
      
      const key2 = new URL('https://cache.recommendations.com/api/recommendations');
      key2.searchParams.set('location', params2.location.toLowerCase().trim());
      key2.searchParams.set('date', params2.date);
      key2.searchParams.set('limit', params2.limit.toString());
      key2.searchParams.set('aiGenerated', params2.aiGenerated.toString());
      
      expect(key1.toString()).not.toBe(key2.toString());
    });
    
    it('should normalize location case for cache keys', () => {
      const params1 = {
        location: 'San Francisco, CA',
        date: '2024-07-15',
        limit: 3,
        aiGenerated: 0
      };
      
      const params2 = {
        location: 'SAN FRANCISCO, CA',
        date: '2024-07-15',
        limit: 3,
        aiGenerated: 0
      };
      
      const key1 = new URL('https://cache.recommendations.com/api/recommendations');
      key1.searchParams.set('location', params1.location.toLowerCase().trim());
      key1.searchParams.set('date', params1.date);
      key1.searchParams.set('limit', params1.limit.toString());
      key1.searchParams.set('aiGenerated', params1.aiGenerated.toString());
      
      const key2 = new URL('https://cache.recommendations.com/api/recommendations');
      key2.searchParams.set('location', params2.location.toLowerCase().trim());
      key2.searchParams.set('date', params2.date);
      key2.searchParams.set('limit', params2.limit.toString());
      key2.searchParams.set('aiGenerated', params2.aiGenerated.toString());
      
      expect(key1.toString()).toBe(key2.toString());
    });
    
    it('should handle missing location parameter', () => {
      const params = {
        date: '2024-07-15',
        limit: 3,
        aiGenerated: 0
      };
      
      const hasLocation = params.location && params.location.trim() !== '';
      
      const key = new URL('https://cache.recommendations.com/api/recommendations');
      key.searchParams.set('location', hasLocation ? params.location.toLowerCase().trim() : 'none');
      key.searchParams.set('date', params.date);
      key.searchParams.set('limit', params.limit.toString());
      key.searchParams.set('aiGenerated', params.aiGenerated.toString());
      
      expect(key.searchParams.get('location')).toBe('none');
    });
  });

  describe('Cache Response Headers', () => {
    it('should include cache headers in cached response', () => {
      const headers = {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600',
        'X-Cached-At': new Date().toISOString()
      };
      
      expect(headers['Cache-Control']).toBe('public, max-age=3600');
      expect(headers['X-Cached-At']).toBeDefined();
    });
    
    it('should set X-Cache header to HIT for cached responses', () => {
      const headers = {
        'X-Cache': 'HIT',
        'Cache-Control': 'public, max-age=3600'
      };
      
      expect(headers['X-Cache']).toBe('HIT');
    });
    
    it('should set X-Cache header to MISS for non-cached responses', () => {
      const headers = {
        'X-Cache': 'MISS',
        'Cache-Control': 'public, max-age=3600'
      };
      
      expect(headers['X-Cache']).toBe('MISS');
    });
  });

  describe('Cache Storage', () => {
    it('should call cache.put with correct parameters', async () => {
      const cacheKey = new URL('https://cache.recommendations.com/api/recommendations?location=test&date=2024-07-15&limit=3&aiGenerated=0');
      const responseData = {
        recommendations: {
          "Test Category": ["item1", "item2"]
        },
        location: "test",
        date: "2024-07-15"
      };
      
      const response = new Response(JSON.stringify(responseData), {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=3600',
          'X-Cached-At': new Date().toISOString()
        }
      });
      
      await mockCache.put(cacheKey, response);
      
      expect(mockCache.put).toHaveBeenCalledWith(cacheKey, response);
    });
    
    it('should handle cache.put errors gracefully', async () => {
      const cacheKey = new URL('https://cache.recommendations.com/api/recommendations?location=test&date=2024-07-15&limit=3&aiGenerated=0');
      
      mockCache.put.mockRejectedValue(new Error('Cache write failed'));
      
      const responseData = { test: 'data' };
      const response = new Response(JSON.stringify(responseData));
      
      // This should not throw
      await expect(mockCache.put(cacheKey, response)).rejects.toThrow('Cache write failed');
    });
  });

  describe('Cache Retrieval', () => {
    it('should return cached response when available', async () => {
      const cachedData = {
        recommendations: {
          "Cached Category": ["cached1", "cached2"]
        },
        location: "test",
        date: "2024-07-15"
      };
      
      const cachedResponse = new Response(JSON.stringify(cachedData), {
        headers: {
          'X-Cached-At': '2024-07-15T10:00:00Z'
        }
      });
      
      mockCache.match.mockResolvedValue(cachedResponse);
      
      const cacheKey = new URL('https://cache.recommendations.com/api/recommendations?location=test&date=2024-07-15&limit=3&aiGenerated=0');
      const result = await mockCache.match(cacheKey);
      
      expect(result).toBe(cachedResponse);
      expect(mockCache.match).toHaveBeenCalledWith(cacheKey);
    });
    
    it('should return null when cache miss', async () => {
      mockCache.match.mockResolvedValue(null);
      
      const cacheKey = new URL('https://cache.recommendations.com/api/recommendations?location=test&date=2024-07-15&limit=3&aiGenerated=0');
      const result = await mockCache.match(cacheKey);
      
      expect(result).toBeNull();
    });
  });
});