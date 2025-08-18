
# Seasoned

A modern recipe management application with SQLite backend and image upload support, built with React frontend and Cloudflare Workers backend.

## Features

- ✨ **Recipe Management**: Create, read, update, and delete recipes
- 🖼️ **Image Upload**: Upload and store recipe images using Cloudflare R2
- 📋 **Recipe Clipping**: Automatically extract recipes from recipe websites with AI
- 💾 **SQLite Database**: Persistent storage using Cloudflare D1
- 🎨 **Modern UI**: Beautiful glassmorphism design with responsive layout
- 🔄 **Real-time Updates**: Instant updates across the application
- 🚀 **Smart Caching**: KV-based caching for improved performance and cost savings
- 📚 **Shared Libraries**: Reusable utilities across multiple workers

## Architecture

- **Frontend**: React with Vite
- **Backend**: Cloudflare Workers
- **Database**: Cloudflare D1 (SQLite)
- **Storage**: Cloudflare R2 for images
- **KV Storage**: Cloudflare KV for recipe caching
- **Shared Libraries**: Common utilities shared across workers
- **Deployment**: Cloudflare Workers

## Development Workflow

### Testing and Staging Deployment

This project follows a strict testing and staging deployment workflow to ensure code quality:

1. **Always Test First**: All code changes must pass tests before committing
2. **Feature Branches**: Work on feature branches, never directly on main
3. **Staging Validation**: Changes must be validated in staging before production
4. **Automated Testing**: Pre-commit hooks and GitHub Actions enforce testing

#### Quick Start

1. Install the pre-commit hook:
   ```bash
   ./.github/hooks/install-hooks.sh
   ```

2. Make your changes and commit (tests run automatically)

3. Push to staging when ready:
   ```bash
   ./push-to-staging.sh
   ```

4. After staging validation, create a PR to main

For detailed workflow rules, see `.cursorrules` in the project root.

## Setup Instructions

### Prerequisites

- Node.js 18+ installed
- Cloudflare account
- Wrangler CLI installed (`npm install -g wrangler`)

### 1. Backend Setup

Navigate to the `clipped-recipe-db-worker` directory:

```bash
cd clipped-recipe-db-worker
```

Install dependencies:

```bash
npm install
```

#### Create D1 Database

```bash
npm run db:create
```

Copy the `database_id` from the output and update `wrangler.toml`.

#### Create R2 Bucket

```bash
npm run r2:create
```

#### Apply Database Schema

```bash
npm run db:migrate
```

#### Deploy Worker

```bash
npm run deploy
```

### 2. Frontend Setup

Navigate to the `frontend` directory:

```bash
cd frontend
```

Install dependencies:

```bash
npm install
```

Update the API URLs in your environment file (`frontend/.env.local`):

```bash
VITE_API_URL=https://your-worker.your-subdomain.workers.dev
VITE_CLIPPER_API_URL=https://your-clipper-worker.your-subdomain.workers.dev
```

Start development server:

```bash
npm run dev
```

### 3. Configuration

**Important**: This project now uses environment variables to avoid hardcoded URLs and sensitive information. See [ENVIRONMENT_SETUP.md](ENVIRONMENT_SETUP.md) for detailed setup instructions.

#### Environment Variables Setup

1. **Copy example environment files:**
   ```bash
   # Worker
   cp clipped-recipe-db-worker/.dev.vars.example clipped-recipe-db-worker/.dev.vars.local
   
   # Frontend  
   cp frontend/.env.example frontend/.env.local
   ```

2. **Update the files with your actual values**

3. **Never commit these files** - they're already in `.gitignore`

#### Update wrangler.toml

Replace the placeholder values in `clipped-recipe-db-worker/wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "recipe-db"
database_id = "your_actual_d1_database_id_here"

[[r2_buckets]]
binding = "IMAGES"
bucket_name = "recipe-images"
```

#### Configure R2 Public Access (Optional)

If you want direct image URLs:

1. Go to Cloudflare Dashboard > R2 > recipe-images
2. Enable public access
3. Update the image URL in `clipped-recipe-db-worker/src/index.js`:

```javascript
return `https://your-custom-domain.com/${fileName}`;
```

## API Endpoints

### Recipes

- `GET /recipes` - Get all recipes
- `GET /recipe/:id` - Get recipe by ID
- `POST /recipe` - Create new recipe
- `PUT /recipe/:id` - Update recipe
- `DELETE /recipe/:id` - Delete recipe

### Image Upload

- `POST /upload-image` - Upload recipe image (multipart/form-data)

### Recipe Clipping

- `POST /clip` - Extract recipe from URL

## Database Schema

```sql
CREATE TABLE recipes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    ingredients TEXT NOT NULL, -- JSON array as text
    instructions TEXT NOT NULL, -- JSON array as text
    image_url TEXT,
    source_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## Development

### Backend Development

```bash
cd clipped-recipe-db-worker
npm run dev
```

### Frontend Development

```bash
cd frontend
npm run dev
```

### Database Operations

```bash
# View database
wrangler d1 execute recipe-db --command="SELECT * FROM recipes;"

# Reset database
wrangler d1 execute recipe-db --file=./schema.sql
```

## Deployment

### Backend

```bash
cd clipped-recipe-db-worker
npm run deploy
```

### Frontend

The frontend is configured for deployment to **Cloudflare Pages** with multiple environment support.

#### Prerequisites

1. **Install Wrangler CLI** (if not already installed):
   ```bash
   npm install -g wrangler
   ```

2. **Login to Cloudflare**:
   ```bash
   wrangler login
   ```

#### Deploy to Cloudflare Pages

**Quick Deploy** (default environment):
```bash
cd frontend
npm run deploy
```

**Deploy to Staging**:
```bash
cd frontend
npm run deploy:staging
```

**Deploy to Production**:
```bash
cd frontend
npm run deploy:prod
```

#### What Happens During Deployment

1. **Build**: Runs `npm run build` to create optimized production files in `dist/` folder
2. **Deploy**: Uses `wrangler pages deploy dist` to upload to Cloudflare Pages
3. **URL**: 
   - **Production** (main branch): `https://seasoned-frontend.pages.dev`
   - **Staging** (staging branch): `https://seasoned-frontend.pages.dev` (preview deployment)
   - **Custom domain** if configured

#### Alternative Deployment Options

If you prefer other hosting services, you can build manually and deploy the `dist/` folder:

```bash
cd frontend
npm run build
```

Then upload the `dist/` folder contents to:
- **Netlify**: Drag and drop the `dist` folder
- **Vercel**: Connect your repo for auto-deployment
- **GitHub Pages**: Push to `gh-pages` branch
- **Any static hosting**: Upload `dist` folder contents

#### Environment Configuration

Before deploying, ensure your environment variables are set in `frontend/.env.local`:

```bash
VITE_API_URL=https://your-worker.your-subdomain.workers.dev
VITE_CLIPPER_API_URL=https://your-clipper-worker.your-subdomain.workers.dev
```

#### Local Preview

Preview your production build locally before deploying:

```bash
cd frontend
npm run build
npm run preview
```

## Troubleshooting

### Common Issues

1. **Database Connection Error**: Ensure D1 database is created and ID is correct in `wrangler.toml`
2. **Image Upload Fails**: Check R2 bucket permissions and binding
3. **CORS Errors**: Verify CORS headers are properly set in the worker
4. **Recipe Not Found**: Check if the database schema was applied correctly

### Debug Mode

Enable debug logging in the worker by adding console.log statements or using Wrangler's built-in logging:

```bash
wrangler tail
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Documentation

- [Worker Coverage Setup](WORKER_COVERAGE_SETUP.md) - Details on test coverage for workers
- [Environment Setup](ENVIRONMENT_SETUP.md) - Setting up your development environment
- [Deployment Setup](DEPLOYMENT_SETUP.md) - Deploying to Cloudflare
- [Branch Strategy](BRANCH_STRATEGY.md) - Git workflow and branching
- [Staging Setup](STAGING_SETUP.md) - Setting up staging environment with database isolation

## Support

For issues and questions:
- Check the troubleshooting section
- Review Cloudflare Workers documentation
- Open an issue on GitHub
