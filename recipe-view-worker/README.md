# Recipe View Worker

This worker provides shareable recipe pages with a beautiful full-screen view. It generates standalone HTML pages for individual recipes that can be shared via URL.

## Overview

The Recipe View Worker serves as a web service that:
- Fetches recipe data from the recipe save worker
- Generates beautifully formatted HTML pages for recipes
- Provides shareable URLs for individual recipes
- Supports social media sharing with Open Graph meta tags

## Endpoints

### `GET /`
Returns the API documentation page.

### `GET /recipe/:id`
Returns a full HTML page for the specified recipe ID.

**Parameters:**
- `id` - The recipe ID to display

**Example:**
```
https://recipe-view-worker.recipesage2.workers.dev/recipe/abc123def456
```

## Development

### Prerequisites
- Node.js 18+
- Wrangler CLI

### Setup
```bash
npm install
```

### Run locally
```bash
npm run dev
```

### Run tests
```bash
npm test
```

## Deployment

### Deploy to staging
```bash
wrangler deploy --env staging
```

### Deploy to production
```bash
wrangler deploy --env production
```

## Environment Variables

- `RECIPE_SAVE_WORKER_URL` - The URL of the recipe save worker that provides recipe data

## Architecture

The worker:
1. Receives a GET request with a recipe ID
2. Fetches the recipe data from the recipe save worker
3. Generates a complete HTML page with:
   - Embedded styles for a beautiful full-screen view
   - Recipe title, timing information, ingredients, and instructions
   - Background image (if available)
   - Social media meta tags for sharing
4. Returns the HTML page with appropriate caching headers

## Features

- **Responsive Design**: Works beautifully on all devices
- **Full-Screen View**: Immersive recipe viewing experience
- **Social Sharing**: Open Graph and Twitter Card meta tags
- **Fast Loading**: Cached responses for better performance
- **Error Handling**: Graceful error pages for missing recipes

## Integration

To use this worker in your application, update the share functionality to generate URLs in the format:
```
${RECIPE_VIEW_URL}/recipe/${recipeId}
```

Where `RECIPE_VIEW_URL` is the deployed worker URL.