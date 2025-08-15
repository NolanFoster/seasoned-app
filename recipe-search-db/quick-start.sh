#!/bin/bash

# Quick Start Script for Recipe Search Database
# This script automates the initial setup process

set -e

echo "🚀 Recipe Search Database Quick Start"
echo "====================================="
echo ""

# Check if wrangler is installed
if ! command -v wrangler &> /dev/null; then
    echo "❌ Wrangler CLI is not installed."
    echo "Please install it first: npm install -g wrangler"
    echo ""
    echo "Then run: wrangler login"
    exit 1
fi

# Check if user is logged in to Cloudflare
echo "🔐 Checking Cloudflare authentication..."
if ! wrangler whoami &> /dev/null; then
    echo "❌ Not logged in to Cloudflare. Please run: wrangler login"
    exit 1
fi

echo "✅ Authenticated with Cloudflare"
echo ""

# Create D1 database
echo "🗄️ Creating D1 database..."
DB_OUTPUT=$(wrangler d1 create recipe-search-db 2>&1)
echo "$DB_OUTPUT"

# Extract database ID from output
DB_ID=$(echo "$DB_OUTPUT" | grep -o 'database_id = "[^"]*"' | cut -d'"' -f2)

if [ -z "$DB_ID" ]; then
    echo "❌ Failed to extract database ID from output"
    echo "Please manually create the database and update wrangler.toml"
    exit 1
fi

echo "✅ Database created with ID: $DB_ID"
echo ""

# Update wrangler.toml with database ID
echo "📝 Updating wrangler.toml..."
sed -i.bak "s/# database_id = \"your_actual_d1_database_id_here\"/database_id = \"$DB_ID\"/" wrangler.toml
echo "✅ Updated wrangler.toml with database ID"
echo ""

# Install dependencies
echo "📦 Installing dependencies..."
npm install
echo "✅ Dependencies installed"
echo ""

# Initialize database schema
echo "🗃️ Initializing database schema..."
wrangler d1 execute recipe-search-db --file=./schema.sql
echo "✅ Database schema initialized"
echo ""

# Verify setup
echo "🔍 Verifying setup..."
echo "Checking tables:"
wrangler d1 execute recipe-search-db --command="PRAGMA table_info(nodes);"
echo ""
wrangler d1 execute recipe-search-db --command="PRAGMA table_info(edges);"
echo ""
wrangler d1 execute recipe-search-db --command="PRAGMA table_info(metadata);"
echo ""

echo "🎉 Setup completed successfully!"
echo ""
echo "Next steps:"
echo "1. Start the development server: npm run dev"
echo "2. Test the example: npm run test:example"
echo "3. Run the test suite: npm test"
echo ""
echo "Your database ID is: $DB_ID"
echo "Keep this ID safe for future reference."
echo ""
echo "Happy searching! 🔍"
