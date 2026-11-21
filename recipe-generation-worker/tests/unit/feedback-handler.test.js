import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Feedback Handler - Unit Tests
 * Saving an AI-generated recipe is reported back to the generation trace as a
 * positive feedback score.
 */

const logTraceFeedback = vi.fn();
const isHealthy = vi.fn();

vi.mock('../../src/opik-client.js', () => ({
  OpikClient: vi.fn().mockImplementation((apiKey) => ({
    apiKey,
    isHealthy,
    logTraceFeedback
  }))
}));

import { handleFeedback, FEEDBACK_EVENTS } from '../../src/handlers/feedback-handler.js';
import { OpikClient } from '../../src/opik-client.js';
import { mockEnv, mockEnvWithOpik, createPostRequest } from '../setup.js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

const TRACE_ID = '0194f0d6-6a3a-7c2b-9c1a-1f1b2c3d4e5f';

describe('Feedback Handler - Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isHealthy.mockReturnValue(true);
    logTraceFeedback.mockResolvedValue(true);
  });

  describe('Recording a save as positive feedback', () => {
    it('should log a positive score against the generation trace', async () => {
      const request = createPostRequest('/feedback', { traceId: TRACE_ID, event: 'recipe_saved' });
      const response = await handleFeedback(request, mockEnvWithOpik, corsHeaders);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({
        success: true,
        recorded: true,
        event: 'recipe_saved',
        traceId: TRACE_ID,
        score: { name: 'user_saved_recipe', value: 1 }
      });
      expect(logTraceFeedback).toHaveBeenCalledWith(TRACE_ID, {
        name: 'user_saved_recipe',
        value: 1,
        categoryName: 'positive',
        reason: FEEDBACK_EVENTS.recipe_saved.reason
      });
    });

    it('should include the saved recipe id in the score reason when provided', async () => {
      const request = createPostRequest('/feedback', {
        traceId: TRACE_ID,
        event: 'recipe_saved',
        recipeId: 'recipe-123'
      });
      await handleFeedback(request, mockEnvWithOpik, corsHeaders);

      expect(logTraceFeedback).toHaveBeenCalledWith(TRACE_ID, expect.objectContaining({
        reason: expect.stringContaining('recipe-123')
      }));
    });

    it('should create the Opik client with the configured workspace', async () => {
      const request = createPostRequest('/feedback', { traceId: TRACE_ID, event: 'recipe_saved' });
      await handleFeedback(request, mockEnvWithOpik, corsHeaders);

      expect(OpikClient).toHaveBeenCalledWith(mockEnvWithOpik.OPIK_API_KEY, 'recipe-generation');
    });

    it('should include CORS headers on the response', async () => {
      const request = createPostRequest('/feedback', { traceId: TRACE_ID, event: 'recipe_saved' });
      const response = await handleFeedback(request, mockEnvWithOpik, corsHeaders);

      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
      expect(response.headers.get('Content-Type')).toBe('application/json');
    });
  });

  describe('Validation', () => {
    it('should reject non-JSON requests', async () => {
      const request = new Request('https://test.com/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: 'traceId=abc'
      });
      const response = await handleFeedback(request, mockEnvWithOpik, corsHeaders);

      expect(response.status).toBe(400);
      expect((await response.json()).error).toContain('Content-Type');
      expect(logTraceFeedback).not.toHaveBeenCalled();
    });

    it('should reject malformed JSON bodies', async () => {
      const request = new Request('https://test.com/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{ not json'
      });
      const response = await handleFeedback(request, mockEnvWithOpik, corsHeaders);

      expect(response.status).toBe(400);
      expect((await response.json()).error).toBe('Invalid JSON body');
    });

    it('should reject a missing trace id', async () => {
      const request = createPostRequest('/feedback', { event: 'recipe_saved' });
      const response = await handleFeedback(request, mockEnvWithOpik, corsHeaders);

      expect(response.status).toBe(400);
      expect((await response.json()).error).toContain('traceId');
      expect(logTraceFeedback).not.toHaveBeenCalled();
    });

    it('should reject a trace id that is not id-shaped', async () => {
      const request = createPostRequest('/feedback', { traceId: 'not a trace id!', event: 'recipe_saved' });
      const response = await handleFeedback(request, mockEnvWithOpik, corsHeaders);

      expect(response.status).toBe(400);
      expect(logTraceFeedback).not.toHaveBeenCalled();
    });

    it('should reject a missing event', async () => {
      const request = createPostRequest('/feedback', { traceId: TRACE_ID });
      const response = await handleFeedback(request, mockEnvWithOpik, corsHeaders);

      expect(response.status).toBe(400);
      expect((await response.json()).error).toContain('event');
      expect(logTraceFeedback).not.toHaveBeenCalled();
    });

    it('should reject unsupported events so callers cannot invent scores', async () => {
      const request = createPostRequest('/feedback', { traceId: TRACE_ID, event: 'recipe_loved' });
      const response = await handleFeedback(request, mockEnvWithOpik, corsHeaders);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.supportedEvents).toEqual(['recipe_saved']);
      expect(logTraceFeedback).not.toHaveBeenCalled();
    });
  });

  describe('Graceful degradation', () => {
    it('should succeed without recording when tracing is disabled', async () => {
      const request = createPostRequest('/feedback', { traceId: TRACE_ID, event: 'recipe_saved' });
      const response = await handleFeedback(request, mockEnv, corsHeaders);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({
        success: true,
        recorded: false,
        reason: 'tracing_disabled',
        event: 'recipe_saved'
      });
      expect(logTraceFeedback).not.toHaveBeenCalled();
    });

    it('should succeed without recording when the Opik client is unhealthy', async () => {
      isHealthy.mockReturnValue(false);
      const request = createPostRequest('/feedback', { traceId: TRACE_ID, event: 'recipe_saved' });
      const response = await handleFeedback(request, mockEnvWithOpik, corsHeaders);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.recorded).toBe(false);
      expect(data.reason).toBe('tracing_disabled');
    });

    it('should report failure when the score could not be logged', async () => {
      logTraceFeedback.mockResolvedValue(false);
      const request = createPostRequest('/feedback', { traceId: TRACE_ID, event: 'recipe_saved' });
      const response = await handleFeedback(request, mockEnvWithOpik, corsHeaders);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.success).toBe(false);
      expect(data.recorded).toBe(false);
    });
  });
});
