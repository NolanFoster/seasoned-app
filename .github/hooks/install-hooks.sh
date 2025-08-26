#!/bin/bash

# Script to install Git hooks

echo "Installing Git hooks..."

# Create hooks directory if it doesn't exist
mkdir -p .git/hooks

# Copy pre-commit hook
if [ -f ".github/hooks/pre-commit" ]; then
    cp .github/hooks/pre-commit .git/hooks/pre-commit
    chmod +x .git/hooks/pre-commit
    echo "✅ Pre-commit hook installed successfully!"
    echo "The hook will automatically run tests for:"
    echo "  - Frontend changes (runs npm test in frontend/)"
    echo "  - All worker changes (runs npm test in respective worker directories)"
    echo "  - Shared utilities changes (runs npm test in shared/)"
    echo ""
    echo "🚨 Never disable or skip the pre-commit hook - it's your safety net!"
else
    echo "❌ Pre-commit hook file not found at .github/hooks/pre-commit"
    exit 1
fi

echo ""
echo "📝 Remember the workflow:"
echo "1. Make changes and test locally"
echo "2. Commit (tests will run automatically)"
echo "3. Push to a feature branch"
echo "4. Merge to staging branch for validation"
echo "5. Only merge to main after staging validation"