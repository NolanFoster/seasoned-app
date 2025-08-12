# Branch Strategy & Deployment Workflow

## Overview

This project uses a **Git Flow** inspired branching strategy with automated deployments to Cloudflare Pages and Workers.

## Branch Structure

### Main Branches

- **`main`** - Production-ready code
- **`staging`** - Pre-production testing environment
- **`develop`** - Development integration branch (optional)

### Feature Branches

- **`feature/feature-name`** - New features
- **`bugfix/bug-description`** - Bug fixes
- **`hotfix/critical-fix`** - Urgent production fixes

## Deployment Environments

### Production (main branch)
- **Frontend**: `https://seasoned-frontend.pages.dev`
- **Backend**: `https://your-worker.your-subdomain.workers.dev`
- **Deployment**: Automatic on push to `main`

### Staging (staging branch)
- **Frontend**: `https://seasoned-frontend-staging.pages.dev`
- **Backend**: `https://your-staging-worker.your-subdomain.workers.dev`
- **Deployment**: Automatic on push to `staging`

## Workflow

### 1. Development Workflow

```bash
# Start a new feature
git checkout -b feature/new-feature
# ... make changes ...
git commit -m "Add new feature"
git push origin feature/new-feature

# Create PR to staging branch
# After review and approval, merge to staging
```

### 2. Staging Deployment

```bash
# Staging automatically deploys when merged
git checkout staging
git merge feature/new-feature
git push origin staging
# GitHub Actions automatically deploys to staging environment
```

### 3. Production Deployment

```bash
# When ready for production
git checkout main
git merge staging
git push origin main
# GitHub Actions automatically deploys to production environment
```

### 4. Hotfix Workflow

```bash
# For urgent production fixes
git checkout -b hotfix/critical-fix main
# ... make changes ...
git commit -m "Fix critical issue"
git push origin hotfix/critical-fix

# Create PR directly to main
# After approval, merge to main
# Then merge to staging to keep branches in sync
```

## GitHub Actions Automation

The `.github/workflows/deploy.yml` file automatically:

1. **Builds** the frontend and backend on every push
2. **Deploys** to staging when pushing to `staging` branch
3. **Deploys** to production when pushing to `main` branch
4. **Runs tests** on pull requests

## Required Secrets

Set these in your GitHub repository settings:

- `CLOUDFLARE_API_TOKEN` - Your Cloudflare API token
- `CLOUDFLARE_ACCOUNT_ID` - Your Cloudflare account ID

## Manual Deployment Commands

### Frontend
```bash
cd frontend

# Deploy to staging
npm run deploy:staging

# Deploy to production
npm run deploy:prod

# Deploy to default (staging)
npm run deploy
```

### Backend
```bash
cd worker
npm run deploy
```

## Best Practices

1. **Never commit directly to main** - Always use pull requests
2. **Test on staging** before deploying to production
3. **Keep staging and main in sync** after hotfixes
4. **Use descriptive branch names** following the naming convention
5. **Review all changes** before merging to staging or main

## Rollback Strategy

### Frontend Rollback
- Use Cloudflare Pages' built-in rollback feature
- Or redeploy a previous commit:
  ```bash
  git checkout <previous-commit-hash>
  npm run deploy
  ```

### Backend Rollback
- Use Cloudflare Workers' version management
- Or redeploy a previous commit:
  ```bash
  git checkout <previous-commit-hash>
  cd worker && npm run deploy
  ```

## Environment Variables

Each environment should have its own configuration:

- **Production**: Use production API endpoints and databases
- **Staging**: Use staging API endpoints and databases
- **Development**: Use local development endpoints

Update environment files accordingly before deployment.
