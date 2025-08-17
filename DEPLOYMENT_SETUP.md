# Deployment Setup Instructions

## Prerequisites

1. Access to the Cloudflare account managing the workers
2. GitHub repository admin access (for setting secrets)

## Setting Up Automated Deployment

### 1. Create Cloudflare API Token

1. Log in to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Go to **My Profile** → **API Tokens**
3. Click **Create Token**
4. Use the **Custom token** template with these permissions:
   - **Account** → Workers Scripts:Edit
   - **Account** → Workers KV Storage:Edit
   - **Account** → D1:Edit
   - **Zone** → Zone:Read (for your domain)
5. Set **Account Resources** to include your account
6. Set **Zone Resources** to include your domain (if applicable)
7. Click **Continue to summary** → **Create Token**
8. Copy the token (you won't be able to see it again!)

### 2. Add Token to GitHub Secrets

1. Go to your GitHub repository
2. Navigate to **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Name: `CLOUDFLARE_API_TOKEN`
5. Value: Paste the token from step 1
6. Click **Add secret**

### 3. Manual Deployment (Alternative)

If you prefer manual deployment or need to deploy immediately:

```bash
# 1. Install wrangler globally (optional)
npm install -g wrangler

# 2. Login to Cloudflare
wrangler login

# 3. Navigate to the worker directory
cd /workspace/recipe-search-db

# 4. Deploy
npm run deploy
```

### 4. Verify Deployment

After deployment (manual or automated):

```bash
# Check the version
curl https://recipe-search-db.nolanfoster.workers.dev/api/version

# Test partial word search
curl "https://recipe-search-db.nolanfoster.workers.dev/api/search?q=chick&type=RECIPE&limit=5"

# Use debug endpoint if needed
curl "https://recipe-search-db.nolanfoster.workers.dev/api/debug/search?q=chick"
```

## Troubleshooting

### "Authentication error" during deployment
- Ensure the API token has the correct permissions
- Check that the token hasn't expired
- Verify the account ID in `wrangler.toml` matches your Cloudflare account

### "Worker not found" errors
- Check the worker name in `wrangler.toml`
- Ensure the worker exists in your Cloudflare account
- Verify you're deploying to the correct account

### Search still not working after deployment
1. Wait 1-2 minutes for global propagation
2. Check the version endpoint to confirm new code is deployed
3. Use the debug endpoint to diagnose issues
4. Check Cloudflare dashboard for any error logs

## GitHub Actions Workflow

The repository now includes an automated deployment workflow at `.github/workflows/deploy-search-db.yml` that:
- Triggers on pushes to `main` branch that modify `recipe-search-db/` files
- Can be manually triggered from the Actions tab
- Automatically deploys to Cloudflare Workers
- Verifies the deployment succeeded

To use it, just ensure the `CLOUDFLARE_API_TOKEN` secret is set up as described above.