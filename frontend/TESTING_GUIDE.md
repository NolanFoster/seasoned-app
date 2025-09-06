# 🧪 Testing Guide for Refactored Architecture

This guide explains how to test the refactored feature-based architecture using **Vitest** to ensure everything works correctly.

## 🎯 Testing Strategy

### 1. **Unit Tests** - Test individual features in isolation
### 2. **Integration Tests** - Test feature interactions
### 3. **Migration Tests** - Verify refactoring didn't break functionality
### 4. **Performance Tests** - Ensure performance improvements

## 🚀 Quick Start

### Step 1: Run All Tests
```bash
npm test
```

### Step 2: Run Tests with Coverage
```bash
npm run test:coverage
```

### Step 3: Run Tests in Watch Mode
```bash
npm run test:watch
```

### Step 4: Open Test UI (Interactive)
```bash
npm run test:ui
```

## 📋 Testing Checklist

### ✅ Feature Tests
- [ ] Recipes feature works correctly
- [ ] Search feature works correctly  
- [ ] Timers feature works correctly
- [ ] Forms feature works correctly
- [ ] Recommendations feature works correctly

### ✅ Integration Tests
- [ ] Features can communicate properly
- [ ] State management works across features
- [ ] API calls work correctly
- [ ] Component rendering works

### ✅ Migration Tests
- [ ] All original functionality preserved
- [ ] No breaking changes introduced
- [ ] Performance maintained or improved

## 🔧 Test Commands

```bash
# Run all tests
npm test

# Run specific feature tests
npm run test:run -- features/recipes
npm run test:run -- features/search
npm run test:run -- features/timers
npm run test:run -- features/forms

# Run with coverage
npm run test:coverage

# Run in watch mode
npm run test:watch

# Open interactive test UI
npm run test:ui

# Run specific test file
npm run test:run -- RecipePreview.test.jsx

# Run tests matching pattern
npm run test:run -- --grep "should render recipe"

# Run with verbose output
npm run test:feature
```

## 📊 Expected Results

### Coverage Targets
- **Overall Coverage**: > 80%
- **Feature Coverage**: > 85%
- **Component Coverage**: > 75%

### Performance Targets
- **Bundle Size**: < 500KB (gzipped)
- **Initial Load**: < 2s
- **Component Render**: < 100ms

## 🐛 Troubleshooting

### Common Issues
1. **Import Errors**: Check feature index.js files
2. **Hook Errors**: Verify hook dependencies
3. **State Issues**: Check store implementations
4. **API Errors**: Verify mock implementations

### Debug Commands
```bash
# Debug specific test
npm test -- --testNamePattern="RecipePreview" --verbose

# Run with debug output
DEBUG=* npm test

# Check bundle size
npm run build && ls -la dist/
```
