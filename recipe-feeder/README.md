# Recipe Feeder Worker

A Cloudflare Worker that serves as a producer for the embedding queue. It runs on a cron schedule and feeds recipes from KV storage to the embedding queue for processing.

## Overview

The Recipe Feeder Worker is responsible for:

1. **Scanning KV Storage**: Reads recipe keys from Cloudflare KV storage in batches
2. **Vector Store Checking**: Verifies which recipes already have embeddings in the vector database
3. **Queue Production**: Adds missing recipes to the embedding queue for processing
4. **Automated Processing**: Runs on a cron schedule to continuously feed new recipes

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   KV Storage    │    │  Recipe Feeder   │    │ Embedding Queue │
│   (Recipes)     │───▶│     Worker       │───▶│                 │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                              │                          │
                              ▼                          ▼
                       ┌──────────────────┐    ┌─────────────────┐
                       │ Vector Database  │    │ Embedding Worker│
                       │   (Vectorize)    │    │   (Consumer)    │
                       └──────────────────┘    └─────────────────┘
```

## Features

- **Batch Processing**: Processes recipes in configurable batches (default: 100 recipes)
- **Intelligent Filtering**: Only queues recipes that don't already exist in the vector store
- **Cron Scheduling**: Runs automatically on configurable schedules per environment
- **Error Handling**: Robust error handling with detailed logging and metrics
- **Rate Limiting**: Respects API limits with chunked processing
- **Multiple Environments**: Supports preview, staging, and production configurations

## Configuration

### Environment Variables

- `ENVIRONMENT`: Current environment (development, preview, staging, production)
- `BATCH_SIZE`: Number of recipes to process per batch (default: 100)

### Cron Schedules

- **Production**: Every hour (`0 * * * *`)
- **Staging**: Every 30 minutes (`*/30 * * * *`)
- **Preview**: Every 15 minutes (`*/15 * * * *`)

## API Endpoints

### Health Check
```
GET /
```
Returns service health status and configuration.

### Manual Trigger
```
GET /trigger
```
Manually triggers the feeding process for testing purposes.

### Status
```
GET /status
```
Returns detailed service information and configuration.

## Development

### Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Run locally:
   ```bash
   npm run dev
   ```

3. Run tests:
   ```bash
   npm run test
   ```

4. Run with coverage:
   ```bash
   npm run test:coverage
   ```

### Testing

The worker includes comprehensive test coverage:

- **Unit Tests**: Individual utility functions
- **Integration Tests**: Full worker functionality
- **Mock Data**: Fixtures for consistent testing

### Project Structure

```
recipe-feeder/
├── src/
│   ├── index.js              # Main worker entry point
│   ├── handlers/
│   │   └── feeder-handler.js # Main processing logic
│   ├── utils/
│   │   ├── kv-scanner.js     # KV storage scanning utilities
│   │   ├── vector-checker.js # Vector store checking utilities
│   │   └── queue-producer.js # Queue production utilities
│   └── types/
│       └── index.js          # Type definitions and constants
├── tests/
│   ├── unit/                 # Unit tests
│   ├── integration/          # Integration tests
│   └── fixtures/             # Test fixtures
├── wrangler.toml             # Worker configuration
├── package.json
└── README.md
```

## Deployment

The worker is automatically deployed via Cloudflare's GitHub integration:

- **Main branch** → Production environment
- **Staging branch** → Staging environment  
- **Feature branches** → Preview environment

## Monitoring

### Logs

Use Wrangler to view logs:

```bash
# Production logs
npm run tail:production

# Staging logs
npm run tail:staging

# Preview logs
npm run tail:preview
```

### Metrics

The worker logs detailed metrics for monitoring:

- Recipes scanned
- Recipes already in vector store
- Recipes queued for embedding
- Processing time
- Error counts

### Example Log Output

```
=== Recipe Feeder Cron Job Started at 2024-01-15T10:00:00.000Z ===
Environment: production
Batch size: 100

Starting recipe batch processing: batchSize=100, cursor=none
Step 1: Scanning KV storage for recipe keys...
Found 100 recipes in KV storage
Step 2: Checking vector store for existing recipes...
Vector check complete: 75 exist, 25 missing
Step 3: Queuing 25 missing recipes...
Successfully queued 25 recipes for embedding

✅ Cron job completed successfully in 2341ms
SUMMARY: Processed 100 recipes, queued 25 for embedding, 75 already existed
```

## Error Handling

The worker implements comprehensive error handling:

- **KV Errors**: Graceful handling of storage access issues
- **Vector Store Errors**: Fallback behavior for vector database issues
- **Queue Errors**: Retry logic and error reporting
- **Timeout Protection**: Processing time limits to prevent hanging

## Performance Considerations

- **Batch Size**: Configurable per environment for optimal performance
- **Chunking**: Large batches are processed in smaller chunks
- **Concurrency**: Controlled parallel processing to respect rate limits
- **Time Limits**: Built-in timeouts to ensure cron jobs complete promptly

## Contributing

1. Create feature branch from `staging`
2. Make changes and add tests
3. Ensure all tests pass
4. Create pull request to `staging`

The pre-commit hook will automatically run tests to prevent broken code from being committed.