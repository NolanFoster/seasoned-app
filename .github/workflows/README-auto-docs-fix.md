# Auto-Docs Workflow Fix

## Issue
The auto-docs GitHub Action was failing with the error:
```
RequestError [HttpError]: Resource not accessible by integration
```

This occurred when the workflow tried to create a comment on pull requests.

## Root Cause
The workflow was missing the required permissions to interact with issues and pull requests. GitHub Actions requires explicit permissions to be granted for workflows to perform certain operations.

## Solution
Added the following permissions to the workflow file (`.github/workflows/auto-docs.yml`):

```yaml
permissions:
  contents: write      # Required for pushing documentation changes
  issues: write        # Required for creating issue comments
  pull-requests: write # Required for creating PR comments
```

Additionally:
1. Explicitly passed the GitHub token to the `github-script` action
2. Added error handling for cases where the issue/PR number might not be available
3. Used `await` for the async API call to ensure proper error handling

## Changes Made
1. Added `permissions` section to the workflow
2. Added `github-token: ${{ secrets.GITHUB_TOKEN }}` to the github-script action
3. Improved PR number detection with fallback logic
4. Added error handling for missing PR context

## Testing
After these changes, the workflow should:
- Successfully generate documentation on code changes
- Post comments on pull requests when documentation is updated
- Work correctly for both push and pull request events

## Additional Notes
- No changes to repository settings are required
- The default `GITHUB_TOKEN` has sufficient permissions when explicitly granted in the workflow
- The workflow will skip commenting if no PR context is found (e.g., on direct pushes)