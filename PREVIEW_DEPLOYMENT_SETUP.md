# Preview Deployment Setup Guide

## Quick Fix for CLOUDFLARE_API_TOKEN Error

The preview deployment is failing because the required GitHub secrets are not configured. Follow these steps to fix it:

### 1. Create Cloudflare API Token

1. Go to https://dash.cloudflare.com/profile/api-tokens
2. Click "Create Token"
3. Use the "Edit Cloudflare Workers" template OR create a custom token with these permissions:
   - Account → Cloudflare Workers Scripts:Edit
   - Account → Cloudflare Pages:Edit  
   - Account → Worker KV Storage:Edit
   - Account → D1:Edit
   - Account → R2:Edit
4. Click "Continue to summary" → "Create Token"
5. **Copy the token value** (you won't be able to see it again!)

### 2. Get Your Cloudflare Account ID

1. Go to any domain in your Cloudflare dashboard
2. In the right sidebar, find "Account ID"
3. Copy the 32-character alphanumeric string

### 3. Add Secrets to GitHub Repository

1. Go to your GitHub repository
2. Navigate to: **Settings** → **Secrets and variables** → **Actions**
3. Click "**New repository secret**" and add:

   | Secret Name | Value |
   |------------|-------|
   | `CLOUDFLARE_API_TOKEN` | Your token from step 1 |
   | `CLOUDFLARE_ACCOUNT_ID` | Your account ID from step 2 |
   | `GPT_API_KEY` | Your OpenAI API key (for clipper) |

### 4. Re-run the Failed Workflow

1. Go to the **Actions** tab in your repository
2. Find the failed workflow run
3. Click "**Re-run all jobs**"

## Verifying the Setup

Once the secrets are configured and the workflow runs successfully:

1. Check the Actions tab for a green checkmark
2. Look for a comment on your PR with preview URLs
3. Test the preview deployment by clicking the frontend URL

## Troubleshooting

If you still see errors after adding the secrets:

1. **Double-check the secret names** - They must match exactly (case-sensitive)
2. **Verify token permissions** - Ensure all required permissions are granted
3. **Check token expiration** - Some tokens have expiration dates
4. **Account ID format** - Should be 32 characters, alphanumeric only

For more details, see [PREVIEW_DEPLOYMENTS.md](./PREVIEW_DEPLOYMENTS.md)