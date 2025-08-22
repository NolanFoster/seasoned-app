# Auth Worker

Authentication worker for user management with Cloudflare KV store and D1 database.

## Features

- Health check endpoint with service status monitoring
- KV store integration for session/cache management
- D1 database integration for user data persistence
- CORS enabled
- Request logging
- Error handling

## Prerequisites

- Node.js 20+
- Wrangler CLI (`npm install -g wrangler`)
- Cloudflare account

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Create KV namespaces:**
   ```bash
   # Preview environment
   wrangler kv:namespace create "AUTH_KV" --preview
   
   # Staging environment
   wrangler kv:namespace create "AUTH_KV" --env staging
   
   # Production environment
   wrangler kv:namespace create "AUTH_KV" --env production
   ```

3. **Create D1 databases:**
   ```bash
   # Preview database
   wrangler d1 create auth-db-preview
   
   # Staging database
   wrangler d1 create auth-db-staging
   
   # Production database
   wrangler d1 create auth-db-production
   ```

4. **Update wrangler.toml:**
   Replace the placeholder IDs in `wrangler.toml` with the actual IDs from the previous commands.

5. **Initialize D1 schema (optional):**
   ```bash
   # Create your schema file (e.g., schema.sql)
   # Then run:
   wrangler d1 execute auth-db-preview --file=./schema.sql --env preview
   ```

## Development

- **Start local development:**
  ```bash
  npm run dev
  ```

- **Run tests:**
  ```bash
  npm test
  ```

- **Run tests with coverage:**
  ```bash
  npm run test:coverage
  ```

- **Lint code:**
  ```bash
  npm run lint
  ```

- **Type check:**
  ```bash
  npm run type-check
  ```

## Endpoints

### `GET /`
Returns worker information and available endpoints.

### `GET /health`
Health check endpoint that verifies:
- KV namespace connectivity
- D1 database connectivity
- Overall service health

Response format:
```json
{
  "status": "healthy|degraded|unhealthy",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "environment": "preview|staging|production",
  "services": {
    "kv": "healthy|unhealthy|unknown",
    "d1": "healthy|unhealthy|unknown"
  }
}
```

## Deployment

Deployments are handled automatically via Cloudflare's GitHub integration:
- `main` branch → Production
- `staging` branch → Staging
- `develop` branch → Preview

Manual deployment:
```bash
# Deploy to preview
npm run deploy:preview

# Deploy to staging
npm run deploy:staging

# Deploy to production
npm run deploy:production
```

## Monitoring

View real-time logs:
```bash
# Preview logs
npm run tail:preview

# Staging logs
npm run tail:staging

# Production logs
npm run tail:production
```

## Environment Variables

- `ENVIRONMENT`: Set automatically based on deployment environment
- KV namespace and D1 database bindings are configured in `wrangler.toml`

## Testing

The project uses Vitest with Miniflare for testing. Tests are located in the `tests/` directory.

Coverage thresholds are set to 80% for:
- Lines
- Functions
- Branches
- Statements

## License

ISC