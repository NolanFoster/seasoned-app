#!/bin/bash

# Script to install the pre-commit hook
# Run this script to ensure the pre-commit hook is properly installed

echo "🔧 Installing pre-commit hook..."

# Check if .git directory exists
if [ ! -d ".git" ]; then
    echo "❌ Error: This doesn't appear to be a git repository."
    echo "   Please run this script from the root of your git repository."
    exit 1
fi

# Check if the pre-commit hook source exists
if [ ! -f ".github/hooks/pre-commit" ]; then
    echo "❌ Error: Pre-commit hook source not found at .github/hooks/pre-commit"
    echo "   Please ensure the pre-commit hook file exists."
    exit 1
fi

# Create .git/hooks directory if it doesn't exist
mkdir -p .git/hooks

# Copy the pre-commit hook
cp .github/hooks/pre-commit .git/hooks/pre-commit

# Make it executable
chmod +x .git/hooks/pre-commit

echo "✅ Pre-commit hook installed successfully!"
echo ""
echo "📋 The pre-commit hook will now automatically run tests for:"
echo "   - Frontend changes (runs npm test in frontend/)"
echo "   - All worker changes (runs npm test in respective worker directories)"
echo "   - Shared utilities changes (runs npm test in shared/)"
echo ""
echo "🚨 Never disable or skip the pre-commit hook - it's your safety net!"
echo ""
echo "💡 To test the hook, try making a change and committing it."