# Preview Deployments

This document describes the preview deployment system for the Seasoned Recipe Manager project.

## Overview

When you create a pull request targeting the `main` or `staging` branches, the system automatically deploys preview versions of both the frontend and all backend workers. This allows you to test your changes in an isolated environment before merging.

## How It Works

### 1. Preview Workers

Each worker service has a corresponding preview configuration file:
- `recipe-scraper/wrangler.preview.toml` → Deploys as `recipe-scraper-preview`
- `clipper/wrangler.preview.toml` → Deploys as `recipe-clipper-worker-preview`
- `recipe-search-db/wrangler.preview.toml` → Deploys as `recipe-search-db-preview`
- `clipped-recipe-db-worker/wrangler.preview.toml` → Deploys as `recipe-worker-preview`

These preview workers:
- Use separate KV namespaces (preview_id)
- Have `-preview` suffix in their names
- Use preview database instances where applicable
- Are isolated from production data

### 2. Preview Frontend

The frontend is built with environment variables pointing to the preview worker URLs:
- `VITE_API_URL` → Points to preview recipe-scraper
- `VITE_CLIPPER_API_URL` → Points to preview clipper
- `VITE_SEARCH_DB_URL` → Points to preview search-db

The frontend preview is deployed to:
```
https://preview-{PR_NUMBER}.seasoned-frontend.pages.dev
```

### 3. Automatic Cleanup

When a pull request is closed (merged or cancelled), all preview deployments are automatically cleaned up.

## GitHub Actions Workflows

### deploy-preview.yml
- Triggered on PR open/sync/reopen
- Deploys all preview workers first
- Then builds and deploys frontend with preview URLs
- Posts a comment with all preview URLs

### cleanup-preview.yml
- Triggered on PR close
- Deletes all preview worker deployments
- Posts a cleanup confirmation comment

### deploy.yml (Production)
- Modified to explicitly set production worker URLs
- Ensures production always uses production workers

## Environment Variables

### Preview Environment
- Recipe Scraper: `https://recipe-scraper-preview.nolanfoster.workers.dev`
- Clipper: `https://recipe-clipper-worker-preview.nolanfoster.workers.dev`
- Search DB: `https://recipe-search-db-preview.nolanfoster.workers.dev`

### Production Environment
- Recipe Scraper: `https://recipe-scraper.nolanfoster.workers.dev`
- Clipper: `https://recipe-clipper-worker.nolanfoster.workers.dev`
- Search DB: `https://recipe-search-db.nolanfoster.workers.dev`

## Benefits

1. **Isolated Testing**: Each PR gets its own set of workers and data
2. **No Production Impact**: Preview deployments don't affect production data
3. **Easy Review**: Reviewers can test changes without local setup
4. **Automatic Management**: No manual deployment or cleanup needed

## Local Development

For local development, you can still override the worker URLs using environment variables:

```bash
cd frontend
VITE_API_URL=http://localhost:8787 \
VITE_CLIPPER_API_URL=http://localhost:8788 \
VITE_SEARCH_DB_URL=http://localhost:8789 \
npm run dev
```

## Troubleshooting

### Preview deployment failed
- Check the GitHub Actions logs for specific errors
- Ensure all required secrets are set in the repository
- Verify wrangler.preview.toml files are correctly formatted

### Preview URLs not working
- Wait a few minutes for Cloudflare to propagate changes
- Check if workers were successfully deployed in the Actions log
- Verify the preview comment was posted with correct URLs

### Data not showing in preview
- Preview environments use separate KV namespaces
- You may need to populate test data in the preview environment
- Check that preview workers are using the correct preview_id for KV bindings