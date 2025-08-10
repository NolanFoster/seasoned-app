#!/bin/bash

# Recipe Clipper Worker Deployment Script
# This script deploys the recipe clipper worker to Cloudflare

set -e

echo "🚀 Deploying Recipe Clipper Worker..."

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

# Check if GPT_API_KEY secret is set
echo "🔑 Checking GPT API key configuration..."
if ! wrangler secret list --config wrangler-clipper.toml | grep -q "GPT_API_KEY"; then
    echo "⚠️  GPT_API_KEY secret not found. Please set it first:"
    echo "   wrangler secret put GPT_API_KEY --config wrangler-clipper.toml"
    echo ""
    read -p "Would you like to set it now? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        wrangler secret put GPT_API_KEY --config wrangler-clipper.toml
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

# Build and deploy
echo "🏗️  Building and deploying worker..."
wrangler deploy --config wrangler-clipper.toml

echo ""
echo "✅ Recipe Clipper Worker deployed successfully!"
echo ""
echo "📋 Next steps:"
echo "   1. Update your frontend to use the new worker URL"
echo "   2. Test the /clip endpoint with a recipe URL"
echo "   3. Monitor the worker logs in Cloudflare dashboard"
echo ""
echo "🔗 Worker URL: https://recipe-clipper-worker.[your-subdomain].workers.dev"
echo "📚 API Documentation: See README-clipper.md for details" 