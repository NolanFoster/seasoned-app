#!/bin/bash

echo "🔧 Setting up staging resources..."

# Create staging D1 databases
echo "📊 Creating staging D1 databases..."

echo "Creating recipe-db-staging..."
cd clipped-recipe-db-worker
wrangler d1 create recipe-db-staging
echo "⚠️  Please update the database_id in clipped-recipe-db-worker/wrangler.toml [env.staging.d1_databases] section"
cd ..

echo "Creating recipe-search-db-staging..."
cd recipe-search-db
wrangler d1 create recipe-search-db-staging
echo "⚠️  Please update the database_id in recipe-search-db/wrangler.toml [env.staging.d1_databases] section"
cd ..

# Create staging R2 buckets
echo "🪣 Creating staging R2 buckets..."

echo "Creating recipe-images-staging bucket..."
wrangler r2 bucket create recipe-images-staging
echo "✅ Created recipe-images-staging R2 bucket"

# Create staging KV namespaces (if needed)
echo "🗄️  Creating staging KV namespaces..."
echo "Note: Currently using preview KV namespace for staging. In production, you may want separate staging KV namespaces."

echo ""
echo "✅ Staging resource setup completed!"
echo ""
echo "📝 Next steps:"
echo "1. Update the database_id values in the wrangler.toml files with the IDs shown above"
echo "2. Run the database migrations for staging:"
echo "   cd clipped-recipe-db-worker && wrangler d1 execute recipe-db-staging --file=schema.sql --env staging"
echo "   cd recipe-search-db && wrangler d1 execute recipe-search-db-staging --file=schema.sql --env staging"
echo "3. Deploy to staging: ./deploy-staging.sh"