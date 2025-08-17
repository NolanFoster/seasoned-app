# Coverage Workflow Updates

## Summary of Changes

The GitHub Actions workflow `.github/workflows/test-and-coverage.yml` has been updated to provide differential coverage reports in PR comments with the following features:

### 1. Differential Coverage Reporting
- The workflow now captures differential coverage data for new/modified code in PRs
- Differential coverage information is displayed in the PR comment
- The differential coverage threshold is set to 85% for new/modified code

### 2. Enhanced PR Comments
The PR comment now includes:
- **Overall Coverage Section**: Shows coverage metrics (lines, statements, functions, branches) with threshold status indicators
- **Differential Coverage Section**: Shows coverage percentage for new/modified code with threshold status
- Clear visual indicators (✅/❌) for each metric showing if it meets the threshold

### 3. Automatic Notifications
- When overall coverage is below the 40% threshold, the comment includes: `@cursoragent coverage does not meet minimum threshold`
- When differential coverage is below the 85% threshold, the comment includes: `@cursoragent coverage does not meet minimum threshold`

### 4. Technical Implementation Details
- Added outputs to the `test-frontend` job to pass differential coverage data to the `coverage-report` job
- Enhanced the differential coverage step to capture and output coverage percentages
- Modified the PR comment script to use job outputs instead of reading files directly
- Added proper error handling for cases where differential coverage data might not be available

## Example PR Comment Output

```markdown
## 📊 Coverage Report

### Overall Coverage
| Metric | Coverage | Threshold | Status |
|--------|----------|-----------|--------|
| Lines | 45.2% | 40% | ✅ |
| Statements | 44.8% | 40% | ✅ |
| Functions | 38.5% | 40% | ❌ |
| Branches | 41.3% | 40% | ✅ |

❌ **Coverage is below the required 40% threshold**

@cursoragent coverage does not meet minimum threshold

### Differential Coverage
**Coverage of new/modified code: 72.5%**

| Type | Coverage | Threshold | Status |
|------|----------|-----------|--------|
| New/Modified Code | 72.5% | 85% | ❌ |

❌ **New code coverage is below the required 85% threshold**

@cursoragent coverage does not meet minimum threshold

---
_Coverage thresholds: **40%** overall, **85%** for new/modified code_
_See workflow artifacts for detailed coverage reports._
```

## Testing the Changes

The workflow will automatically run on:
- Push to `main` or `staging` branches
- Pull requests targeting `main` or `staging` branches

The differential coverage report will only appear on pull requests where there are actual code changes that affect coverage.