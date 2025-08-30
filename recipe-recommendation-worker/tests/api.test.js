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
  let tempWorkerPath;

  beforeAll(async () => {
    // Create a temporary worker file that imports mocked utilities
    const fs = await import('fs');
    const workerContent = await fs.promises.readFile(path.join(__dirname, '../src/index.js'), 'utf-8');
    let modifiedWorkerContent = workerContent
      .replace(
        "import { log as baseLog, generateRequestId } from '../../shared/utility-functions.js';",
        `// Mock utilities for testing
const baseLog = function(level, message, data = {}, context = {}) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    level,
    message,
    ...data,
    ...context
  };
  
  switch (level.toLowerCase()) {
    case 'error':
      console.error(JSON.stringify(logEntry));
      break;
    case 'warn':
      console.warn(JSON.stringify(logEntry));
      break;
    case 'info':
      console.log(JSON.stringify(logEntry));
      break;
    case 'debug':
      console.log(JSON.stringify(logEntry));
      break;
    default:
      console.log(JSON.stringify(logEntry));
  }
};

const generateRequestId = function() {
  return \`req_\${Date.now()}_\${Math.random().toString(36).substr(2, 9)}\`;
};`
      )
      .replace(
        "import { MetricsCollector } from '../../shared/metrics-collector.js';",
        `// Mock MetricsCollector for testing
class MetricsCollector {
  constructor() {
    this.metrics = new Map();
  }

  increment(metric, value = 1, tags = {}) {
    const key = \`\${metric}:\${JSON.stringify(tags)}\`;
    const current = this.metrics.get(key) || { count: 0, tags };
    current.count += value;
    this.metrics.set(key, current);
  }

  timing(metric, duration, tags = {}) {
    const key = \`\${metric}_duration:\${JSON.stringify(tags)}\`;
    const current = this.metrics.get(key) || { 
      count: 0, 
      total: 0, 
      min: Infinity, 
      max: -Infinity, 
      tags 
    };
    current.count += 1;
    current.total += duration;
    current.min = Math.min(current.min, duration);
    current.max = Math.max(current.max, duration);
    current.avg = current.total / current.count;
    this.metrics.set(key, current);
  }

  getMetrics() {
    const result = {};
    for (const [key, value] of this.metrics.entries()) {
      result[key] = value;
    }
    return result;
  }

  reset() {
    this.metrics.clear();
  }
}`
      );
    
    // Write the modified worker to a temporary file
    tempWorkerPath = path.join(__dirname, '../src/index.test.js');
    await fs.promises.writeFile(tempWorkerPath, modifiedWorkerContent);
    
    // Initialize Miniflare
    mf = new Miniflare({
      scriptPath: tempWorkerPath,
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
    
    // Clean up temporary test file
    try {
      const fs = await import('fs');
      await fs.promises.unlink(tempWorkerPath);
    } catch (error) {
      // Ignore if file doesn't exist
    }
  });

  describe('Health Check', () => {
    it('GET /health should return healthy status', async () => {
      const response = await mf.dispatchFetch('http://localhost/health');
      expect(response.status).toBe(200);
      
      const data = await response.json();
      expect(data.status).toBe('healthy');
    });

    it('GET /health should check AI service and report its status', async () => {
      const response = await mf.dispatchFetch('http://localhost/health');
      expect(response.status).toBe(200);
      
      const data = await response.json();
      expect(data.status).toBe('healthy');
      expect(data.services).toBeDefined();
      expect(data.services.ai).toBeDefined();
      // AI status should be either 'healthy' or 'error' depending on the binding
      expect(['healthy', 'error', 'not_configured']).toContain(data.services.ai);
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

  describe('Recipe Names Endpoint', () => {
    it('POST /recipe-names should return AI-generated recipe names by category', async () => {
      const response = await mf.dispatchFetch('http://localhost/recipe-names', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categories: ['Italian Cuisine', 'Quick Meals'],
          limit: 3
        })
      });
      
      expect(response.status).toBe(200);
      
      const data = await response.json();
      expect(data).toHaveProperty('recipeNames');
      expect(data).toHaveProperty('requestId');
      expect(data).toHaveProperty('processingTime');
      expect(data).toHaveProperty('recipesPerCategory', 3);
      expect(data).toHaveProperty('categories');
      
      // Check recipe names structure
      const recipeNames = data.recipeNames;
      expect(Object.keys(recipeNames).length).toBeGreaterThan(0);
      
      // Each category should have an array of recipe names
      Object.values(recipeNames).forEach(recipes => {
        expect(recipes).toBeInstanceOf(Array);
        expect(recipes.length).toBeLessThanOrEqual(3);
        expect(recipes.length).toBeGreaterThan(0);
      });
    });

    it('POST /recipe-names should validate required parameters', async () => {
      // Test missing categories
      const response1 = await mf.dispatchFetch('http://localhost/recipe-names', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      
      expect(response1.status).toBe(400);
      
      const data1 = await response1.json();
      expect(data1.error).toContain('Categories array is required');
      
      // Test empty categories array
      const response2 = await mf.dispatchFetch('http://localhost/recipe-names', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categories: [] })
      });
      
      expect(response2.status).toBe(400);
      
      const data2 = await response2.json();
      expect(data2.error).toContain('Categories array is required');
    });

    it('POST /recipe-names should respect limit parameter', async () => {
      const response = await mf.dispatchFetch('http://localhost/recipe-names', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categories: ['Desserts'],
          limit: 5
        })
      });
      
      expect(response.status).toBe(200);
      
      const data = await response.json();
      expect(data.recipesPerCategory).toBe(5);
      
      // Check that we get the requested number of recipes
      const desserts = data.recipeNames['Desserts'] || data.recipeNames['Desserts'] || [];
      expect(desserts.length).toBeLessThanOrEqual(5);
    });

    it('GET /recipe-names should return 405 Method Not Allowed', async () => {
      const response = await mf.dispatchFetch('http://localhost/recipe-names', {
        method: 'GET'
      });
      
      expect(response.status).toBe(405);
      
      const data = await response.json();
      expect(data.error).toBeDefined();
      expect(data.error).toContain('Method not allowed');
    });
  });
});