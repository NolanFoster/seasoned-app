#!/usr/bin/env node

// Test Example for Recipe Search Database
// Demonstrates creating a recipe graph with nodes and edges

const BASE_URL = 'http://localhost:8787'; // Update with your worker URL

// Helper function to make HTTP requests
async function makeRequest(endpoint, method = 'GET', data = null) {
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
  };

  if (data) {
    options.body = JSON.stringify(data);
  }

  try {
    const response = await fetch(`${BASE_URL}${endpoint}`, options);
    const result = await response.json();
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${result.error || 'Unknown error'}`);
    }
    
    return result;
  } catch (error) {
    console.error(`Error calling ${endpoint}:`, error.message);
    throw error;
  }
}

// Generate a simple UUID-like ID
function generateId() {
  return 'id_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// Create recipe nodes
async function createRecipeNodes() {
  console.log('🍳 Creating recipe nodes...\n');

  const recipes = [
    {
      id: generateId(),
      type: 'RECIPE',
      properties: {
        name: 'Chocolate Chip Cookies',
        description: 'Classic homemade chocolate chip cookies',
        prep_time: '15 minutes',
        cook_time: '12 minutes',
        servings: 24,
        difficulty: 'Easy',
        cuisine: 'American',
        tags: ['dessert', 'cookies', 'chocolate', 'baking']
      }
    },
    {
      id: generateId(),
      type: 'RECIPE',
      properties: {
        name: 'Spaghetti Carbonara',
        description: 'Traditional Italian pasta dish with eggs and cheese',
        prep_time: '10 minutes',
        cook_time: '20 minutes',
        servings: 4,
        difficulty: 'Medium',
        cuisine: 'Italian',
        tags: ['pasta', 'main course', 'italian', 'eggs']
      }
    },
    {
      id: generateId(),
      type: 'RECIPE',
      properties: {
        name: 'Chicken Stir Fry',
        description: 'Quick and healthy Asian-inspired stir fry',
        prep_time: '20 minutes',
        cook_time: '15 minutes',
        servings: 4,
        difficulty: 'Easy',
        cuisine: 'Asian',
        tags: ['chicken', 'vegetables', 'stir fry', 'healthy']
      }
    }
  ];

  for (const recipe of recipes) {
    try {
      await makeRequest('/api/nodes', 'POST', recipe);
      console.log(`✅ Created recipe: ${recipe.properties.name}`);
    } catch (error) {
      console.error(`❌ Failed to create recipe ${recipe.properties.name}:`, error.message);
    }
  }

  return recipes;
}

// Create ingredient nodes
async function createIngredientNodes() {
  console.log('\n🥕 Creating ingredient nodes...\n');

  const ingredients = [
    {
      id: generateId(),
      type: 'INGREDIENT',
      properties: {
        name: 'All-Purpose Flour',
        category: 'Grains',
        nutritional_info: {
          calories_per_100g: 364,
          protein: 10,
          carbs: 76,
          fat: 1
        },
        common_uses: ['baking', 'thickening', 'coating'],
        storage: 'Cool, dry place'
      }
    },
    {
      id: generateId(),
      type: 'INGREDIENT',
      properties: {
        name: 'Chocolate Chips',
        category: 'Desserts',
        nutritional_info: {
          calories_per_100g: 502,
          protein: 4.5,
          carbs: 63,
          fat: 30
        },
        common_uses: ['baking', 'snacking', 'toppings'],
        storage: 'Cool, dry place'
      }
    },
    {
      id: generateId(),
      type: 'INGREDIENT',
      properties: {
        name: 'Chicken Breast',
        category: 'Protein',
        nutritional_info: {
          calories_per_100g: 165,
          protein: 31,
          carbs: 0,
          fat: 3.6
        },
        common_uses: ['grilling', 'stir fry', 'baking'],
        storage: 'Refrigerated or frozen'
      }
    },
    {
      id: generateId(),
      type: 'INGREDIENT',
      properties: {
        name: 'Broccoli',
        category: 'Vegetables',
        nutritional_info: {
          calories_per_100g: 34,
          protein: 2.8,
          carbs: 7,
          fat: 0.4
        },
        common_uses: ['steaming', 'stir fry', 'salads'],
        storage: 'Refrigerated'
      }
    },
    {
      id: generateId(),
      type: 'INGREDIENT',
      properties: {
        name: 'Pasta',
        category: 'Grains',
        nutritional_info: {
          calories_per_100g: 131,
          protein: 5,
          carbs: 25,
          fat: 1.1
        },
        common_uses: ['boiling', 'baking', 'salads'],
        storage: 'Cool, dry place'
      }
    }
  ];

  for (const ingredient of ingredients) {
    try {
      await makeRequest('/api/nodes', 'POST', ingredient);
      console.log(`✅ Created ingredient: ${ingredient.properties.name}`);
    } catch (error) {
      console.error(`❌ Failed to create ingredient ${ingredient.properties.name}:`, error.message);
    }
  }

  return ingredients;
}

// Create category nodes
async function createCategoryNodes() {
  console.log('\n📂 Creating category nodes...\n');

  const categories = [
    {
      id: generateId(),
      type: 'CATEGORY',
      properties: {
        name: 'Desserts',
        description: 'Sweet treats and desserts',
        parent_category: null,
        popular_recipes: ['Chocolate Chip Cookies', 'Apple Pie', 'Brownies']
      }
    },
    {
      id: generateId(),
      type: 'CATEGORY',
      properties: {
        name: 'Main Courses',
        description: 'Primary dishes for meals',
        parent_category: null,
        popular_recipes: ['Spaghetti Carbonara', 'Chicken Stir Fry', 'Beef Tacos']
      }
    },
    {
      id: generateId(),
      type: 'CATEGORY',
      properties: {
        name: 'Italian',
        description: 'Italian cuisine and recipes',
        parent_category: 'Main Courses',
        popular_recipes: ['Spaghetti Carbonara', 'Pizza Margherita', 'Risotto']
      }
    }
  ];

  for (const category of categories) {
    try {
      await makeRequest('/api/nodes', 'POST', category);
      console.log(`✅ Created category: ${category.properties.name}`);
    } catch (error) {
      console.error(`❌ Failed to create category ${category.properties.name}:`, error.message);
    }
  }

  return categories;
}

// Create edges between nodes
async function createEdges(recipes, ingredients, categories) {
  console.log('\n🔗 Creating edges between nodes...\n');

  const edges = [
    // Recipe -> Ingredient relationships
    {
      from_id: recipes[0].id, // Chocolate Chip Cookies
      to_id: ingredients[0].id, // All-Purpose Flour
      type: 'HAS_INGREDIENT',
      properties: {
        quantity: '2 cups',
        unit: 'cups',
        required: true,
        notes: 'Sifted'
      }
    },
    {
      from_id: recipes[0].id, // Chocolate Chip Cookies
      to_id: ingredients[1].id, // Chocolate Chips
      type: 'HAS_INGREDIENT',
      properties: {
        quantity: '2 cups',
        unit: 'cups',
        required: true,
        notes: 'Semi-sweet'
      }
    },
    {
      from_id: recipes[1].id, // Spaghetti Carbonara
      to_id: ingredients[4].id, // Pasta
      type: 'HAS_INGREDIENT',
      properties: {
        quantity: '1 pound',
        unit: 'pound',
        required: true,
        notes: 'Spaghetti or linguine'
      }
    },
    {
      from_id: recipes[2].id, // Chicken Stir Fry
      to_id: ingredients[2].id, // Chicken Breast
      type: 'HAS_INGREDIENT',
      properties: {
        quantity: '1 pound',
        unit: 'pound',
        required: true,
        notes: 'Cut into strips'
      }
    },
    {
      from_id: recipes[2].id, // Chicken Stir Fry
      to_id: ingredients[3].id, // Broccoli
      type: 'HAS_INGREDIENT',
      properties: {
        quantity: '2 cups',
        unit: 'cups',
        required: true,
        notes: 'Cut into florets'
      }
    },

    // Recipe -> Category relationships
    {
      from_id: recipes[0].id, // Chocolate Chip Cookies
      to_id: categories[0].id, // Desserts
      type: 'BELONGS_TO',
      properties: {
        primary: true
      }
    },
    {
      from_id: recipes[1].id, // Spaghetti Carbonara
      to_id: categories[1].id, // Main Courses
      type: 'BELONGS_TO',
      properties: {
        primary: true
      }
    },
    {
      from_id: recipes[1].id, // Spaghetti Carbonara
      to_id: categories[2].id, // Italian
      type: 'BELONGS_TO',
      properties: {
        primary: true
      }
    },
    {
      from_id: recipes[2].id, // Chicken Stir Fry
      to_id: categories[1].id, // Main Courses
      type: 'BELONGS_TO',
      properties: {
        primary: true
      }
    },

    // Category -> Category relationships
    {
      from_id: categories[2].id, // Italian
      to_id: categories[1].id, // Main Courses
      type: 'IS_SUBCATEGORY_OF',
      properties: {
        level: 1
      }
    }
  ];

  for (const edge of edges) {
    try {
      await makeRequest('/api/edges', 'POST', edge);
      console.log(`✅ Created edge: ${edge.type} from ${edge.from_id} to ${edge.to_id}`);
    } catch (error) {
      console.error(`❌ Failed to create edge:`, error.message);
    }
  }
}

// Test search functionality
async function testSearch() {
  console.log('\n🔍 Testing search functionality...\n');

  try {
    // Search for recipes containing "chocolate"
    console.log('Searching for recipes with "chocolate"...');
    const chocolateResults = await makeRequest('/api/search?q=chocolate&type=RECIPE');
    console.log(`Found ${chocolateResults.results.length} recipes:`);
    chocolateResults.results.forEach(recipe => {
      console.log(`  - ${recipe.properties.name}`);
    });

    // Search for ingredients containing "chicken"
    console.log('\nSearching for ingredients with "chicken"...');
    const chickenResults = await makeRequest('/api/search?q=chicken&type=INGREDIENT');
    console.log(`Found ${chickenResults.results.length} ingredients:`);
    chickenResults.results.forEach(ingredient => {
      console.log(`  - ${ingredient.properties.name}`);
    });

    // Search for anything containing "pasta"
    console.log('\nSearching for anything with "pasta"...');
    const pastaResults = await makeRequest('/api/search?q=pasta');
    console.log(`Found ${pastaResults.results.length} items:`);
    pastaResults.results.forEach(item => {
      console.log(`  - ${item.type}: ${item.properties.name}`);
    });

  } catch (error) {
    console.error('❌ Search test failed:', error.message);
  }
}

// Test graph traversal
async function testGraphTraversal(recipes) {
  console.log('\n🕸️ Testing graph traversal...\n');

  try {
    // Get the graph around Chocolate Chip Cookies
    const recipeId = recipes[0].id;
    console.log(`Getting graph around recipe ${recipeId}...`);
    
    const graph = await makeRequest(`/api/graph?node_id=${recipeId}&depth=2`);
    console.log(`Graph contains ${graph.nodes.length} nodes and ${graph.edges.length} edges`);
    
    console.log('Nodes in graph:');
    graph.nodes.forEach(node => {
      console.log(`  - Level ${node.level}: ${node.type} - ${node.properties.name || node.id}`);
    });

    console.log('\nEdges in graph:');
    graph.edges.forEach(edge => {
      console.log(`  - ${edge.type}: ${edge.from_id} → ${edge.to_id}`);
    });

  } catch (error) {
    console.error('❌ Graph traversal test failed:', error.message);
  }
}

// Main execution
async function main() {
  console.log('🚀 Starting Recipe Search Database Test Example\n');

  try {
    // Check if the worker is running
    console.log('Checking worker health...');
    const health = await makeRequest('/api/health');
    console.log(`✅ Worker is healthy: ${health.status}\n`);

    // Create nodes
    const recipes = await createRecipeNodes();
    const ingredients = await createIngredientNodes();
    const categories = await createCategoryNodes();

    // Create edges
    await createEdges(recipes, ingredients, categories);

    // Test functionality
    await testSearch();
    await testGraphTraversal(recipes);

    console.log('\n🎉 Test example completed successfully!');
    console.log('\nYou can now:');
    console.log('1. Search for recipes, ingredients, or categories');
    console.log('2. Traverse the graph to find related items');
    console.log('3. Add more nodes and edges to build your recipe knowledge graph');

  } catch (error) {
    console.error('\n❌ Test example failed:', error.message);
    console.log('\nMake sure your worker is running with:');
    console.log('  wrangler dev');
  }
}

// Run the example
if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  createRecipeNodes,
  createIngredientNodes,
  createCategoryNodes,
  createEdges,
  testSearch,
  testGraphTraversal
};
