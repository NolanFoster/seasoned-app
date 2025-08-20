# GitHub Workflow Updates for Vitest Migration

## Summary of Changes

All worker test workflows have been updated to use Vitest instead of their previous test runners (Jest, c8, custom runners). This ensures consistency across the project and leverages Vitest's modern features.

## Updated Workflows

1. **recipe-save-worker-tests.yml** (NEW)
   - Created new workflow for recipe-save-worker
   - Uses Vitest for testing and coverage

2. **recipe-scraper-tests.yml**
   - Updated from Jest to Vitest
   - Added coverage collection and reporting

3. **clipper-tests.yml**
   - Simplified test running to use Vitest directly
   - Maintains existing coverage reporting

4. **recipe-recommendation-worker-tests.yml**
   - Updated from c8 to Vitest coverage
   - Modified coverage parsing to handle Vitest output

5. **clipped-recipe-db-worker-tests.yml**
   - Updated from c8 to Vitest coverage
   - Modified coverage parsing to handle Vitest output

6. **recipe-search-db-tests.yml**
   - Updated to use Vitest
   - Added coverage collection and reporting

## Key Changes

### Test Execution
All workflows now use:
```bash
npm run test:coverage
```
instead of various commands like `npm test`, `npm run coverage`, etc.

### Coverage Parsing
Updated coverage extraction to handle both:
- Vitest JSON output (`coverage/coverage-summary.json`)
- LCOV format (`coverage/lcov.info`)

Example:
```bash
if [ -f coverage/coverage-summary.json ]; then
  # Parse from Vitest JSON output
  STATEMENTS=$(jq -r '.total.statements.pct // 0' coverage/coverage-summary.json)
  BRANCHES=$(jq -r '.total.branches.pct // 0' coverage/coverage-summary.json)
  FUNCTIONS=$(jq -r '.total.functions.pct // 0' coverage/coverage-summary.json)
  LINES=$(jq -r '.total.lines.pct // 0' coverage/coverage-summary.json)
elif [ -f coverage/lcov.info ]; then
  # Fall back to parsing lcov.info
  LCOV_SUMMARY=$(lcov --summary coverage/lcov.info 2>&1)
  # Parse percentages...
fi
```

### System Dependencies
Added `jq` and `lcov` installation for coverage processing:
```bash
sudo apt-get update
sudo apt-get install -y lcov
```

### Coverage Artifacts
All workflows now upload coverage reports:
```yaml
- name: Upload Coverage Reports
  uses: actions/upload-artifact@v4
  if: always()
  with:
    name: [worker-name]-coverage-reports
    path: |
      [worker-path]/coverage/
    retention-days: 30
```

## Benefits

1. **Consistency**: All workers use the same test framework and commands
2. **Better Coverage**: Vitest provides more accurate coverage data
3. **Faster CI**: Vitest runs faster than Jest, especially for ESM projects
4. **Unified Reporting**: All coverage reports use the same format

## Next Steps

1. Ensure all workers have `npm run test:coverage` script in their package.json
2. Update any custom test commands in deployment scripts
3. Monitor initial workflow runs to ensure proper coverage generation
4. Consider adjusting coverage thresholds based on actual coverage data

## Troubleshooting

If a workflow fails after these updates:

1. **Missing test:coverage script**: Add to package.json:
   ```json
   "scripts": {
     "test:coverage": "vitest run --coverage"
   }
   ```

2. **Coverage not generated**: Ensure vitest.config.js has coverage configuration:
   ```javascript
   coverage: {
     reporter: ['text', 'lcov', 'json', 'html']
   }
   ```

3. **Coverage parsing fails**: Check that either `coverage-summary.json` or `lcov.info` is generated

4. **Tests fail**: Ensure test files are properly migrated to Vitest APIs