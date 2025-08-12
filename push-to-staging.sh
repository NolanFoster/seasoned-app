#!/bin/bash

# Helper script to push changes to staging branch after tests pass

echo "🧪 Running tests before pushing to staging..."

# Run frontend tests if frontend directory exists
if [ -d "frontend" ] && [ -f "frontend/package.json" ]; then
    echo "Running frontend tests..."
    cd frontend
    npm test
    FRONTEND_RESULT=$?
    cd ..
    if [ $FRONTEND_RESULT -ne 0 ]; then
        echo "❌ Frontend tests failed! Aborting push to staging."
        exit 1
    fi
fi

# Run worker tests if worker directory exists
if [ -d "worker" ] && [ -f "worker/package.json" ]; then
    echo "Running worker tests..."
    cd worker
    npm test
    WORKER_RESULT=$?
    cd ..
    if [ $WORKER_RESULT -ne 0 ]; then
        echo "❌ Worker tests failed! Aborting push to staging."
        exit 1
    fi
fi

echo "✅ All tests passed!"

# Get current branch name
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)

if [ "$CURRENT_BRANCH" == "main" ] || [ "$CURRENT_BRANCH" == "master" ]; then
    echo "❌ You're on $CURRENT_BRANCH branch! Please create a feature branch first."
    echo "Example: git checkout -b feature/your-feature-name"
    exit 1
fi

if [ "$CURRENT_BRANCH" == "staging" ]; then
    echo "❌ You're already on staging branch! Please create a feature branch for your changes."
    exit 1
fi

echo "📤 Pushing current branch to origin..."
git push origin "$CURRENT_BRANCH"

echo "🔀 Switching to staging branch..."
git checkout staging
git pull origin staging

echo "🔗 Merging $CURRENT_BRANCH into staging..."
git merge "$CURRENT_BRANCH" --no-ff -m "Merge $CURRENT_BRANCH into staging"

if [ $? -eq 0 ]; then
    echo "🚀 Pushing to staging..."
    git push origin staging
    
    echo "✅ Successfully pushed to staging!"
    echo "📝 Next steps:"
    echo "1. Monitor the staging deployment in GitHub Actions"
    echo "2. Validate changes in the staging environment"
    echo "3. If everything looks good, create a PR from staging to main"
    
    # Switch back to feature branch
    git checkout "$CURRENT_BRANCH"
else
    echo "❌ Merge conflicts detected! Please resolve conflicts manually."
    echo "After resolving conflicts:"
    echo "1. git add ."
    echo "2. git commit"
    echo "3. git push origin staging"
    exit 1
fi