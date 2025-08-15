#!/bin/bash

# Recipe Clipper Worker Staging Deployment Script
# This script deploys the recipe clipper worker to Cloudflare staging environment

set -e

echo "🚀 Deploying Recipe Clipper Worker to STAGING..."

# Check if wrangler is installed
if ! command -v wrangler &> /dev/null; then
    echo "❌ Wrangler CLI is not installed. Please install it first:"
    echo "   npm install -g wrangler"
    exit 1
fi

# Check if we're in the right directory
if [ ! -f "wrangler-clipper.toml" ]; then
    echo "❌ Please run this script from the worker directory"
    exit 1
fi

# Create staging configuration by adding environment
echo "📝 Creating staging configuration..."
cat > wrangler-clipper-staging.toml << EOF
name = "recipe-clipper-worker-staging"
main = "src/recipe-clipper.js"
compatibility_date = "2024-08-09"

# AI binding for Cloudflare Workers AI
[ai]
binding = "AI"

# Environment variables
[vars]
GPT_API_URL = "https://api.openai.com/v1/chat/completions"
IMAGE_DOMAIN = "https://images.nolanfoster.me"

[observability.logs]
enabled = true

# Staging environment configuration
[env.staging]
name = "recipe-clipper-worker-staging"
EOF

# Check if GPT_API_KEY secret is set for staging
echo "🔑 Checking GPT API key configuration for staging..."
if ! wrangler secret list --config wrangler-clipper-staging.toml --env staging 2>/dev/null | grep -q "GPT_API_KEY"; then
    echo "⚠️  GPT_API_KEY secret not found for staging. Please set it first:"
    echo "   wrangler secret put GPT_API_KEY --config wrangler-clipper-staging.toml --env staging"
    echo ""
    read -p "Would you like to set it now? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        wrangler secret put GPT_API_KEY --config wrangler-clipper-staging.toml --env staging
    else
        echo "❌ Deployment cancelled. Please set the secret and try again."
        exit 1
    fi
fi

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Build and deploy to staging
echo "🏗️  Building and deploying worker to STAGING..."
wrangler deploy --config wrangler-clipper-staging.toml --env staging

# Clean up temporary config
rm -f wrangler-clipper-staging.toml

echo ""
echo "✅ Recipe Clipper Worker deployed to STAGING successfully!"
echo ""
echo "📋 Next steps:"
echo "   1. Test the staging worker with the /clip endpoint"
echo "   2. Monitor the worker logs in Cloudflare dashboard"
echo "   3. Once verified, deploy to production"
echo ""
echo "🔗 Staging Worker URL: https://recipe-clipper-worker-staging.[your-subdomain].workers.dev"
echo "📚 API Documentation: See README-clipper.md for details"