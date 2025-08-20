// Test helpers and mock utilities for Cloudflare Workers testing

// Mock Cloudflare D1 Database
class MockD1Database {
  constructor() {
    this.data = new Map();
    this.recipes = [];
  }

  prepare(query) {
    const self = this;
    return {
      params: [],
      bind(...args) {
        this.params = args;
        return this;
      },
      async first() {
        if (query.includes('SELECT * FROM recipes WHERE id = ?')) {
          const id = this.params[0];
          return self.recipes.find(r => r.id === parseInt(id));
        }
        if (query.includes('SELECT COUNT')) {
          return { count: self.recipes.length };
        }
        return null;
      },
      async all() {
        if (query.includes('SELECT * FROM recipes')) {
          let results = [...self.recipes];
          if (query.includes('ORDER BY created_at DESC')) {
            results.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
          }
          if (query.includes('LIMIT')) {
            const limitMatch = query.match(/LIMIT (\d+)/);
            if (limitMatch) {
              const limit = parseInt(limitMatch[1]);
              results = results.slice(0, limit);
            }
          }
          return { results };
        }
        return { results: [] };
      },
      async run() {
        if (query.includes('INSERT INTO recipes')) {
          const recipe = {
            id: self.recipes.length + 1,
            name: this.params[0],
            description: this.params[1],
            ingredients: this.params[2],
            instructions: this.params[3],
            image_url: this.params[4],
            source_url: this.params[5],
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };
          self.recipes.push(recipe);
          return { meta: { last_row_id: recipe.id } };
        }
        if (query.includes('UPDATE recipes')) {
          const id = this.params[this.params.length - 1];
          const recipe = self.recipes.find(r => r.id === parseInt(id));
          if (recipe) {
            if (query.includes('image_url')) {
              recipe.image_url = this.params[0];
              recipe.updated_at = new Date().toISOString();
            }
          }
          return { meta: { changes: recipe ? 1 : 0 } };
        }
        if (query.includes('DELETE FROM recipes')) {
          const id = this.params[0];
          const index = self.recipes.findIndex(r => r.id === parseInt(id));
          if (index !== -1) {
            self.recipes.splice(index, 1);
            return { meta: { changes: 1 } };
          }
          return { meta: { changes: 0 } };
        }
        return { meta: {} };
      }
    };
  }

  addMockRecipe(recipe) {
    // Convert the recipe to database format (what would be stored in D1)
    const dbRecipe = {
      id: recipe.id || this.recipes.length + 1,
      name: recipe.name,
      description: recipe.description,
      ingredients: typeof recipe.ingredients === 'string' ? recipe.ingredients : JSON.stringify(recipe.ingredients || []),
      instructions: typeof recipe.instructions === 'string' ? recipe.instructions : JSON.stringify(recipe.instructions || []),
      image_url: recipe.image_url,
      source_url: recipe.source_url,
      created_at: recipe.created_at || new Date().toISOString(),
      updated_at: recipe.updated_at || new Date().toISOString(),
      // Additional fields that might be in the database
      recipe_ingredient: recipe.recipe_ingredient || (typeof recipe.ingredients === 'string' ? recipe.ingredients : JSON.stringify(recipe.ingredients || [])),
      recipe_instructions: recipe.recipe_instructions || (typeof recipe.instructions === 'string' ? recipe.instructions : JSON.stringify(recipe.instructions || [])),
      nutrition_calories: recipe.nutrition_calories || '',
      nutrition_protein: recipe.nutrition_protein || '',
      nutrition_fat: recipe.nutrition_fat || '',
      nutrition_carbohydrate: recipe.nutrition_carbohydrate || '',
      nutrition_fiber: recipe.nutrition_fiber || '',
      nutrition_sugar: recipe.nutrition_sugar || '',
      nutrition_sodium: recipe.nutrition_sodium || '',
      nutrition_cholesterol: recipe.nutrition_cholesterol || '',
      nutrition_saturated_fat: recipe.nutrition_saturated_fat || '',
      nutrition_trans_fat: recipe.nutrition_trans_fat || '',
      nutrition_unsaturated_fat: recipe.nutrition_unsaturated_fat || '',
      nutrition_serving_size: recipe.nutrition_serving_size || '',
      aggregate_rating_value: recipe.aggregate_rating_value || null,
      aggregate_rating_count: recipe.aggregate_rating_count || null,
      review_count: recipe.review_count || null,
      video_url: recipe.video_url || null
    };
    this.recipes.push(dbRecipe);
  }

  clearRecipes() {
    this.recipes = [];
  }
}

// Mock Cloudflare R2 Bucket
class MockR2Bucket {
  constructor() {
    this.objects = new Map();
  }

  async put(key, value, options = {}) {
    this.objects.set(key, { value, metadata: options.customMetadata || {} });
    return {
      key,
      uploaded: new Date().toISOString()
    };
  }

  async get(key) {
    const obj = this.objects.get(key);
    if (!obj) return null;
    return {
      body: obj.value,
      customMetadata: obj.metadata
    };
  }

  async delete(key) {
    return this.objects.delete(key);
  }

  async list(options = {}) {
    const objects = Array.from(this.objects.entries()).map(([key, obj]) => ({
      key,
      size: obj.value.size || 0,
      uploaded: obj.uploaded || new Date().toISOString()
    }));
    
    if (options.prefix) {
      return {
        objects: objects.filter(obj => obj.key.startsWith(options.prefix))
      };
    }
    
    return { objects };
  }
}

// Mock Request
class MockRequest {
  constructor(url, options = {}) {
    this.url = url;
    this.method = options.method || 'GET';
    this.headers = new Map(Object.entries(options.headers || {}));
    this.body = options.body;
  }

  async json() {
    if (typeof this.body === 'string') {
      try {
        return JSON.parse(this.body);
      } catch (e) {
        throw new SyntaxError(`Unexpected token in JSON at position 0`);
      }
    }
    return this.body;
  }

  async text() {
    if (typeof this.body === 'string') {
      return this.body;
    }
    return JSON.stringify(this.body);
  }

  async formData() {
    // Simple mock for form data
    if (this._formData) {
      return this._formData;
    }
    const formData = new Map();
    return {
      get: (key) => formData.get(key),
      has: (key) => formData.has(key),
      entries: () => formData.entries()
    };
  }
}

// Mock Response
class MockResponse extends Response {
  constructor(body, init = {}) {
    super(body, init);
    this._body = body;
    this._status = init.status || 200;
    this._headers = new Map(Object.entries(init.headers || {}));
  }

  get status() {
    return this._status;
  }

  get headers() {
    return {
      get: (key) => this._headers.get(key),
      entries: () => this._headers.entries()
    };
  }

  async json() {
    if (typeof this._body === 'string') {
      return JSON.parse(this._body);
    }
    return this._body;
  }

  async text() {
    if (typeof this._body === 'string') {
      return this._body;
    }
    return JSON.stringify(this._body);
  }
}

// Mock fetch for recipe extraction and save worker
const mockFetch = (url, options, env) => {
  // Mock save worker endpoints
  if (url.includes('mock-save-worker.example.com')) {
    if (url.includes('/recipe/save')) {
      // Mock recipe save endpoint
      const body = JSON.parse(options.body);
      const recipe = body.recipe || body;
      const mockId = Math.floor(Math.random() * 1000) + 1;
      
      // Also add to mock database if env is provided
      if (env && env.DB) {
        env.DB.addMockRecipe({
          id: mockId,
          ...recipe,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
      }
      
      return Promise.resolve(new MockResponse(JSON.stringify({
        id: mockId,
        ...recipe,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }), { 
        status: 201,
        headers: { 'Content-Type': 'application/json' }
      }));
    }
    
    if (url.includes('/recipe/update')) {
      // Mock recipe update endpoint
      const body = JSON.parse(options.body);
      return Promise.resolve(new MockResponse(JSON.stringify({
        id: body.recipeId,
        ...body.updates,
        updated_at: new Date().toISOString()
      }), { 
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }));
    }
    
    if (url.includes('/recipe/delete')) {
      // Mock recipe delete endpoint
      return Promise.resolve(new MockResponse(JSON.stringify({
        message: 'Recipe deleted successfully'
      }), { 
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }));
    }
  }
  
  // Mock recipe page HTML with structured data
  if (url.includes('example-recipe.com')) {
    const html = `
      <html>
        <head>
          <script type="application/ld+json">
          {
            "@context": "https://schema.org/",
            "@type": "Recipe",
            "name": "Test Recipe",
            "description": "A delicious test recipe",
            "recipeIngredient": [
              "2 cups flour",
              "1 cup sugar",
              "3 eggs"
            ],
            "recipeInstructions": [
              {
                "@type": "HowToStep",
                "text": "Mix dry ingredients"
              },
              {
                "@type": "HowToStep",
                "text": "Add wet ingredients"
              },
              {
                "@type": "HowToStep",
                "text": "Bake at 350°F for 30 minutes"
              }
            ]
          }
          </script>
        </head>
        <body></body>
      </html>
    `;
    return Promise.resolve(new MockResponse(html, { 
      status: 200,
      headers: { 'Content-Type': 'text/html' }
    }));
  }
  
  if (url.includes('jsonld-recipe.com')) {
    const html = `
      <html>
        <head>
          <script type="application/ld+json">
          {
            "@context": "https://schema.org/",
            "@type": "Recipe",
            "name": "Amazing Pasta Carbonara",
            "description": "A classic Italian pasta dish with eggs, cheese, and bacon",
            "recipeIngredient": [
              "400g spaghetti",
              "200g guanciale or pancetta",
              "4 large eggs",
              "100g Pecorino Romano cheese",
              "Black pepper to taste"
            ],
            "recipeInstructions": [
              {
                "@type": "HowToStep",
                "text": "Cook spaghetti in salted boiling water until al dente"
              },
              {
                "@type": "HowToStep",
                "text": "Meanwhile, cut guanciale into small cubes and cook until crispy"
              },
              {
                "@type": "HowToStep",
                "text": "Beat eggs with grated Pecorino and black pepper"
              },
              {
                "@type": "HowToStep",
                "text": "Drain pasta, mix with guanciale, then add egg mixture off heat"
              }
            ]
          }
          </script>
        </head>
        <body></body>
      </html>
    `;
    return Promise.resolve(new MockResponse(html, { 
      status: 200,
      headers: { 'Content-Type': 'text/html' }
    }));
  }
  
  // Mock microdata recipe page
  if (url.includes('microdata-recipe.com')) {
    const html = `
      <html>
        <body>
          <div itemscope itemtype="http://schema.org/Recipe">
            <h1 itemprop="name">Homemade Pizza</h1>
            <p itemprop="description">Easy homemade pizza recipe</p>
            <img itemprop="image" src="https://example.com/pizza.jpg" />
            
            <h2>Ingredients</h2>
            <ul>
              <li itemprop="recipeIngredient">Pizza dough</li>
              <li itemprop="recipeIngredient">Tomato sauce</li>
              <li itemprop="recipeIngredient">Mozzarella cheese</li>
              <li itemprop="recipeIngredient">Fresh basil</li>
            </ul>
            
            <h2>Instructions</h2>
            <ol>
              <li itemprop="recipeInstructions">Roll out the pizza dough</li>
              <li itemprop="recipeInstructions">Spread tomato sauce evenly</li>
              <li itemprop="recipeInstructions">Add mozzarella cheese</li>
              <li itemprop="recipeInstructions">Bake at 450°F for 12-15 minutes</li>
            </ol>
          </div>
        </body>
      </html>
    `;
    return Promise.resolve(new MockResponse(html, { 
      status: 200,
      headers: { 'Content-Type': 'text/html' }
    }));
  }

  // Mock multiple JSON-LD blocks
  if (url.includes('multiple-jsonld.com')) {
    const html = `
      <html>
        <head>
          <script type="application/ld+json">
          {
            "@context": "https://schema.org",
            "@type": "WebSite",
            "name": "Recipe Site"
          }
          </script>
          <script type="application/ld+json">
          {
            "@context": "https://schema.org/",
            "@type": "Recipe",
            "name": "Chocolate Cake",
            "description": "Rich chocolate cake recipe",
            "recipeIngredient": ["flour", "sugar", "cocoa", "eggs"],
            "recipeInstructions": ["Mix dry ingredients", "Add wet ingredients", "Bake"]
          }
          </script>
        </head>
      </html>
    `;
    return Promise.resolve(new MockResponse(html, { 
      status: 200,
      headers: { 'Content-Type': 'text/html' }
    }));
  }

  // Mock nested instructions
  if (url.includes('nested-instructions.com')) {
    const html = `
      <html>
        <head>
          <script type="application/ld+json">
          {
            "@context": "https://schema.org/",
            "@type": "Recipe",
            "name": "Complex Recipe",
            "description": "A recipe with nested instructions",
            "recipeIngredient": ["ingredient 1", "ingredient 2", "ingredient 3"],
            "recipeInstructions": [
              {
                "@type": "HowToSection",
                "name": "Prepare the base",
                "itemListElement": [
                  {
                    "@type": "HowToStep",
                    "text": "Step 1 of section 1"
                  },
                  {
                    "@type": "HowToStep",
                    "text": "Step 2 of section 1"
                  }
                ]
              },
              {
                "@type": "HowToStep",
                "text": "Final assembly step"
              }
            ]
          }
          </script>
        </head>
      </html>
    `;
    return Promise.resolve(new MockResponse(html, { 
      status: 200,
      headers: { 'Content-Type': 'text/html' }
    }));
  }

  // Mock no recipe page
  if (url.includes('no-recipe.com')) {
    const html = `
      <html>
        <head><title>Not a Recipe</title></head>
        <body>
          <h1>This is not a recipe page</h1>
          <p>Just some regular content.</p>
        </body>
      </html>
    `;
    return Promise.resolve(new MockResponse(html, { 
      status: 200,
      headers: { 'Content-Type': 'text/html' }
    }));
  }

  // Mock invalid JSON-LD
  if (url.includes('invalid-json.com')) {
    const html = `
      <html>
        <head>
          <script type="application/ld+json">
          {
            "@context": "https://schema.org/",
            "@type": "Recipe",
            "name": "Broken Recipe",
            invalid json here
          }
          </script>
        </head>
      </html>
    `;
    return Promise.resolve(new MockResponse(html, { 
      status: 200,
      headers: { 'Content-Type': 'text/html' }
    }));
  }

  // Mock 404 response
  if (url.includes('404-page.com') || url.includes('not-found')) {
    return Promise.resolve(new MockResponse('Not Found', { status: 404 }));
  }
  
  // Default mock response
  return Promise.resolve(new MockResponse('OK', { 
    status: 200,
    headers: { 'Content-Type': 'text/plain' }
  }));
};

// Create mock environment
function createMockEnv() {
  return {
    DB: new MockD1Database(),
    R2_BUCKET: new MockR2Bucket(),
    IMAGES_BASE_URL: 'https://test-images.example.com',
    IMAGE_DOMAIN: 'https://test-images.example.com',
    SAVE_WORKER_URL: 'https://mock-save-worker.example.com'
  };
}

// Test utilities
function assertResponse(response, expectedStatus, expectedHeaders = {}) {
  if (response.status !== expectedStatus) {
    throw new Error(`Expected status ${expectedStatus}, got ${response.status}`);
  }
  
  for (const [key, value] of Object.entries(expectedHeaders)) {
    const headerValue = response.headers.get(key);
    if (headerValue !== value) {
      throw new Error(`Expected header ${key}: ${value}, got ${headerValue}`);
    }
  }
}

async function assertJsonResponse(response, expectedStatus, expectedBodyCheck) {
  assertResponse(response, expectedStatus, { 'Content-Type': 'application/json' });
  const body = await response.json();
  
  if (typeof expectedBodyCheck === 'function') {
    if (!expectedBodyCheck(body)) {
      throw new Error(`Response body check failed: ${JSON.stringify(body)}`);
    }
  }
  
  return body;
}

export {
  MockD1Database,
  MockR2Bucket,
  MockRequest,
  MockResponse,
  mockFetch,
  createMockEnv,
  assertResponse,
  assertJsonResponse
};