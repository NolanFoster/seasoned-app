#!/bin/bash

# Seasoned Recipe App Documentation Deployment Script
# This script helps deploy the documentation to Cloudflare Pages

set -e

echo "🍳 Seasoned Recipe App Documentation Deployment"
echo "================================================"

# Check if wrangler is installed
if ! command -v wrangler &> /dev/null; then
    echo "❌ Wrangler CLI not found. Installing..."
    npm install -g wrangler
fi

# Check if user is logged in
if ! wrangler whoami &> /dev/null; then
    echo "🔐 Please log in to Cloudflare..."
    wrangler login
fi

# Get project name
read -p "Enter your Cloudflare Pages project name (or press Enter for 'seasoned-docs'): " PROJECT_NAME
PROJECT_NAME=${PROJECT_NAME:-seasoned-docs}

echo "🚀 Deploying documentation to Cloudflare Pages..."
echo "Project: $PROJECT_NAME"

# Deploy to Cloudflare Pages
wrangler pages deploy . --project-name="$PROJECT_NAME"

echo ""
echo "✅ Deployment complete!"
echo "Your documentation should be available at: https://$PROJECT_NAME.pages.dev"
echo ""
echo "📚 Documentation features:"
echo "  - Responsive design for all devices"
echo "  - Interactive search functionality"
echo "  - Code copying with syntax highlighting"
echo "  - Mobile-optimized navigation"
echo "  - SEO-friendly structure"
echo ""
echo "🔧 To update the documentation:"
echo "  1. Make your changes to the files"
echo "  2. Run this script again: ./deploy.sh"
echo ""
echo "🌐 Or use the Cloudflare Dashboard:"
echo "  https://dash.cloudflare.com/pages"
