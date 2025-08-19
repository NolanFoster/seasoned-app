# Cloudflare Environment Setup for Nutrition Calculator

This document provides detailed instructions for setting up the USDA FoodData Central API key as an environment variable in Cloudflare Workers.

## API Key Information

- **API Key**: `BTC4bopPVhYCMm30a7XtTojgvd3DFQBV86dO9n0K`
- **Environment Variable Name**: `FDC_API_KEY`
- **API Documentation**: https://fdc.nal.usda.gov/api-guide

## Setup Methods

### Method 1: Using Wrangler CLI (Recommended for Development)

1. **Add to wrangler.toml**:
   ```toml
   [vars]
   FDC_API_KEY = "BTC4bopPVhYCMm30a7XtTojgvd3DFQBV86dO9n0K"
   ```

2. **Deploy with environment variable**:
   ```bash
   wrangler deploy
   ```

### Method 2: Using Cloudflare Dashboard (Recommended for Production)

1. **Navigate to Cloudflare Dashboard**:
   - Go to https://dash.cloudflare.com/
   - Select your account
   - Navigate to **Workers & Pages**

2. **Select your Worker**:
   - Click on the Worker where you want to add the nutrition calculator
   - Go to the **Settings** tab

3. **Add Environment Variable**:
   - Scroll down to **Variables and Secrets**
   - Click **Add variable**
   - Set **Variable name**: `FDC_API_KEY`
   - Set **Value**: `BTC4bopPVhYCMm30a7XtTojgvd3DFQBV86dO9n0K`
   - Click **Save**

4. **Deploy Changes**:
   - The environment variable will be available after the next deployment
   - Deploy your Worker to apply the changes

### Method 3: Using Wrangler CLI Commands

```bash
# Set the environment variable for a specific worker
wrangler secret put FDC_API_KEY --name your-worker-name

# When prompted, enter the API key:
# BTC4bopPVhYCMm30a7XtTojgvd3DFQBV86dO9n0K
```

## Environment-Specific Setup

### Development Environment

For local development and testing:

```toml
# wrangler.toml
[env.development]
vars = { FDC_API_KEY = "BTC4bopPVhYCMm30a7XtTojgvd3DFQBV86dO9n0K" }

# Deploy to development
wrangler deploy --env development
```

### Staging Environment

For staging deployment:

```toml
# wrangler.toml
[env.staging]
vars = { FDC_API_KEY = "BTC4bopPVhYCMm30a7XtTojgvd3DFQBV86dO9n0K" }

# Deploy to staging
wrangler deploy --env staging
```

### Production Environment

For production, use the Cloudflare Dashboard method to ensure security:

1. Create a separate production Worker
2. Set the environment variable through the dashboard
3. Deploy production code

## Verification

### Test Environment Variable Access

Add this test endpoint to your Worker to verify the API key is accessible:

```javascript
// Test endpoint
if (pathname === '/test-env' && request.method === 'GET') {
  const hasApiKey = !!env.FDC_API_KEY;
  const keyLength = env.FDC_API_KEY ? env.FDC_API_KEY.length : 0;
  
  return new Response(JSON.stringify({
    hasApiKey,
    keyLength,
    keyPrefix: env.FDC_API_KEY ? env.FDC_API_KEY.substring(0, 8) + '...' : null
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
}
```

### Test Nutrition Calculator

Use this test endpoint to verify the nutrition calculator works:

```javascript
// Test nutrition calculation
if (pathname === '/test-nutrition' && request.method === 'GET') {
  const testIngredients = [
    { name: 'apple', quantity: 1, unit: 'medium' }
  ];
  
  try {
    const result = await calculateNutritionalFacts(testIngredients, env.FDC_API_KEY, 1);
    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
```

## Security Best Practices

1. **Never commit API keys to version control**:
   - Add `wrangler.toml` to `.gitignore` if it contains sensitive data
   - Use environment-specific configuration files

2. **Use Cloudflare Dashboard for production**:
   - Environment variables set through the dashboard are encrypted
   - They don't appear in your code or configuration files

3. **Rotate API keys regularly**:
   - Update the API key in all environments when rotating
   - Test all Workers after key rotation

4. **Monitor API usage**:
   - Track USDA API usage to stay within limits
   - Implement caching to reduce API calls

## Troubleshooting

### Common Issues

1. **"USDA API key not configured" error**:
   - Verify the environment variable name is exactly `FDC_API_KEY`
   - Check that the variable is set in the correct environment
   - Redeploy the Worker after setting the variable

2. **"403 Forbidden" API error**:
   - Verify the API key is correct
   - Check if the API key has expired or been revoked
   - Ensure the API key has proper permissions

3. **Environment variable not accessible**:
   - Make sure you're accessing `env.FDC_API_KEY` in your Worker code
   - Verify the Worker has been deployed after setting the variable
   - Check the environment (development/staging/production) matches

### Debug Commands

```bash
# Check current environment variables (won't show values)
wrangler secret list --name your-worker-name

# View worker logs
wrangler tail --name your-worker-name

# Test deployment
wrangler deploy --dry-run
```

## Example Worker Integration

Here's a complete example of how to use the environment variable in your Worker:

```javascript
import { calculateNutritionalFacts } from '../shared/nutrition-calculator.js';

export default {
  async fetch(request, env, ctx) {
    // Verify API key is available
    if (!env.FDC_API_KEY) {
      return new Response('Nutrition calculator not configured', { status: 503 });
    }

    // Use the nutrition calculator
    const ingredients = [
      { name: 'apple', quantity: 1, unit: 'medium' }
    ];

    try {
      const result = await calculateNutritionalFacts(ingredients, env.FDC_API_KEY, 1);
      return new Response(JSON.stringify(result), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      return new Response(`Error: ${error.message}`, { status: 500 });
    }
  }
};
```

## Support

If you encounter issues with the environment setup:

1. Check the [Cloudflare Workers documentation](https://developers.cloudflare.com/workers/configuration/environment-variables/)
2. Verify the [USDA API documentation](https://fdc.nal.usda.gov/api-guide)
3. Test with the provided example endpoints
4. Check Worker logs for detailed error messages