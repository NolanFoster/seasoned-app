# Recipe Embedding Worker

A **pure Cloudflare Queue consumer worker** for processing recipe embeddings automatically. This worker is designed to consume messages from a Cloudflare Queue and generate embeddings for recipes using Cloudflare AI.

## Architecture

This worker follows a **pure consumer pattern** where:

- **Primary Function**: Processes messages from Cloudflare Queue
- **Secondary Function**: Provides minimal HTTP API for monitoring and manual operations
- **No Batch Processing**: All processing is driven by queue messages

## Handler Structure

The worker is organized into focused, single-responsibility handlers:

### 📁 `src/handlers/`

- **`queue-handler.js`** - Core queue operations and message processing
- **`recipe-handler.js`** - Recipe processing and embedding generation
- **`embedding-utils.js`** - AI embedding generation and vector storage
- **`progress-handler.js`** - Progress tracking and statistics
- **`populate-handler.js`** - Bulk queue population operations
- **`kv-utils.js`** - KV storage utilities and data handling
- **`root-handler.js`** - Root endpoint and basic info
- **`health-handler.js`** - Health check endpoint

## Key Features

### 🚀 **Pure Queue Consumer**
- Automatically processes messages from Cloudflare Queue
- No manual batch processing or scheduling
- Built-in retry logic with exponential backoff
- Automatic message acknowledgment

### 🔄 **Message Processing**
- Processes `recipe_embedding` message types
- Handles recipe data retrieval and validation
- Generates embeddings using Cloudflare AI
- Stores results in Vectorize database
- Updates processing statistics

### 📊 **Monitoring & Control**
- `/progress` - Queue statistics and status
- `/reset` - Reset queue statistics
- `/populate-queue` - Bulk queue population
- `/queue/add` - Add individual recipes to queue
- `/embed` - Manual processing trigger (for testing)

### 🛡️ **Error Handling**
- Graceful error handling at multiple levels
- Automatic retry with exponential backoff
- Failed message acknowledgment
- Comprehensive error logging

## Queue Message Format

```json
{
  "type": "recipe_embedding",
  "recipeId": "unique_recipe_id",
  "priority": "high|normal|low",
  "timestamp": 1234567890,
  "attempts": 0
}
```

## Processing Flow

1. **Message Reception** - Worker receives messages from Cloudflare Queue
2. **Recipe Retrieval** - Fetches recipe data from KV storage
3. **Embedding Check** - Verifies if embedding already exists
4. **Text Generation** - Creates embedding text from recipe data
5. **AI Processing** - Generates embedding using Cloudflare AI
6. **Storage** - Stores embedding in Vectorize database
7. **Statistics Update** - Updates processing statistics
8. **Message Acknowledgment** - Removes message from queue

## Environment Configuration

### Required Bindings
- **`AI`** - Cloudflare AI binding for embedding generation
- **`EMBEDDING_QUEUE`** - Cloudflare Queue for message processing
- **`RECIPE_STORAGE`** - KV namespace for recipe data
- **`RECIPE_VECTORS`** - Vectorize index for embeddings

### Environment Variables
- **`ENVIRONMENT`** - Deployment environment (development/staging/production)
- **`WORKER_TYPE`** - Set to "queue-consumer"

## Deployment

### 1. Deploy Worker
```bash
wrangler deploy
```

### 2. Create Queue (if not auto-created)
The Cloudflare Queue will be created automatically on first deployment.

### 3. Test Functionality
```bash
# Test health endpoint
curl https://your-worker.workers.dev/health

# Test queue population
curl -X POST https://your-worker.workers.dev/populate-queue \
  -H "Content-Type: application/json" \
  -d '{"priority": "normal"}'
```

### 4. Monitor Processing
```bash
# Check progress
curl https://your-worker.workers.dev/progress
```

## Integration

### Adding Recipes to Queue
Other workers can add recipes to the embedding queue:

```javascript
import { addRecipeToEmbeddingQueue } from '../shared/kv-storage.js';

// After saving a recipe
await addRecipeToEmbeddingQueue(env, recipeId, 'normal');
```

### Queue Population
For bulk operations or initial setup:

```bash
curl -X POST https://your-worker.workers.dev/populate-queue \
  -H "Content-Type: application/json" \
  -d '{"forceReprocess": false, "priority": "normal"}'
```

## Monitoring

### Cloudflare Dashboard
- Monitor queue depth and processing rates
- View error rates and retry statistics
- Track worker performance metrics

### Worker Logs
- Detailed processing logs for each recipe
- Error tracking and debugging information
- Performance metrics and timing data

### Health Checks
- `/health` endpoint for basic worker status
- `/progress` endpoint for queue statistics
- Automatic monitoring via scheduled cron jobs

## Best Practices

### 1. **Queue Management**
- Use appropriate priorities (high for user requests, normal for bulk)
- Monitor queue depth to prevent backlogs
- Use bulk population for large datasets

### 2. **Error Handling**
- Failed recipes are automatically retried
- Maximum 3 retry attempts with exponential backoff
- Monitor failure rates for system health

### 3. **Performance**
- Worker automatically scales based on queue depth
- No manual subrequest counting needed
- Cloudflare Queues handle message distribution

### 4. **Monitoring**
- Regular health checks via `/health`
- Monitor queue statistics via `/progress`
- Use Cloudflare dashboard for detailed metrics

## Troubleshooting

### Common Issues

1. **Queue Not Processing**
   - Check if messages are being sent to queue
   - Verify worker is running and healthy
   - Check Cloudflare dashboard for queue metrics

2. **High Failure Rates**
   - Check AI service availability
   - Verify vector database connectivity
   - Review recipe data quality

3. **Performance Issues**
   - Monitor queue depth in Cloudflare dashboard
   - Check worker processing latency
   - Consider scaling worker instances

### Debug Endpoints

- **`/health`** - Basic worker status
- **`/progress`** - Current queue statistics
- **`/embed`** - Manual processing trigger (for testing)

## Development

### Running Tests
```bash
npm test
```

### Local Development
```bash
wrangler dev
```

### Testing Queue Processing
```bash
# Add test recipe to queue
curl -X POST https://your-worker.workers.dev/queue/add \
  -H "Content-Type: application/json" \
  -d '{"recipeId": "test-recipe", "priority": "high"}'
```

## Architecture Benefits

1. **Separation of Concerns** - Each handler has a single responsibility
2. **Maintainability** - Easy to modify individual components
3. **Testability** - Each handler can be tested independently
4. **Scalability** - Pure consumer pattern scales automatically
5. **Reliability** - Cloudflare Queues provide enterprise-grade reliability
6. **Monitoring** - Built-in observability and metrics

This worker represents a modern, scalable approach to embedding generation that leverages Cloudflare's infrastructure for optimal performance and reliability.
