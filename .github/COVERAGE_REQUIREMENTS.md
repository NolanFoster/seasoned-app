# Coverage Requirements

This repository enforces code coverage requirements to maintain code quality.

## Coverage Thresholds

### Overall Coverage
- **Minimum Required**: 40% for all metrics (lines, statements, functions, branches)
- Enforced by Jest configuration in `frontend/jest.config.js`
- Tests will fail if coverage falls below this threshold

### Differential Coverage
- **Minimum Required**: 85% for new code changes in pull requests
- Only applies to code modified in the PR
- Enforced using `diff-cover` tool in the GitHub Actions workflow

## GitHub Actions Workflow

The `test-and-coverage.yml` workflow:
1. Runs tests with coverage collection
2. Checks overall coverage meets 40% threshold
3. For PRs: Analyzes differential coverage of new code (must be ≥85%)
4. Posts coverage summary as PR comment
5. Uploads coverage reports as artifacts

### Required Permissions

The workflow requires the following permissions to function correctly:
- `contents: read` - To checkout the code
- `pull-requests: write` - To post comments on PRs
- `issues: write` - To create/update issue comments
- `checks: write` - To create status checks

These permissions are defined at the workflow level. If using a custom GitHub token, ensure it has these permissions.

## Setting Up Branch Protection

To enforce coverage checks on pull requests:

1. Go to **Settings** → **Branches** in your GitHub repository
2. Add or edit a branch protection rule for `main` and `staging`
3. Enable **Require status checks to pass before merging**
4. Add these required status checks:
   - `Frontend Tests and Coverage`
   - `Coverage Report`
5. Enable **Require branches to be up to date before merging**
6. Save the branch protection rule

## Local Testing

To test coverage locally:

```bash
# Run tests with coverage
cd frontend
npm run test:coverage

# The command will fail if coverage is below 40%
```

## Coverage Reports

- **HTML Report**: `frontend/coverage/lcov-report/index.html`
- **Summary**: Displayed in GitHub Actions workflow summary
- **PR Comments**: Automatic comments on PRs with coverage details
- **Differential Report**: Available as artifact in PR workflows

## Improving Coverage

To improve code coverage:
1. Write tests for untested functions
2. Add edge case tests
3. Test error handling paths
4. Focus on critical business logic first