# Recipe Recommendation Worker

A Cloudflare Worker that provides recipe recommendations based on location and date using Cloudflare's Workers AI with the GPT-OSS-20B model.

## Features

- 🌍 Location-based recommendations
- 📅 Seasonal and date-aware suggestions
- 🏷️ Returns categorized recipe tags
- 🤖 Powered by Cloudflare Workers AI (Llama 3.1 8B model)
- 🔄 Fallback to curated mock data when AI is unavailable
- 🔐 No API keys required - uses Cloudflare's AI binding
- 🚀 Deployed on Cloudflare's edge network
- 📊 **Comprehensive observability with structured logging, metrics, and analytics**
- 🔍 **Request tracking with unique IDs for debugging**
- ⚡ **Performance monitoring and error categorization**
- 📈 **Real-time metrics and health monitoring endpoints**
- 💾 **Cloudflare Cache API integration for improved performance**

## API Endpoints

### `POST /recommendations`

Get recipe recommendations based on location and date.

**Request Body:**
```json
{
  "location": "San Francisco, CA",
  "date": "2024-07-15",  // Optional, defaults to current date
  "limit": 3,  // Optional, recipes per category (1-10, default: 3)
  "aiGenerated": 0  // Optional, number of AI-generated recipes (0-10, default: 0)
}
```

**Response:**
```json
{
  "recommendations": {
    "Summer Favorites": ["tomatoes", "corn", "zucchini", "berries"],
    "BBQ & Grilling": ["burgers", "kebabs", "grilled fish"],
    "Refreshing Dishes": ["gazpacho", "ice cream", "cold salads"]
  },
  "location": "San Francisco, CA",
  "date": "2024-07-15",
  "season": "Summer",
  "requestId": "req_123456789_abcdefghi",
  "processingTime": "150ms",
  "cached": true,  // Indicates if response was served from cache
  "cachedAt": "2024-07-15T10:30:00Z"  // When the response was cached
}
```

**Response Headers:**
- `X-Cache`: `HIT` or `MISS` - Indicates cache status
- `Cache-Control`: `public, max-age=3600` - 1 hour cache duration
- `X-Request-ID`: Unique request identifier for tracking

### `GET /health`

Enhanced health check endpoint with service diagnostics.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "requestId": "req_1642248600000_abc123def",
  "services": {
    "ai": "healthy"
  },
  "metrics": {
    "uptime": 1000,
    "totalRequests": 150
  }
}
```

### `GET /metrics`

Real-time metrics endpoint for monitoring and observability.

**Response:**
```json
{
  "timestamp": "2024-01-15T10:30:00.000Z",
  "requestId": "req_1642248600000_abc123def",
  "metrics": {
    "requests_total": {"count": 100},
    "request_duration": {"count": 95, "avg": 131.58, "min": 89, "max": 450},
    "ai_requests": {"count": 85},
    "ai_success": {"count": 80}
  },
  "summary": {
    "totalMetrics": 25,
    "uptime": 3600000
  }
}
```

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Run locally:**
   ```bash
   npm run dev
   ```
   
   Note: The AI binding will be automatically configured by Wrangler.

3. **Deploy:**
   ```bash
   npm run deploy
   ```
   
   The worker will automatically use Cloudflare's Workers AI - no API keys needed!

## Testing

Run the test suite:
```bash
npm test
```

The test suite includes:
- Unit tests for recommendation logic
- API endpoint tests
- Season detection tests
- Mock data validation
- Error handling tests

## Observability

This worker includes comprehensive observability features for production monitoring:

### Key Features
- **Structured JSON logging** with consistent fields across all operations
- **Request tracking** with unique IDs for end-to-end tracing
- **Performance metrics** including AI model response times and parsing duration
- **Error categorization** for better debugging and alerting
- **Cloudflare Analytics integration** for usage patterns and performance analysis
- **Health monitoring** with service status checks
- **Real-time metrics endpoint** for monitoring dashboards

### Monitoring Endpoints
- `GET /health` - Service health with AI binding status
- `GET /metrics` - Real-time performance metrics

### Log Analysis
```bash
# View real-time logs
npm run logs

# Filter error logs
wrangler tail | jq 'select(.level == "error")'

# Monitor AI performance
wrangler tail | jq 'select(.message | contains("AI")) | {requestId, duration, model}'
```

For detailed observability documentation, see [OBSERVABILITY.md](./OBSERVABILITY.md).

## Architecture

The worker uses:
- **Cloudflare Workers AI** with Llama 3.1 8B model for generating contextual recommendations
- **Fallback mock data** for reliability when AI is unavailable
- **Edge deployment** for low latency worldwide
- **Analytics Engine** for metrics collection and analysis
- **No external API dependencies** - runs entirely on Cloudflare's infrastructure

## How It Works

1. Receives a POST request with optional location, date, limit, and aiGenerated parameters
2. Generates a cache key based on request parameters
3. Checks Cloudflare Cache API for existing cached response
4. If cache hit, returns the cached response immediately
5. If cache miss:
   - Determines the season based on the provided date
   - Constructs a prompt with location, date, and seasonal context
   - Calls Cloudflare Workers AI to generate relevant recipe categories and tags
   - Falls back to curated seasonal recommendations if AI fails
   - Caches the successful response for 1 hour
6. Returns structured JSON with categorized recipe tags

## Caching

The worker implements intelligent caching using Cloudflare's Cache API:

- **Cache Key Generation**: Based on location, date, limit, and aiGenerated parameters
- **Cache Duration**: 1 hour (3600 seconds)
- **Cache Headers**: 
  - `X-Cache: HIT/MISS` - Indicates if response was served from cache
  - `Cache-Control: public, max-age=3600` - Browser caching hint
- **Performance Benefits**: Cached responses are served in ~5-10ms vs ~100-500ms for fresh requests
- **Cache Invalidation**: Automatic after 1 hour, or when request parameters change

## Mock Data

When Cloudflare AI is not available, the worker returns curated recommendations based on season:

- **Spring**: Fresh herbs, asparagus, strawberries, salads
- **Summer**: BBQ items, tomatoes, corn, refreshing dishes
- **Fall**: Pumpkin, apples, comfort foods, warm spices
- **Winter**: Citrus, hearty soups, holiday favorites

## Environment Variables

No environment variables required! The worker uses Cloudflare's built-in AI binding.

## Development

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Run tests
npm test

# Deploy to Cloudflare
npm run deploy
```

## License

MIT