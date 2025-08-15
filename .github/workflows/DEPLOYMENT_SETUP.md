# Frontend Deployment Setup Guide

## Overview
This guide explains how to set up the GitHub Action workflow for deploying the frontend to staging and production environments using Cloudflare Pages.

## Required GitHub Secrets

Before the deployment workflow can function, you need to add the following secrets to your GitHub repository:

### 1. CLOUDFLARE_ACCOUNT_ID
Your Cloudflare account ID. To find this:
1. Log in to your Cloudflare dashboard
2. Select your account
3. Copy the Account ID from the right sidebar

### 2. CLOUDFLARE_API_TOKEN
A Cloudflare API token with permissions to deploy to Cloudflare Pages. To create this:
1. Go to https://dash.cloudflare.com/profile/api-tokens
2. Click "Create Token"
3. Use the "Custom token" template
4. Set the following permissions:
   - Account: Cloudflare Pages:Edit
   - Zone: Zone:Read (if your pages are connected to a custom domain)
5. Click "Continue to summary" and "Create Token"
6. Copy the token (you won't be able to see it again!)

## Adding Secrets to GitHub

1. Go to your repository on GitHub
2. Click on "Settings" → "Secrets and variables" → "Actions"
3. Click "New repository secret"
4. Add each secret:
   - Name: `CLOUDFLARE_ACCOUNT_ID`
   - Value: Your Cloudflare Account ID
   - Click "Add secret"
   
   - Name: `CLOUDFLARE_API_TOKEN`
   - Value: Your Cloudflare API Token
   - Click "Add secret"

## Workflow Behavior

The workflow (`deploy-frontend-staging.yml`) will:

1. **Trigger** when:
   - Changes are pushed to the `frontend/` directory on `staging` or `main` branches
   - Pull requests targeting `staging` branch with frontend changes

2. **Test** the frontend by:
   - Running linting
   - Running tests
   - Building the application

3. **Deploy** to:
   - **Staging**: When changes are pushed to the `staging` branch
   - **Production**: When changes are pushed to the `main` branch

## Cloudflare Pages Configuration

Make sure your Cloudflare Pages project is configured with:
- Project name: `seasoned-frontend` (as specified in `wrangler.toml`)
- Staging branch: `staging`
- Production branch: `main`

## Customizing the Deployment

### Staging URL Verification
The workflow includes a commented-out section for verifying the staging deployment. To enable this:

1. Uncomment the verification code in the workflow
2. Replace `https://staging.seasoned-frontend.pages.dev` with your actual staging URL
3. The workflow will then verify that the deployment is accessible

### Additional Environments
To add more environments (e.g., development, QA):
1. Add new deployment scripts in `frontend/package.json`
2. Add corresponding jobs in the workflow file
3. Configure branch protection rules as needed

## Troubleshooting

### Common Issues

1. **Authentication Error**: Ensure your Cloudflare API token has the correct permissions
2. **Project Not Found**: Verify the project name in `wrangler.toml` matches your Cloudflare Pages project
3. **Build Failures**: Check the build logs and ensure all dependencies are properly installed

### Testing Locally

You can test the deployment process locally:
```bash
cd frontend
npm run build
npm run deploy:staging  # Will use your local Cloudflare credentials
```

Make sure you have Wrangler authenticated locally:
```bash
npx wrangler login
```