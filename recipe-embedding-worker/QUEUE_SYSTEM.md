# Cloudflare Queue Embedding System

The recipe embedding worker has been refactored to use **Cloudflare Queues** instead of a custom KV-based queue system. This provides enterprise-grade reliability, automatic scaling, and built-in retry mechanisms.

## Overview

The Cloudflare Queue system ensures that:
- **All KV values eventually get processed** - No recipes are missed
- **50 AI call limit is respected** - Processing stops gracefully when approaching limits
- **Automatic retries** - Failed recipes are retried with exponential backoff
- **Real-time processing** - New recipes can be added immediately when saved
- **Built-in reliability** - Cloudflare Queues handle message persistence and delivery
- **Scalability** - Multiple workers can process from the same queue automatically

## Architecture

### Cloudflare Queue
The system uses a dedicated Cloudflare Queue named `recipe-embedding-queue` that:
- Automatically handles message persistence
- Provides built-in retry logic with exponential backoff
- Scales automatically based on demand
- Ensures message ordering and delivery

### Queue Message Structure
Each queue message contains:
```json
{
  "type": "recipe_embedding",
  "recipeId": "unique_recipe_id",
  "priority": "high|normal|low",
  "timestamp": 1234567890,
  "attempts": 0
}
```

### Priority System
- **High priority** - Processed first (e.g., user-requested recipes)
- **Normal priority** - Standard processing order
- **Low priority** - Processed last (e.g., bulk imports)

## API Endpoints

### 1. Process Embeddings
**POST** `/embed`
Initiates embedding generation (actual processing happens via queue consumer).

**Request Body:**
```json
{
  "scheduled": true
}
```

**Response:**
```json
{
  "message": "Embedding generation initiated",
  "queueStats": {
    "total": 100,
    "pending": 92,
    "processing": 0,
    "completed": 5,
    "failed": 1,
    "skipped": 2
  },
  "note": "Recipes are processed via Cloudflare Queue consumer"
}
```

### 2. Check Progress
**GET** `/progress`
Returns current queue statistics and processing status.

**Response:**
```json
{
  "status": "success",
  "progress": {
    "status": "processing",
    "totalRecipes": 1000,
    "queueStats": {
      "total": 100,
      "pending": 92,
      "processing": 0,
      "completed": 5,
      "failed": 1,
      "skipped": 2
    },
    "completionPercentage": 7,
    "lastUpdated": 1234567890,
    "note": "Queue processing is handled automatically by Cloudflare Queues"
  }
}
```

### 3. Populate Queue
**POST** `/populate-queue`
Compares KV storage with vector database and populates queue with missing recipes.

**Request Body:**
```json
{
  "forceReprocess": false,
  "priority": "normal"
}
```

**Response:**
```json
{
  "message": "Queue population completed",
  "checked": 1000,
  "found": 150,
  "addedToQueue": 150,
  "queueStats": {
    "total": 150,
    "pending": 150,
    "processing": 0,
    "completed": 0,
    "failed": 0,
    "skipped": 0
  }
}
```

### 4. Add to Queue
**POST** `/queue/add`
Adds a specific recipe to the embedding queue (used by other workers).

**Request Body:**
```json
{
  "recipeId": "unique_recipe_id",
  "priority": "high"
}
```

**Response:**
```json
{
  "status": "success",
  "message": "Recipe unique_recipe_id added to embedding queue",
  "recipeId": "unique_recipe_id",
  "priority": "high",
  "messageId": "unique_recipe_id"
}
```

### 5. Reset Queue Statistics
**DELETE** `/reset`
Clears the queue statistics (note: Cloudflare Queue messages are managed automatically).

**Response:**
```json
{
  "status": "success",
  "message": "Embedding queue statistics reset successfully",
  "note": "Note: Cloudflare Queue messages are managed automatically. This only resets local statistics."
}
```

## Integration with Other Workers

### Recipe Save Worker Integration
When a recipe is saved, it should automatically be added to the embedding queue:

```javascript
import { addRecipeToEmbeddingQueue } from '../shared/kv-storage.js';

// After successfully saving a recipe
const queueResult = await addRecipeToEmbeddingQueue(env, recipeId, 'normal');
if (queueResult.success) {
  console.log(`Recipe ${recipeId} queued for embedding`);
}
```

### Environment Configuration
Add the embedding worker URL to your worker's environment:

```toml
# wrangler.toml
[vars]
EMBEDDING_WORKER_URL = "https://recipe-embedding-worker.your-domain.workers.dev"
```

## Queue Population Script

For initial setup or bulk operations, use the populate queue endpoint:

```bash
# Populate queue with all recipes that need embeddings
curl -X POST https://recipe-embedding-worker.your-domain.workers.dev/populate-queue \
  -H "Content-Type: application/json" \
  -d '{"priority": "normal"}'

# Force reprocess all recipes (including those with existing embeddings)
curl -X POST https://recipe-embedding-worker.your-domain.workers.dev/populate-queue \
  -H "Content-Type: application/json" \
  -d '{"forceReprocess": true, "priority": "low"}'
```

## Processing Logic

### Queue Consumer
The worker automatically processes queue messages via the `queue` handler:
- Processes messages in batches
- Handles retries with exponential backoff (max 3 attempts)
- Updates statistics after each batch
- Acknowledges messages to remove them from the queue

### Retry Logic
- Failed recipes are automatically requeued with exponential backoff
- Maximum retry attempts: 3
- Backoff delays: 1s, 2s, 4s (capped at 30s)
- After max attempts, recipes are marked as failed and not retried

### Subrequest Limit Management
- Each recipe processing uses ~4 subrequests
- Cloudflare Queues handle the processing distribution
- No manual subrequest counting needed

## Monitoring and Debugging

### Queue Status
Check queue status anytime:
```bash
curl https://recipe-embedding-worker.your-domain.workers.dev/progress
```

### Queue Statistics
The system provides detailed statistics:
- **Total items** - All items that have been queued
- **Pending** - Items waiting to be processed
- **Processing** - Items currently being processed
- **Completed** - Successfully processed items
- **Failed** - Items that failed after max retries
- **Skipped** - Items skipped (already had embeddings)

### Cloudflare Dashboard
Monitor queue performance in the Cloudflare dashboard:
- Message throughput
- Processing latency
- Error rates
- Queue depth

## Migration from Old System

The old KV-based queue system has been completely replaced. The new system:

1. **Starts with an empty queue** - No existing queue data
2. **Uses `/populate-queue`** - To find all recipes needing embeddings
3. **Processes automatically** - Via Cloudflare Queue consumer
4. **Maintains statistics** - In KV storage for monitoring

## Benefits of Cloudflare Queues

1. **Enterprise Reliability** - 99.9% uptime SLA, automatic failover
2. **Built-in Retries** - Exponential backoff, dead letter queues
3. **Automatic Scaling** - Handles traffic spikes automatically
4. **Message Ordering** - FIFO processing guaranteed
5. **Monitoring** - Built-in metrics and observability
6. **Cost Effective** - Pay only for what you use

## Best Practices

1. **Use populate-queue for bulk operations** - Don't add thousands of recipes individually
2. **Set appropriate priorities** - Use high priority sparingly
3. **Monitor queue depth** - Large backlogs may indicate processing bottlenecks
4. **Handle failures gracefully** - Failed recipes will be retried automatically
5. **Use Cloudflare dashboard** - Monitor queue performance and health

## Troubleshooting

### Queue Not Processing
- Check if messages are being sent to the queue
- Verify worker is running and healthy
- Check Cloudflare dashboard for queue metrics
- Review worker logs for errors

### High Failure Rates
- Check AI service availability
- Verify vector database connectivity
- Review recipe data quality
- Check subrequest limits

### Performance Issues
- Monitor queue depth in Cloudflare dashboard
- Check worker processing latency
- Consider scaling worker instances
- Review retry backoff settings

## Configuration

### Wrangler Configuration
```toml
# Queue consumers must be defined at environment level
[[env.staging.queues.consumers]]
queue = "recipe-embedding-queue-staging"
max_batch_size = 10
max_batch_timeout = 30
max_retries = 3
dead_letter_queue = "recipe-embedding-dlq-staging"

[[env.production.queues.consumers]]
queue = "recipe-embedding-queue-production"
max_batch_size = 10
max_batch_timeout = 30
max_retries = 3
dead_letter_queue = "recipe-embedding-dlq-production"
```

### Environment Variables
```bash
# Required
EMBEDDING_WORKER_URL=https://recipe-embedding-worker.your-domain.workers.dev

# Optional
ENVIRONMENT=production
```

## Deployment

1. **Deploy the worker** with queue configuration
2. **Create the queue** in Cloudflare dashboard (if not auto-created)
3. **Test queue functionality** with a few recipes
4. **Populate the queue** with existing recipes
5. **Monitor processing** via progress endpoint and Cloudflare dashboard

The Cloudflare Queue system provides a robust, scalable foundation for embedding generation that automatically handles the complexities of message processing, retries, and scaling.