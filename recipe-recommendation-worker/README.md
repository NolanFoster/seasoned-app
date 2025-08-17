# Recipe Recommendation Worker

A Cloudflare Worker that provides recipe recommendations based on location and date using OpenAI's language models.

## Features

- 🌍 Location-based recommendations
- 📅 Seasonal and date-aware suggestions
- 🏷️ Returns categorized recipe tags
- 🤖 Powered by OpenAI GPT models
- 🔄 Fallback to curated mock data when API is unavailable
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

2. **Configure OpenAI API Key:**
   
   For local development, create a `.dev.vars` file:
   ```
   OPENAI_API_KEY=your-api-key-here
   ```
   
   For production:
   ```bash
   wrangler secret put OPENAI_API_KEY
   ```

3. **Run locally:**
   ```bash
   npm run dev
   ```

4. **Deploy:**
   ```bash
   npm run deploy
   ```

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
- **OpenAI GPT-3.5-turbo** for generating contextual recommendations
- **Fallback mock data** for reliability when API is unavailable
- **Edge deployment** for low latency worldwide

## How It Works

1. Receives location and date from the client
2. Determines the season based on the date
3. Constructs a prompt with location, date, and seasonal context
4. Calls OpenAI API to generate relevant recipe categories and tags
5. Falls back to curated seasonal recommendations if API fails
6. Returns structured JSON with categorized recipe tags

## Mock Data

When OpenAI API is not available, the worker returns curated recommendations based on season:

- **Spring**: Fresh herbs, asparagus, strawberries, salads
- **Summer**: BBQ items, tomatoes, corn, refreshing dishes
- **Fall**: Pumpkin, apples, comfort foods, warm spices
- **Winter**: Citrus, hearty soups, holiday favorites

## Environment Variables

- `OPENAI_API_KEY`: Your OpenAI API key (required for AI recommendations)

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