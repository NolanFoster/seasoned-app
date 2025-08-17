# Recipe Clipper Setup Guide

The recipe clipping feature requires the clipper worker service to be running. This guide will help you set it up.

## Quick Start

### Option 1: Run Locally for Development

1. Navigate to the clipper directory:
   ```bash
   cd clipper
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Run the clipper worker locally:
   ```bash
   npm run dev
   ```

4. Update your frontend `.env` file (create if doesn't exist):
   ```
   VITE_CLIPPER_API_URL=http://localhost:8787
   ```

5. Restart your frontend development server

### Option 2: Deploy to Cloudflare Workers

1. Navigate to the clipper directory:
   ```bash
   cd clipper
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Login to Cloudflare (if not already):
   ```bash
   npx wrangler login
   ```

4. Set the required secret (GPT API key):
   ```bash
   npx wrangler secret put GPT_API_KEY
   ```

5. Deploy the worker:
   ```bash
   npm run deploy
   ```

6. The deployment will provide you with a URL. Update your frontend environment if needed.

## Troubleshooting

### Clipper Service Not Available

If you see "Recipe clipping service is currently unavailable" when trying to clip URLs:

1. Check if the clipper worker is running (locally or deployed)
2. Verify the `VITE_CLIPPER_API_URL` in your frontend environment matches your clipper URL
3. Check the browser console for any CORS or network errors
4. Ensure the GPT_API_KEY is properly set if using AI extraction

### Health Check Failed

The frontend checks the clipper health on startup. If it fails:

1. Verify the clipper is running at the expected URL
2. Try accessing the health endpoint directly: `{CLIPPER_URL}/health`
3. Check for any deployment errors in the Cloudflare dashboard

## Features

When the clipper is properly set up, you can:

- Paste recipe URLs in the search bar to automatically clip them
- The search bar will show a scissor icon when a valid URL is detected
- Clipped recipes are cached for faster subsequent access
- AI extraction provides structured recipe data from various websites