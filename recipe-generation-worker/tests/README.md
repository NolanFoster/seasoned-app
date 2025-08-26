# Testing Structure

This directory contains all tests for the Recipe Generation Worker, organized following Vitest best practices.

## Directory Structure

```
tests/
├── README.md              # This file - test documentation
├── setup.js               # Shared test utilities and configuration
├── unit/                  # Unit tests for individual components
│   ├── root-handler.test.js      # Tests for root endpoint handler
│   ├── health-handler.test.js    # Tests for health endpoint handler
│   └── generate-handler.test.js  # Tests for generate endpoint handler
├── integration/           # Integration tests for full workflows
│   └── worker.test.js            # End-to-end worker tests
└── __mocks__/            # Mock files (when needed)
```

## Test Categories

### Unit Tests (`tests/unit/`)
- Test individual handler functions in isolation
- Focus on specific functionality and edge cases
- Fast execution and high coverage
- Mock external dependencies

### Integration Tests (`tests/integration/`)
- Test complete request/response workflows
- Test routing and middleware integration
- Verify CORS handling and error responses
- Test environment configuration

## Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run only unit tests
npm run test:unit

# Run only integration tests
npm run test:integration

# Run tests with coverage report
npm run test:coverage

# Run tests with UI (if @vitest/ui is installed)
npm run test:ui
```

## Test Utilities

The `setup.js` file provides shared utilities:

- `mockEnv` - Standard test environment
- `createMockRequest()` - Helper for creating test requests
- `createPostRequest()` - Helper for creating POST requests
- `assertCorsHeaders()` - Common CORS header assertions
- `assertJsonResponse()` - Common JSON response assertions

## Coverage Thresholds

Current coverage thresholds (configured in `vitest.config.js`):
- Lines: 85%
- Functions: 85%
- Branches: 80%
- Statements: 85%

## Best Practices

1. **Descriptive Test Names**: Use clear, descriptive test names that explain what is being tested
2. **Arrange-Act-Assert**: Structure tests with clear setup, execution, and assertion phases
3. **Test Isolation**: Each test should be independent and not rely on other tests
4. **Mock External Dependencies**: Use mocks for external services and dependencies
5. **Edge Cases**: Test both happy path and error scenarios
6. **Async Testing**: Properly handle async operations with async/await

## Adding New Tests

When adding new handlers or functionality:

1. Create unit tests in `tests/unit/` for individual handler functions
2. Add integration tests in `tests/integration/` for complete workflows
3. Update shared utilities in `setup.js` if needed
4. Ensure tests follow the existing patterns and conventions
