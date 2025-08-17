# Recipe Recommendation Worker

A Cloudflare Worker that provides recipe recommendations based on location and date using Cloudflare's Workers AI with the GPT-OSS-20B model.

## Features

- 🌍 Location-based recommendations
- 📅 Seasonal and date-aware suggestions
- 🏷️ Returns categorized recipe tags
- 🤖 Powered by Cloudflare Workers AI (GPT-OSS-20B model)
- 🔄 Fallback to curated mock data when AI is unavailable
- 🔐 No API keys required - uses Cloudflare's AI binding
- 🚀 Deployed on Cloudflare's edge network

## API Endpoints

### `POST /recommendations`

Get recipe recommendations based on location and date.

**Request Body:**
```json
{
  "location": "San Francisco, CA",
  "date": "2024-07-15"  // Optional, defaults to current date
}
```

**Response:**
```json
{
  "recommendations": {
    "Seasonal Favorites": ["tomatoes", "corn", "zucchini", "berries"],
    "BBQ & Grilling": ["burgers", "kebabs", "grilled fish"],
    "Refreshing Dishes": ["gazpacho", "ice cream", "cold salads"]
  },
  "location": "San Francisco, CA",
  "date": "2024-07-15",
  "season": "Summer"
}
```

### `GET /health`

Health check endpoint.

**Response:**
```json
{
  "status": "healthy"
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

## Architecture

The worker uses:
- **Cloudflare Workers AI** with GPT-OSS-20B model for generating contextual recommendations
- **Fallback mock data** for reliability when AI is unavailable
- **Edge deployment** for low latency worldwide
- **No external API dependencies** - runs entirely on Cloudflare's infrastructure

## How It Works

1. Receives location and date from the client
2. Determines the season based on the date
3. Constructs a prompt with location, date, and seasonal context
4. Calls Cloudflare Workers AI to generate relevant recipe categories and tags
5. Falls back to curated seasonal recommendations if AI fails
6. Returns structured JSON with categorized recipe tags

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