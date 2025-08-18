# Staging Environment Setup

## Problem Solved

**Issue**: Staging environment was showing production database results because there was no proper staging environment configuration. Workers were either using production resources or preview resources, leading to data inconsistency.

**Solution**: Created dedicated staging environments for all workers with separate database instances and proper environment isolation.

## Staging Environment Architecture

### Before (❌ Problem)
- No dedicated staging environments in wrangler.toml files
- Staging deployments used production databases
- Frontend had hardcoded production URLs as fallbacks
- No environment separation between staging and production

### After (✅ Solution)
- Dedicated `[env.staging]` configurations in all wrangler.toml files
- Separate staging databases and resources
- Frontend uses staging-specific API endpoints
- Clear environment separation

## Setup Instructions

### 1. Create Staging Resources

Run the setup script to create staging databases and buckets:

```bash
./setup-staging-resources.sh
```

This will create:
- `recipe-db-staging` D1 database
- `recipe-search-db-staging` D1 database  
- `recipe-images-staging` R2 bucket

### 2. Update Database IDs

After creating the databases, update the `database_id` values in the wrangler.toml files:

**clipped-recipe-db-worker/wrangler.toml**:
```toml
[env.staging.d1_databases]
database_id = "your-new-staging-db-id-here"
```

**recipe-search-db/wrangler.toml**:
```toml
[env.staging.d1_databases]
database_id = "your-new-staging-search-db-id-here"
```

### 3. Run Database Migrations

Apply the database schema to staging databases:

```bash
cd clipped-recipe-db-worker
wrangler d1 execute recipe-db-staging --file=schema.sql --env staging

cd ../recipe-search-db  
wrangler d1 execute recipe-search-db-staging --file=schema.sql --env staging
```

### 4. Deploy to Staging

Deploy all workers and frontend to staging:

```bash
./deploy-staging.sh
```

## Environment Configuration

### Workers

Each worker now has three environments:
- **Default**: Development/local testing
- **Preview**: Preview deployments (`wrangler deploy --env preview`)
- **Staging**: Staging environment (`wrangler deploy --env staging`)
- **Production**: Production environment (`wrangler deploy --env production`)

### Frontend

The frontend uses environment-specific configuration:

**Production** (`.env.local` or fallback):
```
VITE_API_URL=https://recipe-scraper.nolanfoster.workers.dev
VITE_CLIPPER_API_URL=https://recipe-clipper-worker.nolanfoster.workers.dev
VITE_SEARCH_DB_URL=https://recipe-search-db.nolanfoster.workers.dev
VITE_SAVE_WORKER_URL=https://recipe-save-worker.nolanfoster.workers.dev
```

**Staging** (`.env.staging`):
```
VITE_API_URL=https://staging-recipe-scraper.nolanfoster.workers.dev
VITE_CLIPPER_API_URL=https://staging-clipper.nolanfoster.workers.dev
VITE_SEARCH_DB_URL=https://staging-recipe-search-db.nolanfoster.workers.dev
VITE_SAVE_WORKER_URL=https://staging-recipe-save-worker.nolanfoster.workers.dev
```

## Deployment Workflow

### 1. Development
```bash
# Work on feature branches
git checkout -b feature/new-feature

# Test locally
cd clipped-recipe-db-worker
wrangler dev

cd ../frontend
npm run dev
```

### 2. Staging Deployment
```bash
# Deploy to staging for testing
./deploy-staging.sh

# Or deploy individual workers
cd clipped-recipe-db-worker
wrangler deploy --env staging
```

### 3. Production Deployment
```bash
# After staging validation, deploy to production
cd clipped-recipe-db-worker
wrangler deploy --env production

cd ../frontend
npm run deploy:prod
```

## Staging URLs

After deployment, your staging environment will be available at:

- **Frontend**: `https://seasoned-frontend.pages.dev` (staging branch)
- **Main DB Worker**: `https://staging-clipped-recipe-db-worker.nolanfoster.workers.dev`
- **Search DB**: `https://staging-recipe-search-db.nolanfoster.workers.dev`
- **Save Worker**: `https://staging-recipe-save-worker.nolanfoster.workers.dev`
- **Clipper**: `https://staging-clipper.nolanfoster.workers.dev`
- **Recommendations**: `https://staging-recipe-recommendation-worker.nolanfoster.workers.dev`

## Database Isolation

### Production Databases
- `recipe-db` (ID: 2b6e049b-bdfa-4291-be54-082c0d12146f)
- `recipe-search-db` (ID: 69a59404-ca73-4760-bb87-0ac910752ca9)

### Staging Databases
- `recipe-db-staging` (ID: to be created)
- `recipe-search-db-staging` (ID: to be created)

### KV Namespaces
- **Production**: `dd001c20659a4d6982f6d650abcac880`
- **Staging/Preview**: `3f8a3b17db9e4f8ea3eae83d864ad518`

## Troubleshooting

### Staging Shows Production Data
- Verify you're using the correct environment: `wrangler deploy --env staging`
- Check that staging databases were created and IDs updated in wrangler.toml
- Ensure frontend is using staging environment variables

### Database Migration Issues
```bash
# Check if staging database exists
wrangler d1 list

# Verify schema was applied
wrangler d1 execute recipe-db-staging --command="SELECT name FROM sqlite_master WHERE type='table';" --env staging
```

### Frontend Not Connecting to Staging APIs
- Verify `.env.staging` is being used during staging deployment
- Check that staging workers are deployed and accessible
- Verify API URLs in browser network tab

## Next Steps

1. **Run the setup**: `./setup-staging-resources.sh`
2. **Update database IDs** in wrangler.toml files
3. **Run migrations** for staging databases
4. **Deploy to staging**: `./deploy-staging.sh`
5. **Test staging environment** thoroughly
6. **Update CI/CD** to use staging environment for automated testing

This setup ensures complete isolation between staging and production environments, preventing data leakage and providing a safe testing environment.