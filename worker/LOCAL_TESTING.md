# Local Testing Guide for Recipe Clipper Worker

This guide shows you how to test your Cloudflare Worker locally using different methods.

## 🚀 Quick Start Options

### Option 1: Fast Local Testing (Recommended for Development)
Test your worker logic without running the full worker:

```bash
# Test core functions with mock data
node test-local-worker.js
```

**Pros:**
- ✅ Fast execution
- ✅ No external dependencies
- ✅ Tests core logic
- ✅ Good for debugging

**Cons:**
- ❌ Doesn't test actual HTTP endpoints
- ❌ Doesn't test CORS handling
- ❌ Doesn't test real AI integration

### Option 2: Full Local Worker (Recommended for Integration Testing)
Run the actual worker locally with `wrangler dev`:

```bash
# Start the worker locally
./start-local-dev.sh

# In another terminal, test the endpoints
node test-worker-endpoints.js
```

**Pros:**
- ✅ Tests actual HTTP endpoints
- ✅ Tests CORS handling
- ✅ Tests request/response flow
- ✅ Closer to production environment

**Cons:**
- ❌ Requires AI binding setup
- ❌ Slower startup
- ❌ More complex setup

## 🛠️ Setup Requirements

### Prerequisites
1. **Node.js** (v18+)
2. **Wrangler CLI** (`npm install -g wrangler`)
3. **Cloudflare account** (for AI binding)

### AI Binding Setup
To test the full recipe clipping functionality, you need to set up the AI binding:

```bash
# Login to Cloudflare
wrangler login

# Set up AI binding (you'll need to do this in production)
# The local dev environment will use your Cloudflare account's AI binding
```

## 📋 Testing Scenarios

### 1. Core Logic Testing (`test-local-worker.js`)
```bash
node test-local-worker.js
```

Tests:
- ✅ Health endpoint logic
- ✅ Recipe extraction from AI response
- ✅ Error handling for invalid data
- ✅ JSON parsing and validation

### 2. Endpoint Testing (`test-worker-endpoints.js`)
```bash
# First start the worker
./start-local-dev.sh

# Then test endpoints (in another terminal)
node test-worker-endpoints.js
```

Tests:
- ✅ Health endpoint (`GET /health`)
- ✅ Recipe clipping (`POST /clip`)
- ✅ CORS preflight (`OPTIONS /clip`)
- ✅ Error handling (invalid URLs, missing data)
- ✅ Response status codes and headers

### 3. Recipe-Specific Testing
```bash
# Test AllRecipes extraction
node test-allrecipes.js

# Test general recipe clipper
node test-recipe-clipper.js

# Test null response handling
node test-null-response.js
```

## 🔧 Troubleshooting

### Common Issues

#### 1. Worker Won't Start
```bash
# Check if port 8787 is available
lsof -i :8787

# Kill any existing processes
pkill -f wrangler

# Check wrangler configuration
cat wrangler-clipper.toml
```

#### 2. AI Binding Errors
```bash
# Check if you're logged in
wrangler whoami

# Verify AI binding in your account
# You may need to set this up in the Cloudflare dashboard
```

#### 3. CORS Issues
- The worker includes CORS headers for local development
- Test with `test-worker-endpoints.js` to verify CORS handling

### Debug Mode
Enable detailed logging by setting environment variables:

```bash
# Set debug mode
export DEBUG=1

# Start worker with debug
wrangler dev --config wrangler-clipper.toml --debug
```

## 📊 Test Results Interpretation

### Successful Tests
- ✅ All tests pass
- ✅ Recipe extraction works
- ✅ Error handling works correctly
- ✅ CORS headers are set properly

### Failed Tests
- ❌ Check worker logs for errors
- ❌ Verify AI binding configuration
- ❌ Check if test data is valid
- ❌ Ensure worker is running on correct port

## 🎯 Best Practices

### For Development
1. **Use `test-local-worker.js`** for quick iterations
2. **Test core logic** before testing endpoints
3. **Mock external dependencies** when possible

### For Integration Testing
1. **Use `test-worker-endpoints.js`** for full testing
2. **Test with real URLs** when AI binding is available
3. **Verify CORS and error handling**

### For Production
1. **Run all test suites** before deployment
2. **Test with production AI binding**
3. **Verify CORS settings for your domain**

## 🔄 Continuous Testing

### Automated Testing
```bash
# Run all tests
npm test

# Run specific test suites
npm run test:allrecipes
npm run test:clipper
npm run test:endpoints
```

### Pre-commit Testing
Consider adding a pre-commit hook to run tests automatically:

```bash
# Install husky for git hooks
npm install --save-dev husky

# Add pre-commit script to package.json
{
  "scripts": {
    "precommit": "npm test"
  }
}
```

## 📚 Additional Resources

- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
- [Wrangler CLI Documentation](https://developers.cloudflare.com/workers/wrangler/)
- [Cloudflare Workers AI](https://developers.cloudflare.com/workers-ai/)
- [Testing Best Practices](https://developers.cloudflare.com/workers/learning/testing-workers/)

---

**Happy Testing! 🧪✨** 