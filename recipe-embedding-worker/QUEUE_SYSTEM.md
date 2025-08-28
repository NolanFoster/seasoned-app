# Embedding Queue System

The recipe embedding worker has been refactored to use a queue-based system instead of batch processing. This provides better scalability, real-time processing, and more efficient resource management.

## Overview

The queue system ensures that:
- **All KV values eventually get processed** - No recipes are missed
- **50 AI call limit is respected** - Processing stops gracefully when approaching limits
- **Progress persists across worker runs** - Queue state is maintained in KV storage
- **Real-time processing** - New recipes can be added immediately when saved
- **Automatic retries** - Failed recipes are retried in subsequent runs

## Architecture

### Queue Storage
The queue is stored in KV storage using these keys:
- `embedding_queue` - The main queue containing recipe processing items
- `embedding_queue_stats` - Statistics about queue status
- `embedding_processing_status` - Processing state information

### Queue Item Structure
Each queue item contains:
```json
{
  "recipeId": "unique_recipe_id",
  "priority": "high|normal|low",
  "status": "pending|processing|completed|failed|skipped",
  "addedAt": 1234567890,
  "attempts": 0,
  "lastAttempt": null,
  "error": null,
  "completedAt": null
}
```

### Priority System
- **High priority** - Processed first (e.g., user-requested recipes)
- **Normal priority** - Standard processing order
- **Low priority** - Processed last (e.g., bulk imports)

## API Endpoints

### 1. Process Embeddings
**POST** `/embed`
Processes recipes from the queue, respecting subrequest limits.

**Request Body:**
```json
{
  "scheduled": true
}
```

**Response:**
```json
{
  "message": "Embedding generation completed",
  "processed": 5,
  "skipped": 2,
  "errors": 1,
  "queueStats": {
    "total": 100,
    "pending": 92,
    "processing": 0,
    "completed": 5,
    "failed": 1,
    "skipped": 2
  }
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
    "status": "running",
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
    "lastUpdated": 1234567890
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
  "queueLength": 151
}
```

### 5. Reset Queue
**DELETE** `/reset`
Clears the entire embedding queue and resets statistics.

**Response:**
```json
{
  "status": "success",
  "message": "Embedding queue reset successfully"
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

### Subrequest Limit Handling
The system processes recipes one at a time, tracking subrequests:
- KV get: 1 subrequest
- Vectorize query: 1 subrequest  
- AI embedding: 1 subrequest
- Vectorize upsert: 1 subrequest

**Total per recipe: 4 subrequests**
**Safe limit: 45 subrequests (leaving buffer for 50 max)**

### Retry Logic
- Failed recipes are marked with `failed` status
- Failed recipes are prioritized in subsequent runs
- Maximum attempts are tracked (though no hard limit is enforced)

### Cleanup
- Completed and skipped items are kept for 24 hours for monitoring
- Old items are automatically cleaned up during processing

## Monitoring and Debugging

### Queue Status
Check queue status anytime:
```bash
curl https://recipe-embedding-worker.your-domain.workers.dev/progress
```

### Queue Statistics
The system provides detailed statistics:
- **Total items** - All items in queue
- **Pending** - Items waiting to be processed
- **Processing** - Items currently being processed
- **Completed** - Successfully processed items
- **Failed** - Items that failed and need retry
- **Skipped** - Items skipped (already had embeddings)

### Logs
The worker logs detailed information about:
- Queue population
- Processing progress
- Subrequest usage
- Error conditions
- Cleanup operations

## Migration from Old System

The old progress tracking system has been completely replaced. If you have existing progress data, it will be ignored. The new system will:

1. Start with an empty queue
2. Use `/populate-queue` to find all recipes needing embeddings
3. Process them through the new queue system

## Benefits

1. **Scalability** - Multiple workers can process from the same queue
2. **Real-time** - New recipes are processed immediately
3. **Efficient** - No duplicate processing or missed recipes
4. **Resilient** - Failed recipes are automatically retried
5. **Transparent** - Clear visibility into processing status
6. **Flexible** - Priority system for different use cases

## Best Practices

1. **Use populate-queue for bulk operations** - Don't add thousands of recipes individually
2. **Monitor queue size** - Large queues may indicate processing bottlenecks
3. **Set appropriate priorities** - Use high priority sparingly
4. **Handle failures gracefully** - Failed recipes will be retried automatically
5. **Clean up periodically** - Use reset endpoint if queue gets corrupted

## Troubleshooting

### Queue Not Processing
- Check if items are in `pending` status
- Verify subrequest limits aren't being hit
- Check worker logs for errors

### Duplicate Items
- Use `forceReprocess: false` when populating queue
- Check if recipes already have embeddings before adding

### Performance Issues
- Monitor subrequest usage
- Consider reducing batch sizes
- Check for stuck `processing` items