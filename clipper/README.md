# Recipe Clipper Worker

A Cloudflare Worker service for extracting recipe information from URLs using AI.

## Overview

The Recipe Clipper Worker is a standalone service that extracts structured recipe data from web pages using GPT and Cloudflare's AI capabilities.

## Features

- Extract recipe data from URLs
- Parse ingredients, instructions, and metadata
- Support for multiple recipe formats
- AI-powered content extraction

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

## License

MIT