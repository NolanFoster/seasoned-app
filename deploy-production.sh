#!/bin/bash

# Deploy all workers to production environment
echo "🚀 Deploying all workers to PRODUCTION environment..."

# Deploy clipped-recipe-db-worker to production
echo "📦 Deploying clipped-recipe-db-worker to production..."
cd clipped-recipe-db-worker
wrangler deploy --env production
cd ..

# Deploy recipe-search-db to production  
echo "🔍 Deploying recipe-search-db to production..."
cd recipe-search-db
wrangler deploy --env production
cd ..

# Deploy recipe-save-worker to production
echo "💾 Deploying recipe-save-worker to production..."
cd recipe-save-worker
wrangler deploy --env production
cd ..

# Deploy clipper to production
echo "✂️ Deploying clipper to production..."
cd clipper
wrangler deploy --env production
cd ..

# Deploy recipe-recommendation-worker to production
echo "🤖 Deploying recipe-recommendation-worker to production..."
cd recipe-recommendation-worker
wrangler deploy --env production
cd ..

# Deploy recipe-view-worker to production
echo "👁️ Deploying recipe-view-worker to production..."
cd recipe-view-worker
wrangler deploy --env production
cd ..

# Deploy frontend to production
echo "🌐 Deploying frontend to production..."
cd frontend
npm run deploy:production
cd ..

echo "✅ All production deployments completed!"
echo ""
echo "Production URLs:"
echo "- Frontend: https://seasoned-frontend.pages.dev (main branch)"
echo "- Main DB Worker: https://recipe-worker.nolanfoster.workers.dev"
echo "- Search DB: https://recipe-search-db.nolanfoster.workers.dev"
echo "- Save Worker: https://recipe-save-worker.nolanfoster.workers.dev"
echo "- Clipper: https://recipe-clipper-worker.nolanfoster.workers.dev"
echo "- Recommendations: https://recipe-recommendation-worker.nolanfoster.workers.dev"
echo "- Recipe View: https://recipe-view-worker.recipesage2.workers.dev"