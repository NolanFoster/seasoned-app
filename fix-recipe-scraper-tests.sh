#!/bin/bash

# Fix Recipe Scraper tests

echo "Fixing Recipe Scraper test issues..."

# Fix worker.integration.test.js
echo "Fixing worker.integration.test.js..."
sed -i "s/env = {/env = {\n      SAVE_WORKER_URL: 'http:\/\/save-worker.test',/" /workspace/recipe-scraper/worker.integration.test.js 2>/dev/null || true

# Fix worker.additional.test.js  
echo "Fixing worker.additional.test.js..."
sed -i "s/env = {/env = {\n      SAVE_WORKER_URL: 'http:\/\/save-worker.test',/" /workspace/recipe-scraper/worker.additional.test.js

# Fix worker.fetch.test.js
echo "Fixing worker.fetch.test.js..."
sed -i "s/env = {/env = {\n      SAVE_WORKER_URL: 'http:\/\/save-worker.test',/" /workspace/recipe-scraper/worker.fetch.test.js

# Add proper mocking for fetch in worker.additional.test.js
echo "Adding fetch mock setup..."
cat > /tmp/fetch-mock.txt << 'EOF'
    // Mock fetch for save-worker API calls
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockImplementation((url, ...args) => {
      if (typeof url === 'string' && url.includes('save-worker.test')) {
        // Mock save-worker endpoints
        if (url.includes('/recipe/save')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ success: true, id: 'saved-123' })
          });
        }
        if (url.includes('/recipes?id=')) {
          return Promise.resolve({
            ok: false,
            status: 404,
            json: () => Promise.resolve({ error: 'Recipe not found' })
          });
        }
        if (url.includes('/recipe/delete')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ success: true })
          });
        }
      }
      // Call original fetch mock for other URLs
      return originalFetch(url, ...args);
    });
EOF

# Update all test files to include the fetch mock if not already present
for file in /workspace/recipe-scraper/worker.*.test.js; do
  if ! grep -q "save-worker.test" "$file"; then
    echo "Updating $file with fetch mock..."
    # Insert after the beforeEach block starts
    sed -i '/beforeEach.*{/r /tmp/fetch-mock.txt' "$file"
  fi
done

echo "Test fixes completed!"