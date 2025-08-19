# New Tests for Carousel Feature and Recipe Limit

This document describes the new tests added for the carousel feature and increased recipe limit.

## Test Files Created

### 1. SwipeableRecipeGrid.test.jsx
Tests for the new carousel component that works on both desktop and mobile.

**Key test areas:**
- Component rendering and children display
- Carousel layout application
- Navigation button functionality (desktop)
- Responsive behavior
- Accessibility features

**Test coverage:**
- ✅ Renders without crashing
- ✅ Properly displays child components
- ✅ Applies carousel-layout class
- ✅ Shows/hides navigation buttons based on scroll position
- ✅ Handles navigation button clicks
- ✅ Maintains carousel structure across screen sizes
- ✅ Provides semantic HTML structure
- ✅ Maintains focus management

### 2. RecipeLimit.test.jsx
Tests for the increased recipe limit from 6 to 10 per category.

**Key test areas:**
- API configuration (limit=10)
- Recipe array slicing logic
- Component integration
- Carousel configuration for 10 items

**Test coverage:**
- ✅ Verifies API calls use limit=10
- ✅ Tests slice operation for arrays > 10 items
- ✅ Tests slice operation for arrays < 10 items
- ✅ Tests slice operation for exactly 10 items
- ✅ Verifies component displays up to 10 recipes
- ✅ Tests carousel can accommodate 10 recipe cards
- ✅ Tests scroll navigation calculations

### 3. Updates to Recommendations.test.jsx
Added new test suite for carousel integration within existing Recommendations tests.

**New test coverage:**
- ✅ Verifies SwipeableRecipeGrid is used for recipe display
- ✅ Tests 10 recipe limit in carousel format
- ✅ Tests carousel functionality across category updates

## Running the Tests

To run only the new feature tests:
```bash
npx jest SwipeableRecipeGrid RecipeLimit --coverage=false --no-watchman
```

To run all tests including Recommendations:
```bash
npm test
```

## Test Results
All new tests are passing:
- SwipeableRecipeGrid: 10 tests passed
- RecipeLimit: 8 tests passed
- Total: 18 new tests, all passing

## Notes
- Tests focus on the specific changes made (carousel functionality and recipe limit)
- Mock implementations are used to avoid complex API calls
- Tests are designed to be maintainable and fast
- Accessibility and responsive behavior are covered