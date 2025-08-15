# Recipe Search Database

A graph-based search database for recipes using Cloudflare D1, designed to enable powerful recipe discovery and relationship mapping.

## 🏗️ Architecture

The search database uses a graph structure with three main components:

### Nodes
- **Entities** in the recipe ecosystem (recipes, ingredients, categories, etc.)
- **Properties** stored as JSON for flexible data storage
- **Types** for categorization (RECIPE, INGREDIENT, CATEGORY, etc.)

### Edges
- **Relationships** between nodes (HAS_INGREDIENT, BELONGS_TO, etc.)
- **Properties** for relationship metadata (quantity, notes, etc.)
- **Bidirectional** traversal support

### Metadata
- **Versioning** for tracking changes over time
- **Status** tracking (ACTIVE/DELETED) for soft deletes
- **Timestamps** for audit trails

## 🚀 Features

- **Full-Text Search**: SQLite FTS5 integration for powerful text search
- **Graph Traversal**: Navigate relationships between recipes and ingredients
- **Type Filtering**: Search within specific node types
- **Pagination**: Efficient handling of large result sets
- **Transaction Support**: Multi-row operations with consistency
- **Soft Deletes**: Maintain data integrity while allowing removal
- **RESTful API**: Clean HTTP endpoints for all operations
- **KV Migration**: Import recipes from Cloudflare KV storage with automatic graph building

## 📊 Database Schema

```sql
-- Nodes table
CREATE TABLE nodes (
    id TEXT PRIMARY KEY,           -- UUID identifier
    type TEXT NOT NULL,            -- Node type (RECIPE, INGREDIENT, etc.)
    properties TEXT NOT NULL,      -- JSON properties
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Edges table
CREATE TABLE edges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_id TEXT NOT NULL,         -- Source node ID
    to_id TEXT NOT NULL,           -- Target node ID
    type TEXT NOT NULL,            -- Relationship type
    properties TEXT,               -- Edge properties (optional)
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (from_id) REFERENCES nodes(id) ON DELETE CASCADE,
    FOREIGN KEY (to_id) REFERENCES nodes(id) ON DELETE CASCADE
);

-- Metadata table
CREATE TABLE metadata (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    node_id TEXT NOT NULL,         -- Reference to node
    version INTEGER NOT NULL DEFAULT 1,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'DELETED')) DEFAULT 'ACTIVE',
    FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE
);

-- Full-text search index
CREATE VIRTUAL TABLE nodes_fts USING fts5(
    id UNINDEXED,
    type UNINDEXED,
    properties,
    content='nodes',
    content_rowid='rowid'
);
```

## 🛠️ Setup

### 1. Prerequisites
- Node.js 18+ installed
- Wrangler CLI installed (`npm install -g wrangler`)
- Cloudflare account with D1 access
- Cloudflare KV namespace for recipe storage

### 2. Create Database
```bash
# Create the D1 database
wrangler d1 create recipe-search-db

# Copy the database_id from the output and update wrangler.toml
```

### 3. Update Configuration
Edit `wrangler.toml` and add your database ID and KV namespace:
```toml
[[d1_databases]]
binding = "SEARCH_DB"
database_name = "recipe-search-db"
database_id = "your-actual-database-id-here"

[[kv_namespaces]]
binding = "RECIPE_STORAGE"
id = "your-recipe-kv-namespace-id"
```

### 4. Initialize Schema
```bash
# Apply the database schema
wrangler d1 execute recipe-search-db --file=./schema.sql
```

### 5. Install Dependencies
```bash
npm install
```

### 6. Start Development Server
```bash
npm run dev
```

## 📚 Usage Examples

### Creating Recipe Nodes
```javascript
const recipe = {
  id: 'recipe_123',
  type: 'RECIPE',
  properties: {
    name: 'Chocolate Chip Cookies',
    description: 'Classic homemade cookies',
    prep_time: '15 minutes',
    cook_time: '12 minutes',
    servings: 24,
    difficulty: 'Easy',
    cuisine: 'American',
    tags: ['dessert', 'cookies', 'chocolate']
  }
};

const response = await fetch('/api/nodes', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(recipe)
});
```

### Creating Ingredient Nodes
```javascript
const ingredient = {
  id: 'ingredient_456',
  type: 'INGREDIENT',
  properties: {
    name: 'All-Purpose Flour',
    category: 'Grains',
    nutritional_info: {
      calories_per_100g: 364,
      protein: 10,
      carbs: 76,
      fat: 1
    }
  }
};
```

### Creating Relationships
```javascript
const edge = {
  from_id: 'recipe_123',
  to_id: 'ingredient_456',
  type: 'HAS_INGREDIENT',
  properties: {
    quantity: '2 cups',
    unit: 'cups',
    required: true,
    notes: 'Sifted'
  }
};

const response = await fetch('/api/edges', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(edge)
});
```

### Searching Recipes
```javascript
// Search for chocolate recipes
const searchResults = await fetch('/api/search?q=chocolate&type=RECIPE');

// Search for anything containing "pasta"
const pastaResults = await fetch('/api/search?q=pasta');

// Search with limit
const limitedResults = await fetch('/api/search?q=chicken&limit=10');
```

### Graph Traversal
```javascript
// Get related nodes within 2 levels
const graph = await fetch('/api/graph?node_id=recipe_123&depth=2');

// This returns:
// - The center recipe node
// - All ingredients (level 1)
// - All categories and related recipes (level 2)
// - All edges connecting these nodes
```

## 🔍 Search Capabilities

### Full-Text Search
- Searches across all node properties
- Supports complex queries with SQLite FTS5
- Ranking based on relevance
- Type filtering for targeted results

### Graph Search
- Find recipes by ingredient relationships
- Discover related recipes through shared ingredients
- Navigate category hierarchies
- Build ingredient substitution chains

### Advanced Queries
- Combine text search with graph traversal
- Filter by multiple node types
- Paginate through large result sets
- Sort by relevance or other criteria

## 🧪 Testing

### Run Example
```bash
# Start the worker first
npm run dev

# In another terminal, run the example
npm run test:example
```

### Run Test Suite
```bash
# Run comprehensive tests
npm test
```

### Manual Testing
```bash
# Check database info
npm run db:info

# Test specific endpoints
curl http://localhost:8787/api/health
```

## 📡 API Endpoints

### Nodes
- `POST /api/nodes` - Create a new node
- `GET /api/nodes` - List nodes with filtering and pagination
- `GET /api/nodes/:id` - Get a specific node
- `PUT /api/nodes/:id` - Update a node
- `DELETE /api/nodes/:id` - Soft delete a node

### Edges
- `POST /api/edges` - Create a new edge
- `GET /api/edges` - List edges with filtering
- `DELETE /api/edges/:id` - Delete an edge

### Search
- `GET /api/search?q=query&type=type&limit=limit` - Full-text search

### Graph
- `GET /api/graph?node_id=id&depth=depth` - Graph traversal

### Health
- `GET /api/health` - Service health check

### Migration
- `POST /api/migrate-kv` - Migrate all recipes from KV storage to search database

## 🔧 Configuration

### Environment Variables
- `SEARCH_DB` - D1 database binding (automatically set by Wrangler)

### Wrangler Configuration
- Database binding and ID
- KV namespaces (optional, for caching)
- R2 buckets (optional, for search indexes)

## 🔄 KV Migration

### Overview
The search database includes a powerful migration system that can import all recipes from your Cloudflare KV storage and automatically build a rich graph structure with:

- **Recipe Nodes**: Full recipe data with title, ingredients, instructions, etc.
- **Ingredient Nodes**: Normalized ingredients with categorization
- **Tag Nodes**: Recipe tags and categories
- **Graph Relationships**: Automatic edge creation between recipes and ingredients/tags

### How It Works
1. **Batch Processing**: Recipes are processed in small batches to avoid overwhelming the system
2. **Smart Deduplication**: Existing nodes are reused, preventing duplicates
3. **Intelligent Categorization**: Ingredients and tags are automatically categorized
4. **Relationship Building**: Edges are created to connect recipes with their components
5. **Progress Tracking**: Real-time progress updates and detailed statistics

### Usage

#### Start Migration
```bash
# Trigger migration via HTTP endpoint
curl -X POST http://localhost:8787/api/migrate-kv
```

#### Migration Response
```json
{
  "success": true,
  "message": "Migration completed successfully",
  "stats": {
    "total": 150,
    "processed": 150,
    "successful": 148,
    "failed": 2,
    "skipped": 0
  }
}
```

#### Test Migration
```bash
# Run migration tests
node test-migration.js

# Test with your actual data
npm run test:migration
```

### Configuration
Ensure your `wrangler.toml` includes the KV binding:
```toml
[[kv_namespaces]]
binding = "RECIPE_STORAGE"
id = "your-recipe-kv-namespace-id"
```

### Benefits After Migration
- **Full-Text Search**: Search recipes by any text content
- **Ingredient Discovery**: Find recipes by ingredients
- **Category Browsing**: Explore recipes by tags and categories
- **Graph Traversal**: Navigate recipe relationships
- **Advanced Queries**: Complex search combinations

## 🚀 Deployment

### Development
```bash
npm run dev
```

### Production
```bash
npm run deploy
```

### Database Management
```bash
# Execute SQL commands
wrangler d1 execute recipe-search-db --command="SELECT COUNT(*) FROM nodes;"

# Execute SQL files
wrangler d1 execute recipe-search-db --file=./migration.sql
```

## 📈 Performance Considerations

### Indexing
- Primary keys on all tables
- Composite indexes for common query patterns
- Full-text search index on node properties

### Query Optimization
- Use prepared statements
- Limit result sets with pagination
- Filter by type when possible
- Use appropriate depth limits for graph traversal

### Scaling
- D1 automatically scales with Cloudflare's infrastructure
- Consider KV caching for frequently accessed data
- Use R2 for large search indexes if needed

## 🔒 Security

### Input Validation
- All inputs are validated and sanitized
- SQL injection protection through prepared statements
- JSON schema validation for properties

### Access Control
- CORS headers for cross-origin requests
- Rate limiting considerations
- Authentication can be added as needed

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Ensure all tests pass
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details

## 🆘 Support

For issues and questions:
1. Check the test suite for examples
2. Review the API documentation
3. Check Cloudflare D1 documentation
4. Open an issue in the repository

## 🔮 Future Enhancements

- **Real-time Updates**: WebSocket support for live data
- **Advanced Analytics**: Recipe popularity and trend analysis
- **Machine Learning**: Ingredient substitution suggestions
- **Social Features**: User ratings and reviews
- **Integration**: Connect with existing recipe databases
- **Mobile App**: Native mobile application support
