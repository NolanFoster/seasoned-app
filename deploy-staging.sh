#!/bin/bash

# Deploy all workers to staging environment
echo "🚀 Deploying all workers to STAGING environment..."

# Deploy clipped-recipe-db-worker to staging
echo "📦 Deploying clipped-recipe-db-worker to staging..."
cd clipped-recipe-db-worker
wrangler deploy --env staging
cd ..

# Deploy recipe-search-db to staging  
echo "🔍 Deploying recipe-search-db to staging..."
cd recipe-search-db
wrangler deploy --env staging
cd ..

# Deploy recipe-save-worker to staging
echo "💾 Deploying recipe-save-worker to staging..."
cd recipe-save-worker
wrangler deploy --env staging
cd ..

# Deploy clipper to staging
echo "✂️ Deploying clipper to staging..."
cd clipper
wrangler deploy --env staging
cd ..

# Deploy recipe-recommendation-worker to staging
echo "🤖 Deploying recipe-recommendation-worker to staging..."
cd recipe-recommendation-worker
wrangler deploy --env staging
cd ..

# Deploy recipe-view-worker to staging
echo "👁️ Deploying recipe-view-worker to staging..."
cd recipe-view-worker
wrangler deploy --env staging
cd ..

# Deploy frontend to staging
echo "🌐 Deploying frontend to staging..."
cd frontend
npm run deploy:staging
cd ..

echo "✅ All staging deployments completed!"
echo ""
echo "Staging URLs:"
echo "- Frontend: https://seasoned-frontend.pages.dev (staging branch)"
echo "- Main DB Worker: https://staging-clipped-recipe-db-worker.nolanfoster.workers.dev"
echo "- Search DB: https://staging-recipe-search-db.nolanfoster.workers.dev"
echo "- Save Worker: https://staging-recipe-save-worker.nolanfoster.workers.dev"
echo "- Clipper: https://staging-clipper.nolanfoster.workers.dev"
echo "- Recommendations: https://staging-recipe-recommendation-worker.nolanfoster.workers.dev"
echo "- Recipe View: https://recipe-view-worker-staging.recipesage2.workers.dev"