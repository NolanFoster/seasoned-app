# Recipe Clipper Worker

A Cloudflare Worker that extracts recipes from URLs using the GPT-OSS-20B model for intelligent recipe parsing.

## Features

- **AI-Powered Extraction**: Uses GPT-OSS-20B to intelligently parse recipe content from any webpage
- **Smart Content Cleaning**: Automatically removes navigation, ads, and other non-recipe content
- **Structured Output**: Returns clean, structured recipe data in JSON format
- **CORS Support**: Built-in CORS headers for frontend integration
- **Error Handling**: Comprehensive error handling and logging

## Setup

### 1. Install Dependencies

```bash
cd worker
npm install
```

### 2. Configure Environment Variables

Set your GPT API key as a secret:

```bash
wrangler secret put GPT_API_KEY --config wrangler-clipper.toml
```

When prompted, enter your OpenAI API key.

### 3. Deploy the Worker

```bash
npm run deploy
```

Or for development:

```bash
npm run dev
```

## API Endpoints

### POST /clip

Extract a recipe from a URL.

**Request Body:**
```json
{
  "url": "https://example.com/recipe-page"
}
```

**Response:**
```json
{
  "name": "Chocolate Chip Cookies",
  "description": "Classic homemade chocolate chip cookies",
  "ingredients": [
    "2 1/4 cups all-purpose flour",
    "1 cup butter, softened",
    "3/4 cup granulated sugar"
  ],
  "instructions": [
    "Preheat oven to 375°F",
    "Cream together butter and sugars",
    "Mix in eggs and vanilla"
  ],
  "image_url": "https://example.com/cookie-image.jpg",
  "source_url": "https://example.com/recipe-page",
  "prep_time": "15 minutes",
  "cook_time": "10 minutes",
  "servings": "24 cookies",
  "difficulty": "easy"
}
```

### GET /health

Health check endpoint.

**Response:**
```json
{
  "status": "healthy",
  "service": "recipe-clipper"
}
```

## How It Works

1. **URL Fetching**: The worker fetches the webpage content from the provided URL
2. **Content Cleaning**: HTML content is cleaned by removing scripts, styles, navigation, and other non-recipe elements
3. **AI Processing**: The cleaned content is sent to GPT-OSS-20B with a specialized prompt for recipe extraction
4. **Data Validation**: The AI response is parsed and validated to ensure it contains complete recipe information
5. **Structured Output**: Clean, structured recipe data is returned to the client

## Configuration

The worker uses the following environment variables:

- `GPT_API_KEY`: Your OpenAI API key (set as a secret)
- `GPT_API_URL`: The OpenAI API endpoint (defaults to v1/chat/completions)

## Error Handling

The worker handles various error scenarios:

- Invalid URLs
- Network errors when fetching webpages
- GPT API errors
- Malformed responses from the AI model
- Missing or incomplete recipe data

## Development

### Local Development

```bash
npm run dev
```

This will start the worker locally for testing.

### Testing

You can test the worker locally by sending requests to the development endpoint:

```bash
curl -X POST http://localhost:8787/clip \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com/recipe-page"}'
```

## Deployment

### Production Deployment

```bash
npm run deploy
```

### Environment-Specific Configuration

You can create different wrangler configuration files for different environments:

- `wrangler-clipper.toml` - Development
- `wrangler-clipper-prod.toml` - Production

## Security Considerations

- API keys are stored as secrets and not exposed in the code
- CORS is configured to allow cross-origin requests
- Input validation is performed on all incoming requests
- HTML content is sanitized before processing

## Troubleshooting

### Common Issues

1. **Missing API Key**: Ensure `GPT_API_KEY` is set as a secret
2. **CORS Errors**: Check that the frontend origin is properly configured
3. **Rate Limiting**: Monitor OpenAI API usage and rate limits
4. **Content Extraction Failures**: Some websites may block automated requests

### Logs

Check Cloudflare Worker logs in the dashboard for debugging information.

## License

MIT License - see LICENSE file for details. 