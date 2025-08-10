# Environment Variables Setup Guide

This guide explains how to set up environment variables for the Recipe App to avoid hardcoded URLs and sensitive information.

## Overview

The Recipe App has been updated to use environment variables instead of hardcoded URLs and configuration values. This ensures:

- **Security**: No sensitive information is committed to version control
- **Flexibility**: Easy configuration for different environments (dev, staging, production)
- **Maintainability**: Centralized configuration management

## Environment Files

### Worker Directory (`.dev.vars`)

Create a `.dev.vars` file in the `worker/` directory for local development:

```bash
# Copy the example file
cp worker/.dev.vars.example worker/.dev.vars.local

# Edit with your actual values
nano worker/.dev.vars.local
```

**Required Variables:**
```bash
# Image hosting domain
IMAGE_DOMAIN="https://your-image-domain.com"

# GPT API configuration
GPT_API_URL="https://api.openai.com/v1/chat/completions"

# Worker URLs (for local development)
WORKER_URL="http://localhost:8787"
CLIPPER_WORKER_URL="http://localhost:8788"

# Database configuration
DB_NAME="recipe-db"
DB_ID="your-database-id"

# R2 bucket configuration
R2_BUCKET_NAME="recipe-images"
```

### Frontend Directory (`.env.local`)

Create a `.env.local` file in the `frontend/` directory:

```bash
# Copy the example file
cp frontend/.env.example frontend/.env.local

# Edit with your actual values
nano frontend/.env.local
```

**Required Variables:**
```bash
# API URLs
VITE_API_URL=https://your-worker.your-subdomain.workers.dev
VITE_CLIPPER_API_URL=https://your-clipper-worker.your-subdomain.workers.dev

# Image hosting domain
VITE_IMAGE_DOMAIN=https://your-image-domain.com

# Environment
VITE_NODE_ENV=development
```

## Production Deployment

### Cloudflare Workers

For production deployment, set secrets using Wrangler:

```bash
# Set GPT API key as a secret
wrangler secret put GPT_API_KEY

# Set other environment variables in wrangler.toml
# These are already configured in the updated files
```

### Environment-Specific Configuration

You can create environment-specific files:

- `.dev.vars.staging` for staging environment
- `.dev.vars.production` for production environment

Run with specific environment:
```bash
# Staging
wrangler dev --env staging

# Production
wrangler dev --env production
```

## Testing Configuration

Test files now use environment variables for URLs. Update your test environment:

```bash
# Set test URLs
export ALLRECIPES_TEST_URL="https://your-test-recipe-url.com"
export ALLRECIPES_TEST_IMAGE="https://your-test-image-url.com"

# Run tests
npm test
```

## Security Best Practices

1. **Never commit `.env*` files** - They're already in `.gitignore`
2. **Use different values for each environment**
3. **Rotate secrets regularly**
4. **Use least privilege principle** for API keys

## Troubleshooting

### Common Issues

1. **Environment variables not loading**
   - Ensure `.dev.vars` or `.env.local` files exist
   - Check file permissions
   - Restart your development server

2. **Missing environment variables**
   - Check the example files for required variables
   - Ensure all required variables are set

3. **Production deployment issues**
   - Verify secrets are set with `wrangler secret list`
   - Check environment variable bindings in `wrangler.toml`

### Validation

Test your environment setup:

```bash
# Worker
cd worker
npm run dev

# Frontend
cd frontend
npm run dev
```

## File Structure

```
recipe-app/
├── worker/
│   ├── .dev.vars.example          # Example environment variables
│   ├── .dev.vars.local            # Local development variables (not committed)
│   ├── wrangler.toml              # Production configuration
│   └── wrangler-clipper.toml      # Clipper worker configuration
├── frontend/
│   ├── .env.example               # Example environment variables
│   └── .env.local                 # Local development variables (not committed)
└── .gitignore                     # Excludes environment files
```

## Migration Notes

If you're updating from a previous version:

1. **Backup your current configuration**
2. **Update to the new environment variable structure**
3. **Test locally before deploying**
4. **Update your CI/CD pipelines** if applicable

## Support

For issues with environment variable setup:

1. Check the Cloudflare Workers documentation on [Environment Variables](https://developers.cloudflare.com/workers/development-testing/environment-variables/)
2. Verify your `.dev.vars` and `.env.local` files are properly formatted
3. Ensure all required variables are set
4. Check the console for any missing environment variable errors 