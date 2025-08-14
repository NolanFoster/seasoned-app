#!/bin/bash

# Exit on any error
set -e

echo "Starting rebase process..."

# Fetch latest changes
echo "Fetching latest changes..."
git fetch origin

# Switch to staging branch
echo "Switching to staging branch..."
git checkout staging

# Pull latest staging
echo "Pulling latest staging..."
git pull origin staging

# Rebase main into staging
echo "Rebasing main into staging..."
git rebase origin/main

# If rebase is successful, force push to main
echo "Pushing rebased staging to main..."
git push origin staging:main --force-with-lease

echo "Rebase and push completed successfully!"
echo "The staging branch has been rebased with main and pushed to main."