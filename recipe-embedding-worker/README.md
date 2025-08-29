# Recipe Embedding Worker

A Cloudflare Worker that generates embeddings for recipes using AI models. This worker runs on a scheduled basis (daily at 2 AM UTC) to process all recipes stored in KV storage and generate vector embeddings for semantic search capabilities.

## Features

- **Scheduled Processing**: Automatically runs daily to process new and updated recipes
- **AI-Powered Embeddings**: Uses Cloudflare's `@cf/baai/bge-small-en-v1.5` model for high-quality embeddings
- **Batch Processing**: Processes recipes in batches to handle large datasets efficiently
- **Duplicate Detection**: Skips recipes that already have embeddings to avoid unnecessary processing
- **Manual Triggering**: Provides HTTP endpoint for manual embedding generation
- **Comprehensive Monitoring**: Includes health checks and detailed processing metrics

## Architecture

### Bindings

- **RECIPE_STORAGE**: KV namespace containing recipe data
- **RECIPE_VECTORS**: Vectorize index for storing embeddings
- **AI**: Cloudflare AI binding for embedding generation

### Scheduled Events

The worker is configured to run daily at 2 AM UTC using cron triggers:
```
crons = ["0 2 * * *"]
```

## API Endpoints

### GET /
Returns worker information and available endpoints.

### GET /health
Health check endpoint that verifies:
- KV storage connectivity
- AI binding availability
- Overall service status

### POST /embed
Manual embedding generation endpoint. Processes all recipes in storage.

Request body (optional):
```json
{
  "scheduled": false
}
```

Response:
```json
{
  "message": "Embedding generation completed",
  "processed": 25,
  "skipped": 5,
  "errors": 0,
  "duration": 12500,
  "details": [...]
}
```

## Embedding Process

1. **Recipe Retrieval**: Fetches all recipe keys from KV storage
2. **Duplicate Check**: Queries Vectorize to check for existing embeddings
3. **Text Generation**: Creates comprehensive text from recipe data including:
   - Recipe name/title
   - Description
   - Ingredients list
   - Instructions
   - Metadata (yield, cook time, keywords)
4. **AI Processing**: Generates embeddings using BGE model
5. **Storage**: Stores embeddings in Vectorize with rich metadata

## Development

### Prerequisites
- Node.js 18+
- Wrangler CLI
- Access to Cloudflare Workers with AI and Vectorize

### Setup
```bash
npm install
```

### Testing
```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test suites
npm run test:unit
npm run test:integration
```

### Development Server
```bash
npm run dev
```

### Deployment
```bash
# Deploy to production
npm run deploy

# Deploy to specific environment
wrangler publish --env staging
```

## Configuration

### Environment Variables
- `ENVIRONMENT`: Current deployment environment (development/staging/production)

### Wrangler Configuration
The worker is configured for multiple environments:
- **Preview**: For PR testing
- **Staging**: For pre-production testing  
- **Production**: For live deployment

Each environment has appropriate KV and Vectorize bindings configured.

## Monitoring

### Health Checks
The `/health` endpoint provides comprehensive service monitoring:
- KV storage connectivity
- AI binding availability
- Service uptime information

### Logging
The worker logs detailed information about:
- Processing progress and batch completion
- Error conditions and recovery
- Performance metrics and timing
- Scheduling and execution status

### Error Handling
- Graceful handling of AI service failures
- Retry logic for transient errors
- Detailed error reporting and logging
- Continued processing despite individual recipe failures

## Performance

### Batch Processing
- Configurable batch sizes (5 for manual, 10 for scheduled)
- Delay between batches to prevent overwhelming services
- Memory-efficient processing of large recipe collections

### Optimization
- Text truncation to reasonable limits (8000 characters)
- Duplicate detection to avoid reprocessing
- Minimal metadata storage for faster queries

## Security

- CORS headers configured for cross-origin requests
- Input validation and sanitization
- Error message sanitization to prevent information disclosure
- Secure handling of environment variables and bindings
