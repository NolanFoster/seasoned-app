#!/bin/bash

echo "🚀 Starting Recipe Clipper Worker in Local Development Mode"
echo "This will start the worker on http://localhost:8787"
echo ""

# Check if wrangler is installed
if ! command -v wrangler &> /dev/null; then
    echo "❌ Wrangler is not installed. Please install it first:"
    echo "npm install -g wrangler"
    exit 1
fi

# Check if we're in the right directory
if [ ! -f "wrangler-clipper.toml" ]; then
    echo "❌ Please run this script from the clipped-recipe-db-worker directory"
    exit 1
fi

echo "✅ Starting worker with wrangler-clipper.toml configuration..."
echo "📝 Note: You'll need to set up your AI binding for full functionality"
echo ""

# Start the worker in development mode
wrangler dev --config wrangler-clipper.toml --port 8787 