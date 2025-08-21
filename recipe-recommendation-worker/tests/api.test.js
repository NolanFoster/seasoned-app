/**
 * API Endpoint Tests for Recipe Recommendation Worker
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Miniflare } from 'miniflare';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Recipe Recommendation Worker API', () => {
  let mf;

  beforeAll(async () => {
    // Initialize Miniflare
    mf = new Miniflare({
      scriptPath: path.join(__dirname, '../src/index.js'),
      modules: true,
      bindings: {
        AI: null // Testing without AI binding
      }
    });
  });

  afterAll(async () => {
    // Cleanup
    if (mf) {
      await mf.dispose();
    }
  });

  describe('Health Check', () => {
    it('GET /health should return healthy status', async () => {
      const response = await mf.dispatchFetch('http://localhost/health');
      expect(response.status).toBe(200);
      
      const data = await response.json();
      expect(data.status).toBe('healthy');
    });
  });

  describe('CORS Handling', () => {
    it('OPTIONS request should handle CORS', async () => {
      const response = await mf.dispatchFetch('http://localhost/recommendations', {
        method: 'OPTIONS'
      });
      
      expect(response.status).toBe(200);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
      expect(response.headers.get('Access-Control-Allow-Methods')).toBeDefined();
    });

    it('All responses should include CORS headers', async () => {
      const endpoints = [
        { url: '/health', method: 'GET' },
        { url: '/recommendations', method: 'POST', body: JSON.stringify({ location: 'Test' }) },
        { url: '/unknown', method: 'GET' }
      ];
      
      for (const endpoint of endpoints) {
        const options = {
          method: endpoint.method,
          headers: endpoint.body ? { 'Content-Type': 'application/json' } : {}
        };
        if (endpoint.body) options.body = endpoint.body;
        
        const response = await mf.dispatchFetch(`http://localhost${endpoint.url}`, options);
        expect(response.headers.get('Access-Control-Allow-Origin')).toBeDefined();
      }
    });
  });

  describe('POST /recommendations', () => {
    it('should return recommendations with valid data', async () => {
      const response = await mf.dispatchFetch('http://localhost/recommendations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location: 'San Francisco, CA',
          date: '2024-07-15'
        })
      });
      
      expect(response.status).toBe(200);
      
      const data = await response.json();
      expect(data.recommendations).toBeDefined();
      expect(data.location).toBe('San Francisco, CA');
      expect(data.date).toBe('2024-07-15');
      expect(data.season).toBe('Summer');
    });

    it('should return valid recommendations without location', async () => {
      const response = await mf.dispatchFetch('http://localhost/recommendations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: '2024-07-15'
        })
      });
      
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.recommendations).toBeDefined();
      expect(Object.keys(data.recommendations)).toHaveLength(3);
      expect(data.location).toBe('Not specified');
    });

    it('should use current date when date is not provided', async () => {
      const response = await mf.dispatchFetch('http://localhost/recommendations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location: 'New York, NY'
        })
      });
      
      expect(response.status).toBe(200);
      
      const data = await response.json();
      expect(data.recommendations).toBeDefined();
      expect(data.date).toBeDefined();
      
      // Verify it's today's date
      const today = new Date().toISOString().split('T')[0];
      expect(data.date).toBe(today);
    });

    it('should return 500 with invalid JSON', async () => {
      const response = await mf.dispatchFetch('http://localhost/recommendations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'invalid json'
      });
      
      expect(response.status).toBe(500);
      
      const data = await response.json();
      expect(data.error).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('GET /recommendations should return 405 Method Not Allowed', async () => {
      const response = await mf.dispatchFetch('http://localhost/recommendations', {
        method: 'GET'
      });
      
      expect(response.status).toBe(405);
      
      const data = await response.json();
      expect(data.error).toBeDefined();
      expect(data.error).toContain('Method not allowed');
    });

    it('Unknown endpoint should return 404', async () => {
      const response = await mf.dispatchFetch('http://localhost/unknown');
      
      expect(response.status).toBe(404);
      
      const data = await response.json();
      expect(data.error).toBeDefined();
    });
  });

  describe('Recommendations Content', () => {
    it('should return proper recommendation structure', async () => {
      const response = await mf.dispatchFetch('http://localhost/recommendations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location: 'Seattle, WA',
          date: '2024-12-15'
        })
      });
      
      expect(response.status).toBe(200);
      
      const data = await response.json();
      expect(data).toHaveProperty('recommendations');
      expect(data).toHaveProperty('location', 'Seattle, WA');
      expect(data).toHaveProperty('date', '2024-12-15');
      expect(data).toHaveProperty('season', 'Winter');
      
      // Check recommendation categories
      const categories = Object.keys(data.recommendations);
      expect(categories.length).toBeGreaterThan(0);
      
      // Each category should have an array of tags
      categories.forEach(category => {
        expect(data.recommendations[category]).toBeInstanceOf(Array);
        expect(data.recommendations[category].length).toBeGreaterThan(0);
      });
    });

    it('should return different recommendations for different seasons', async () => {
      const winterResponse = await mf.dispatchFetch('http://localhost/recommendations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location: 'Test',
          date: '2024-01-15'
        })
      });
      
      const summerResponse = await mf.dispatchFetch('http://localhost/recommendations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location: 'Test',
          date: '2024-07-15'
        })
      });
      
      const winterData = await winterResponse.json();
      const summerData = await summerResponse.json();
      
      expect(winterData.season).toBe('Winter');
      expect(summerData.season).toBe('Summer');
      
      // Recommendations should be different
      const winterTags = Object.values(winterData.recommendations).flat();
      const summerTags = Object.values(summerData.recommendations).flat();
      
      // Some tags should be different between seasons
      const winterUnique = winterTags.filter(tag => !summerTags.includes(tag));
      const summerUnique = summerTags.filter(tag => !winterTags.includes(tag));
      
      expect(winterUnique.length).toBeGreaterThan(0);
      expect(summerUnique.length).toBeGreaterThan(0);
    });
  });
});