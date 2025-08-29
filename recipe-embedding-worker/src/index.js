import { processEmbeddingMessage } from './handlers/embedding-handler.js';

export default {
  // Handle queue messages from recipe-embedding-queue
  async queue(batch, env, _ctx) {
    console.log(`Processing ${batch.messages.length} recipe IDs from embedding queue`);

    const results = {
      processed: 0,
      skipped: 0,
      errors: 0,
      details: []
    };

    for (const message of batch.messages) {
      try {
        console.log(`Processing recipe ID: ${message.body}`);

        // The message body is just the recipe ID
        const recipeId = message.body;

        const messageResult = await processEmbeddingMessage(recipeId, env);

        if (messageResult.success) {
          results.processed++;
          results.details.push({
            messageId: message.id,
            status: 'processed',
            recipeId: messageResult.recipeId
          });
        } else {
          results.skipped++;
          results.details.push({
            messageId: message.id,
            status: 'skipped',
            reason: messageResult.reason
          });
        }

        // Acknowledge the message
        message.ack();

      } catch (error) {
        console.error(`Error processing message ${message.id}:`, error);
        results.errors++;
        results.details.push({
          messageId: message.id,
          status: 'error',
          reason: error.message
        });

        // Retry the message on error
        message.retry();
      }
    }

    console.log(`Queue processing completed: ${results.processed} processed, ${results.skipped} skipped, ${results.errors} errors`);
    return results;
  }
};
