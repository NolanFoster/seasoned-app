# Vitest Package.json Updates Summary

All worker `package.json` files have been updated to include the proper Vitest test scripts and dependencies.

## Updated Workers

### 1. recipe-recommendation-worker
- **Scripts Updated**: 
  - `test`: `vitest run`
  - `test:watch`: `vitest`
  - `test:coverage`: `vitest run --coverage`
- **Dependencies Updated**:
  - Removed: `c8`, `nodemon`
  - Added: `vitest`, `@vitest/coverage-v8`

### 2. clipped-recipe-db-worker
- **Scripts Updated**: 
  - `test`: `vitest run`
  - `test:watch`: `vitest` (new)
  - `test:coverage`: `vitest run --coverage`
- **Dependencies Updated**:
  - Removed: `c8`
  - Added: `vitest`, `@vitest/coverage-v8`

### 3. recipe-scraper
- **Scripts Updated**: 
  - `test`: `vitest run` (was using Jest)
  - `test:watch`: `vitest`
  - `test:coverage`: `vitest run --coverage`
- **Note**: Already had vitest in dependencies, moved to devDependencies

### 4. recipe-save-worker
- **Already Updated**: Had correct Vitest scripts
- **Config Updated**: Added json-summary reporter to vitest.config.js

### 5. recipe-search-db
- **Scripts Updated**: 
  - `test`: `vitest run` (was node test-search-db.js)
  - `test:watch`: `vitest` (new)
  - `test:coverage`: `vitest run --coverage` (new)
- **Dependencies Updated**:
  - Added: `vitest`, `@vitest/coverage-v8`

### 6. clipper
- **Scripts Updated**: 
  - `test`: `vitest run` (was node tests/run-tests.js)
  - `test:watch`: `vitest` (new)
  - `test:coverage`: `vitest run --coverage`
- **Dependencies Updated**:
  - Removed: `c8`
  - Added: `vitest`, `@vitest/coverage-v8`

## Vitest Configurations

Created/updated `vitest.config.js` for all workers with:
- Coverage provider: `v8`
- Coverage reporters: `['text', 'json', 'json-summary', 'lcov', 'html']`
- Proper exclude/include patterns
- Coverage thresholds (80-85% depending on worker)

## Key Changes

1. **Standardized Scripts**: All workers now use:
   - `npm test` - Run tests once
   - `npm run test:watch` - Run tests in watch mode
   - `npm run test:coverage` - Run tests with coverage

2. **Removed Old Test Runners**:
   - Jest (recipe-scraper)
   - c8 (multiple workers)
   - Custom test runners (node tests/run-tests.js)

3. **Added Vitest Dependencies**:
   - `vitest@^3.2.4`
   - `@vitest/coverage-v8@^3.2.4`

## Next Steps

Run `npm install` in each worker directory to install the new dependencies:

```bash
cd recipe-recommendation-worker && npm install
cd ../clipped-recipe-db-worker && npm install
cd ../recipe-scraper && npm install
cd ../recipe-save-worker && npm install
cd ../recipe-search-db && npm install
cd ../clipper && npm install
```

The GitHub Actions workflows will now successfully run `npm run test:coverage` for all workers.