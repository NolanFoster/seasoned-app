# Worker Coverage Setup

This document describes the coverage setup for worker tests in this repository.

## Overview

Coverage checking has been added to the following worker GitHub workflows:
- `clipped-recipe-db-worker-tests.yml`
- `recipe-recommendation-worker-tests.yml`

The `worker-tests.yml` workflow has been marked as deprecated since there is no generic worker directory.

## Current Status

### Coverage Thresholds
All worker coverage thresholds are currently set to **0%** for:
- Statements
- Branches
- Functions
- Lines

This is because the current tests are mock tests that don't actually import and test the worker source code.

### Coverage Tool
We're using `c8` for coverage collection, which is the modern coverage tool for Node.js that works with ES modules.

## Implementation Details

### Package.json Scripts
Each worker now has a `test:coverage` script:

```json
{
  "scripts": {
    "test": "node test/run-tests.js",
    "test:coverage": "c8 --include=\"src/**/*.js\" --reporter=text --reporter=lcov npm test"
  }
}
```

### GitHub Workflow Changes
The workflows now:
1. Run tests with coverage using `npm run test:coverage`
2. Extract coverage percentages from the output
3. Compare against thresholds
4. Upload coverage reports as artifacts
5. Fail the build if coverage is below thresholds

## Future Improvements

### 1. Write Real Tests
The current tests are mocks. To improve coverage:
- Use a testing framework like Vitest that works well with Cloudflare Workers
- Write actual unit tests that import and test the worker code
- Test individual functions and API endpoints

### 2. Increase Coverage Thresholds
Once real tests are in place, gradually increase thresholds:
- Start with achievable targets (e.g., 30-40%)
- Increase by 5-10% as more tests are added
- Aim for 70-80% coverage eventually

### 3. Integration with Miniflare
For testing Cloudflare Workers:
- Use Miniflare for local Worker environment simulation
- Test D1 database operations
- Test R2 bucket operations
- Test Worker AI functionality

### 4. Coverage Reporting
Consider adding:
- Coverage badges to README
- PR comments with coverage changes
- Integration with services like Codecov or Coveralls

## Example: Updating Thresholds

To update coverage thresholds, modify the workflow files:

```yaml
# Set coverage thresholds
THRESHOLD_STATEMENTS=50  # Changed from 0
THRESHOLD_BRANCHES=40    # Changed from 0
THRESHOLD_FUNCTIONS=45   # Changed from 0
THRESHOLD_LINES=50       # Changed from 0
```

## Running Coverage Locally

To run coverage locally for any worker:

```bash
cd clipped-recipe-db-worker
npm run test:coverage
```

This will show the coverage report in the terminal and generate an `lcov` report in the `coverage/` directory.