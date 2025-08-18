#!/bin/bash

echo "🔧 Complete Staging Environment Setup"
echo "======================================"
echo ""

# Check if wrangler is available
if ! command -v wrangler &> /dev/null; then
    echo "❌ Wrangler CLI not found. Please install it first:"
    echo "   npm install -g wrangler"
    echo "   # or use: cd frontend && npx wrangler"
    echo ""
    exit 1
fi

echo "✅ Wrangler CLI found"
echo ""

# Create staging D1 databases
echo "📊 Creating staging D1 databases..."
echo ""

echo "1. Creating recipe-db-staging..."
STAGING_DB_OUTPUT=$(wrangler d1 create recipe-db-staging 2>&1)
echo "$STAGING_DB_OUTPUT"

# Extract database ID from output
STAGING_DB_ID=$(echo "$STAGING_DB_OUTPUT" | grep -o 'database_id = "[^"]*"' | cut -d'"' -f2)

if [ -n "$STAGING_DB_ID" ]; then
    echo "✅ Staging DB created with ID: $STAGING_DB_ID"
    
    # Update the wrangler.toml file
    echo "📝 Updating clipped-recipe-db-worker/wrangler.toml..."
    sed -i.bak "s/REPLACE_WITH_STAGING_DB_ID/$STAGING_DB_ID/g" clipped-recipe-db-worker/wrangler.toml
    echo "✅ Updated clipped-recipe-db-worker/wrangler.toml"
else
    echo "⚠️  Could not extract staging DB ID. Please update manually:"
    echo "   clipped-recipe-db-worker/wrangler.toml line with REPLACE_WITH_STAGING_DB_ID"
fi

echo ""
echo "2. Creating recipe-search-db-staging..."
STAGING_SEARCH_DB_OUTPUT=$(wrangler d1 create recipe-search-db-staging 2>&1)
echo "$STAGING_SEARCH_DB_OUTPUT"

# Extract database ID from output
STAGING_SEARCH_DB_ID=$(echo "$STAGING_SEARCH_DB_OUTPUT" | grep -o 'database_id = "[^"]*"' | cut -d'"' -f2)

if [ -n "$STAGING_SEARCH_DB_ID" ]; then
    echo "✅ Staging Search DB created with ID: $STAGING_SEARCH_DB_ID"
    
    # Update the wrangler.toml file
    echo "📝 Updating recipe-search-db/wrangler.toml..."
    sed -i.bak "s/REPLACE_WITH_STAGING_SEARCH_DB_ID/$STAGING_SEARCH_DB_ID/g" recipe-search-db/wrangler.toml
    echo "✅ Updated recipe-search-db/wrangler.toml"
else
    echo "⚠️  Could not extract staging search DB ID. Please update manually:"
    echo "   recipe-search-db/wrangler.toml line with REPLACE_WITH_STAGING_SEARCH_DB_ID"
fi

echo ""
echo "🗄️  KV Namespace already configured:"
echo "   ✅ RECIPE_STORAGE_preview: 3f8a3b17db9e4f8ea3eae83d864ad518"

echo ""
echo "🪣 Creating staging R2 bucket (if needed)..."
wrangler r2 bucket create recipe-images-staging 2>/dev/null || echo "   ℹ️  Bucket may already exist"

echo ""
echo "📋 Running database migrations..."
echo ""

echo "3. Migrating recipe-db-staging..."
cd clipped-recipe-db-worker
if [ -f "schema.sql" ]; then
    wrangler d1 execute recipe-db-staging --file=schema.sql --env staging
    echo "✅ Migrated recipe-db-staging"
else
    echo "⚠️  schema.sql not found in clipped-recipe-db-worker/"
fi
cd ..

echo ""
echo "4. Migrating recipe-search-db-staging..."
cd recipe-search-db
if [ -f "schema.sql" ]; then
    wrangler d1 execute recipe-search-db-staging --file=schema.sql --env staging
    echo "✅ Migrated recipe-search-db-staging"
else
    echo "⚠️  schema.sql not found in recipe-search-db/"
fi
cd ..

echo ""
echo "🔍 Validating configuration..."
./validate-environments.sh

echo ""
echo "✅ Staging environment setup complete!"
echo ""
echo "📋 Summary of configured resources:"
echo "   • Staging DB: $STAGING_DB_ID"
echo "   • Staging Search DB: $STAGING_SEARCH_DB_ID"
echo "   • Staging KV: 3f8a3b17db9e4f8ea3eae83d864ad518"
echo "   • Staging R2: recipe-images-staging"
echo ""
echo "🚀 Next steps:"
echo "   1. Deploy to staging: ./deploy-staging.sh"
echo "   2. Deploy to production: ./deploy-production.sh"
echo ""
echo "🔒 Environment isolation is now properly configured!"