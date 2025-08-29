import { describe, it, expect, beforeEach, vi } from 'vitest';
import worker from '../../src/index.js';

// Mock the embedding handler
vi.mock('../../src/handlers/embedding-handler.js', () => ({
  processEmbeddingMessage: vi.fn()
}));

import { processEmbeddingMessage } from '../../src/handlers/embedding-handler.js';

describe('Worker - Queue Processing', () => {
  let mockEnv;
  let mockBatch;

  beforeEach(() => {
    mockEnv = getMockEnv();
    mockBatch = createMockQueueBatch([
      createMockQueueMessage('recipe-1', 'msg-1'),
      createMockQueueMessage('recipe-2', 'msg-2')
    ]);

    // Reset mocks
    vi.clearAllMocks();
  });

  it('should process queue messages successfully', async () => {
    // Mock successful processing for both messages
    processEmbeddingMessage
      .mockResolvedValueOnce({ success: true, recipeId: 'recipe-1' })
      .mockResolvedValueOnce({ success: true, recipeId: 'recipe-2' });

    const result = await worker.queue(mockBatch, mockEnv, {});

    expect(result.processed).toBe(2);
    expect(result.skipped).toBe(0);
    expect(result.errors).toBe(0);
    expect(result.details).toHaveLength(2);
    expect(result.details[0]).toEqual({
      messageId: 'msg-1',
      status: 'processed',
      recipeId: 'recipe-1'
    });
    expect(result.details[1]).toEqual({
      messageId: 'msg-2',
      status: 'processed',
      recipeId: 'recipe-2'
    });

    // Verify messages were acknowledged
    expect(mockBatch.messages[0].ack).toHaveBeenCalled();
    expect(mockBatch.messages[1].ack).toHaveBeenCalled();
  });

  it('should handle skipped messages', async () => {
    // Mock one message skipped, one processed
    processEmbeddingMessage
      .mockResolvedValueOnce({ success: false, reason: 'already_has_embedding' })
      .mockResolvedValueOnce({ success: true, recipeId: 'recipe-2' });

    const result = await worker.queue(mockBatch, mockEnv, {});

    expect(result.processed).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.errors).toBe(0);
    expect(result.details[0]).toEqual({
      messageId: 'msg-1',
      status: 'skipped',
      reason: 'already_has_embedding'
    });
    expect(result.details[1]).toEqual({
      messageId: 'msg-2',
      status: 'processed',
      recipeId: 'recipe-2'
    });

    // Verify messages were acknowledged
    expect(mockBatch.messages[0].ack).toHaveBeenCalled();
    expect(mockBatch.messages[1].ack).toHaveBeenCalled();
  });

  it('should handle processing errors and retry messages', async () => {
    // Mock one message to throw an error
    processEmbeddingMessage
      .mockRejectedValueOnce(new Error('Processing failed'))
      .mockResolvedValueOnce({ success: true, recipeId: 'recipe-2' });

    const result = await worker.queue(mockBatch, mockEnv, {});

    expect(result.processed).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.errors).toBe(1);
    expect(result.details[0]).toEqual({
      messageId: 'msg-1',
      status: 'error',
      reason: 'Processing failed'
    });
    expect(result.details[1]).toEqual({
      messageId: 'msg-2',
      status: 'processed',
      recipeId: 'recipe-2'
    });

    // Verify first message was retried, second was acknowledged
    expect(mockBatch.messages[0].retry).toHaveBeenCalled();
    expect(mockBatch.messages[1].ack).toHaveBeenCalled();
  });

  it('should handle empty batch', async () => {
    const emptyBatch = createMockQueueBatch([]);

    const result = await worker.queue(emptyBatch, mockEnv, {});

    expect(result.processed).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.errors).toBe(0);
    expect(result.details).toHaveLength(0);
  });

  it('should process single message batch', async () => {
    const singleBatch = createMockQueueBatch([
      createMockQueueMessage('recipe-1', 'msg-1')
    ]);

    processEmbeddingMessage.mockResolvedValue({ success: true, recipeId: 'recipe-1' });

    const result = await worker.queue(singleBatch, mockEnv, {});

    expect(result.processed).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.errors).toBe(0);
    expect(result.details).toHaveLength(1);
    expect(singleBatch.messages[0].ack).toHaveBeenCalled();
  });

  it('should handle mixed success/failure scenarios', async () => {
    const mixedBatch = createMockQueueBatch([
      createMockQueueMessage('recipe-1', 'msg-1'),
      createMockQueueMessage('recipe-2', 'msg-2'),
      createMockQueueMessage('recipe-3', 'msg-3')
    ]);

    // Mock mixed results: success, skip, error
    processEmbeddingMessage
      .mockResolvedValueOnce({ success: true, recipeId: 'recipe-1' })
      .mockResolvedValueOnce({ success: false, reason: 'already_has_embedding' })
      .mockRejectedValueOnce(new Error('AI service unavailable'));

    const result = await worker.queue(mixedBatch, mockEnv, {});

    expect(result.processed).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.errors).toBe(1);
    expect(result.details).toHaveLength(3);

    // Verify appropriate actions were taken
    expect(mixedBatch.messages[0].ack).toHaveBeenCalled();
    expect(mixedBatch.messages[1].ack).toHaveBeenCalled();
    expect(mixedBatch.messages[2].retry).toHaveBeenCalled();
  });

  it('should log processing progress', async () => {
    const consoleSpy = vi.spyOn(console, 'log');

    processEmbeddingMessage.mockResolvedValue({ success: true, recipeId: 'recipe-1' });

    await worker.queue(mockBatch, mockEnv, {});

    expect(consoleSpy).toHaveBeenCalledWith('Processing 2 recipe IDs from embedding queue');
    expect(consoleSpy).toHaveBeenCalledWith('Processing recipe ID: recipe-1');
    expect(consoleSpy).toHaveBeenCalledWith('Processing recipe ID: recipe-2');
    expect(consoleSpy).toHaveBeenCalledWith('Queue processing completed: 2 processed, 0 skipped, 0 errors');
  });

  it('should log error details', async () => {
    const consoleSpy = vi.spyOn(console, 'error');

    processEmbeddingMessage.mockRejectedValue(new Error('Test error'));

    await worker.queue(mockBatch, mockEnv, {});

    expect(consoleSpy).toHaveBeenCalledWith('Error processing message msg-1:', expect.any(Error));
    expect(consoleSpy).toHaveBeenCalledWith('Error processing message msg-2:', expect.any(Error));
  });
});

