/**
 * Unit tests for recommendations handler
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleRecommendations } from '../../src/handlers/recommendations-handler.js';

// Mock all external dependencies
vi.mock('../../../shared/utility-functions.js', () => ({
  log: vi.fn(),
  generateRequestId: vi.fn(() => 'req-test-id')
}));

vi.mock('../../src/shared-utilities.js', () => ({
  metrics: {
    increment: vi.fn(),
    timing: vi.fn(),
    getMetrics: vi.fn(() => ({})),
    reset: vi.fn()
  },
  categorizeError: vi.fn(() => ({ category: 'test_error', severity: 'error' })),
  sendAnalytics: vi.fn()
}));

vi.mock('../../src/recommendation-service.js', () => ({
  getRecipeRecommendations: vi.fn()
}));

import { getRecipeRecommendations } from '../../src/recommendation-service.js';

describe('handleRecommendations', () => {
  const requestId = 'req-handler-test';
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return 200 with recommendations on success', async () => {
    const mockRecommendations = {
      recommendations: {
        'Summer Salads': [{ name: 'Greek Salad', source: 'ai_generated' }],
        'Grilled Dishes': [{ name: 'BBQ Chicken', source: 'ai_generated' }]
      },
      season: 'Summer',
      isMockData: false
    };
    getRecipeRecommendations.mockResolvedValue(mockRecommendations);

    const request = new Request('http://localhost/recommendations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ location: 'San Francisco', date: '2024-07-15', limit: 3 })
    });

    const response = await handleRecommendations(request, {}, corsHeaders, requestId);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.recommendations).toBeDefined();
    expect(data.requestId).toBe(requestId);
    expect(data.processingTime).toBeDefined();
    expect(data.recipesPerCategory).toBe(3);
    expect(data.aiGeneratedCount).toBe(0);
  });

  it('should return 500 with error message when service throws', async () => {
    getRecipeRecommendations.mockRejectedValue(new Error('AI service unavailable'));

    const request = new Request('http://localhost/recommendations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ location: 'Seattle', date: '2024-01-15' })
    });

    const response = await handleRecommendations(request, {}, corsHeaders, requestId);

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toBe('Failed to get recommendations');
    expect(data.requestId).toBe(requestId);
  });

  it('should use defaults when limit and aiGenerated not provided', async () => {
    const mockRecommendations = { recommendations: {}, season: 'Winter', isMockData: false };
    getRecipeRecommendations.mockResolvedValue(mockRecommendations);

    const request = new Request('http://localhost/recommendations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ location: 'Boston' })
    });

    const response = await handleRecommendations(request, {}, corsHeaders, requestId);
    const data = await response.json();

    expect(data.recipesPerCategory).toBe(3);
    expect(data.aiGeneratedCount).toBe(0);
  });

  it('should clamp recipesPerCategory between 1 and 10', async () => {
    const mockRecommendations = { recommendations: {}, season: 'Spring', isMockData: false };
    getRecipeRecommendations.mockResolvedValue(mockRecommendations);

    const request = new Request('http://localhost/recommendations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 100 })
    });

    const response = await handleRecommendations(request, {}, corsHeaders, requestId);
    const data = await response.json();

    expect(data.recipesPerCategory).toBe(10);
  });

  it('should handle recommendations object without recommendations property', async () => {
    // Edge case: service returns object without .recommendations
    const mockRecommendations = { season: 'Fall', isMockData: true };
    getRecipeRecommendations.mockResolvedValue(mockRecommendations);

    const request = new Request('http://localhost/recommendations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ location: 'Portland' })
    });

    const response = await handleRecommendations(request, {}, corsHeaders, requestId);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.season).toBe('Fall');
  });

  it('should pass aiGenerated count to service', async () => {
    const mockRecommendations = { recommendations: {}, season: 'Summer', isMockData: false };
    getRecipeRecommendations.mockResolvedValue(mockRecommendations);

    const request = new Request('http://localhost/recommendations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ location: 'Miami', aiGenerated: 5 })
    });

    await handleRecommendations(request, {}, corsHeaders, requestId);

    expect(getRecipeRecommendations).toHaveBeenCalledWith(
      'Miami',
      expect.any(String),
      3,
      5,
      {},
      requestId
    );
  });

  it('should return 500 when JSON body is invalid', async () => {
    const request = new Request('http://localhost/recommendations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-valid-json'
    });

    const response = await handleRecommendations(request, {}, corsHeaders, requestId);

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toBe('Failed to get recommendations');
  });
});
