# User Management Worker Test Suite

This directory contains comprehensive tests for the User Management Worker, covering unit tests, integration tests, and performance tests.

## Test Structure

```
tests/
├── README.md                 # This file
├── setup.js                  # Test setup and mocks
├── run-tests.js             # Test runner script
├── unit/                     # Unit tests
│   ├── user-database.test.ts # Database service tests
│   └── api-endpoints.test.ts # API endpoint tests
├── integration/              # Integration tests
│   └── user-management.test.ts # Complete workflow tests
└── performance/              # Performance tests
    └── performance.test.ts   # Load and performance tests
```

## Test Categories

### 1. Unit Tests (`tests/unit/`)

**Purpose**: Test individual components in isolation with mocked dependencies.

**Coverage**:
- **Database Service** (`user-database.test.ts`)
  - User CRUD operations
  - Login history management
  - User statistics and queries
  - Error handling
  - Input validation

- **API Endpoints** (`api-endpoints.test.ts`)
  - All HTTP endpoints
  - Request validation
  - Response formatting
  - Error handling
  - Status codes

### 2. Integration Tests (`tests/integration/`)

**Purpose**: Test complete workflows and component interactions.

**Coverage**:
- Complete user lifecycle (create, read, update, delete)
- Login history integration
- User search and filtering workflows
- User statistics integration
- Error handling across endpoints
- Malformed request handling

### 3. Performance Tests (`tests/performance/`)

**Purpose**: Ensure the worker performs well under various conditions.

**Coverage**:
- Response time benchmarks
- Concurrent request handling
- Database query performance
- Memory usage with large payloads
- Error handling performance
- Load testing simulation

## Running Tests

### Prerequisites

Ensure you have the required dependencies installed:

```bash
npm install
```

### Test Commands

#### Run All Tests
```bash
npm test
```

#### Run Specific Test Categories
```bash
# Unit tests only
npm run test:unit

# Integration tests only
npm run test:integration

# Performance tests only
npm run test:performance
```

#### Run with Coverage
```bash
npm run test:coverage
```

#### Watch Mode (Development)
```bash
npm run test:watch
```

#### Custom Test Runner
```bash
# Run all tests with the custom runner
npm run test:run

# Run specific test categories
npm run test:run -- --unit
npm run test:run -- --integration
npm run test:run -- --performance
npm run test:run -- --coverage
```

### Test Runner Options

The custom test runner (`run-tests.js`) provides additional options:

```bash
node tests/run-tests.js --help

Options:
  --help, -h     Show help message
  --unit         Run only unit tests
  --integration  Run only integration tests
  --performance  Run only performance tests
  --coverage     Run all tests with coverage
```

## Test Configuration

### Vitest Configuration (`vitest.config.js`)

- **Environment**: Miniflare (Cloudflare Workers runtime)
- **Coverage**: V8 provider with HTML, JSON, and text reports
- **Setup**: Automatic test setup file loading
- **Exclusions**: Node modules, dist files, and test files

### Test Setup (`tests/setup.js`)

Provides mocks for:
- **D1Database**: Mock database operations
- **Request/Response**: Mock HTTP objects
- **Fetch API**: Mock external calls
- **Console**: Mock logging
- **Crypto**: Mock cryptographic functions
- **Date**: Consistent time for tests

## Test Data and Mocks

### Mock Database Responses

Tests use realistic mock data that matches the actual database schema:

```typescript
const mockUser = {
  user_id: 'test_hash',
  email_hash: 'test_hash',
  email_encrypted: 'encrypted@test.com',
  status: 'ACTIVE',
  account_type: 'FREE',
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
  last_activity_at: null,
  email_verified: false,
  two_factor_enabled: false
};
```

### Mock Database Operations

Each test mocks the specific database operations it needs:

```typescript
const mockPrepare = vi.fn().mockReturnValue({
  bind: vi.fn().mockReturnValue({
    first: vi.fn().mockResolvedValue(mockUser)
  })
});

vi.mocked(mockEnv.USER_DB.prepare).mockReturnValue(mockPrepare);
```

## Test Coverage Goals

### Unit Tests: 95%+
- All public methods in database service
- All API endpoint handlers
- All validation functions
- All error handling paths

### Integration Tests: 90%+
- Complete user workflows
- Cross-endpoint interactions
- Error propagation
- Data consistency

### Performance Tests: 100%
- Response time benchmarks
- Concurrent request handling
- Memory usage patterns
- Load testing scenarios

## Writing New Tests

### Adding Unit Tests

1. Create test file in appropriate `tests/unit/` subdirectory
2. Import the module to test
3. Mock dependencies using `vi.fn()`
4. Test both success and failure scenarios
5. Verify return values and side effects

Example:
```typescript
describe('NewFeature', () => {
  it('should handle success case', async () => {
    // Arrange
    const mockDependency = vi.fn().mockResolvedValue('success');
    
    // Act
    const result = await newFeature(mockDependency);
    
    // Assert
    expect(result).toBe('success');
    expect(mockDependency).toHaveBeenCalledOnce();
  });
});
```

### Adding Integration Tests

1. Create test file in `tests/integration/`
2. Test complete workflows across multiple endpoints
3. Verify data consistency throughout the flow
4. Test error handling and recovery

### Adding Performance Tests

1. Create test file in `tests/performance/`
2. Measure response times and resource usage
3. Test concurrent request handling
4. Verify performance under load

## Best Practices

### Test Organization
- Group related tests using `describe` blocks
- Use descriptive test names that explain the scenario
- Arrange-Act-Assert pattern for test structure

### Mocking
- Mock at the lowest level possible
- Use realistic mock data
- Verify mock interactions when relevant

### Assertions
- Test both positive and negative cases
- Verify error messages and status codes
- Check side effects and state changes

### Performance Testing
- Use realistic performance thresholds
- Test both individual operations and bulk operations
- Measure and report performance metrics

## Troubleshooting

### Common Issues

1. **Mock not working**: Ensure you're using `vi.mocked()` for TypeScript
2. **Test timing out**: Check for unhandled promises or infinite loops
3. **Coverage not working**: Verify V8 coverage provider is installed

### Debug Mode

Run tests with verbose output:
```bash
npm test -- --reporter=verbose
```

### Isolated Test Runs

Run a specific test file:
```bash
npm test tests/unit/user-database.test.ts
```

## Continuous Integration

The test suite is designed to run in CI/CD environments:

- **Fast execution**: Unit tests complete in <1 second
- **Deterministic**: Tests produce consistent results
- **Isolated**: Tests don't depend on external services
- **Comprehensive**: Covers all critical functionality

## Performance Benchmarks

### Response Time Targets
- **Health Check**: <100ms
- **User CRUD**: <150ms
- **Search/Filter**: <200ms
- **Statistics**: <300ms

### Concurrency Targets
- **User Creation**: 10 concurrent requests in <500ms
- **User Retrieval**: 20 concurrent requests in <300ms
- **Sustained Load**: 50 requests/second for 1 second

### Memory Usage
- **Large Payloads**: Handle 1000+ user records without issues
- **Efficient Processing**: Linear memory growth with data size
