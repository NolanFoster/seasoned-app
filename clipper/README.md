# Recipe Clipper Worker

A Cloudflare Worker service for extracting recipe information from URLs using AI.

## Overview

The Recipe Clipper Worker is a standalone service that extracts structured recipe data from web pages using GPT and Cloudflare's AI capabilities.

## Features

- Extract recipe data from URLs
- Parse ingredients, instructions, and metadata
- Support for multiple recipe formats
- AI-powered content extraction
- **NEW**: KV storage integration with automatic caching
- **NEW**: Cache management endpoints

## Project Structure

```
clipper/
├── src/
│   └── recipe-clipper.js    # Main worker code
├── tests/
│   ├── test-clipper.js
│   ├── test-recipe-clipper.js
│   ├── test-specific-recipe.js
│   └── demo-allrecipes.js
├── docs/
│   ├── README-clipper.md
│   └── README-ALLRECIPES-TESTING.md
├── wrangler.toml            # Cloudflare Worker configuration
├── package.json             # Project dependencies
├── deploy-clipper.sh        # Deployment script
└── README.md               # This file
```

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Configure your GPT API key:
   ```bash
   wrangler secret put GPT_API_KEY
   ```

## Development

Run the worker locally:
```bash
npm run dev
```

## Testing

Run tests:
```bash
npm test
```

## Deployment

Deploy to Cloudflare Workers:
```bash
npm run deploy
```

Or use the deployment script:
```bash
./deploy-clipper.sh
```

## API Documentation

See `docs/README-clipper.md` for detailed API documentation.

## KV Integration

The clipper now includes KV storage integration for automatic caching. See `KV_INTEGRATION_README.md` for detailed information about the new caching features.

### Quick Start with Caching

1. The clipper automatically caches recipes on first extraction
2. Subsequent requests for the same URL return cached results instantly
3. Use `/cached?url=<recipe-url>` to check if a recipe is cached
4. Use `DELETE /cached?url=<recipe-url>` to clear cache entries

## License

MIT