# User Management Worker

A dedicated Cloudflare Worker for handling user database operations, completely separated from authentication concerns.

## Overview

The User Management Worker is responsible for all user-related database operations including:

- **User CRUD Operations** - Create, read, update, delete users
- **User Profile Management** - Account status, type, verification status
- **Login History Tracking** - Comprehensive audit trail with location data
- **User Analytics** - Statistics and activity monitoring
- **Search and Filtering** - Find users by various criteria

## Architecture

This worker is designed to work alongside the Auth Worker, providing a clean separation of concerns:

```
┌─────────────────┐    ┌──────────────────────┐    ┌─────────────────┐
│   Auth Worker  │    │ User Management      │    │   USER_DB       │
│                 │    │ Worker               │    │   (D1)          │
│ • OTP Gen      │◄──►│ • User CRUD          │◄──►│ • users         │
│ • OTP Verify   │    │ • Profile Mgmt       │    │ • login_history │
│ • Auth Logic   │    │ • Login Tracking     │    │ • Views         │
└─────────────────┘    │ • Analytics         │    └─────────────────┘
                       └──────────────────────┘
```

## Features

### 🔐 **Passwordless Design**
- No password storage or management
- Authentication via OTP and magic links only
- Enhanced security through elimination of password-related vulnerabilities

### 👥 **User Management**
- Create, read, update, delete users
- Account status management (ACTIVE, SUSPENDED, DELETED)
- Account type tiers (FREE, PREMIUM, ADMIN)
- Email verification status tracking
- Two-factor authentication support

### 📊 **Login History & Analytics**
- Comprehensive login audit trail
- IP geolocation and device tracking
- Risk scoring for security analysis
- User activity statistics
- Location-based insights

### 🔍 **Search & Filtering**
- User search by email hash
- Filter users by status
- Paginated user listings
- Advanced query capabilities

## API Endpoints

### User Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/users` | Create new user |
| `GET` | `/users/:user_id` | Get user by ID |
| `GET` | `/users/email/:email_hash` | Get user by email hash |
| `PUT` | `/users/:user_id` | Update user |
| `DELETE` | `/users/:user_id` | Delete user |
| `GET` | `/users` | Get users with pagination |
| `GET` | `/users/search/:query` | Search users |
| `GET` | `/users/status/:status` | Get users by status |

### Culinary profile

These routes are user-owned and require the same Bearer JWT issued by the Auth Worker. The JWT subject is used as `user_id`; a caller cannot select another user's profile. The profile is optional and an empty profile is returned before the first save.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/me/culinary-profile` | Read the authenticated user's profile (or safe defaults) |
| `PUT` | `/me/culinary-profile` | Validate, normalize, and upsert the authenticated user's profile |

Profile fields include `diet_tags`, `hard_allergens`, `soft_avoids`, `cuisine_likes`, `cuisine_dislikes`, `spice_level` (0–5), `skill_level`, `default_servings`, `max_cook_time_min`, `equipment`, `nutrition_goals`, `units_pref`, `exclude_ingredients`, `notes_freeform`, and `consent_flags`. Lists are normalized to lower-case tags and duplicate values are removed.

Example update:

```json
{
  "diet_tags": ["vegetarian"],
  "hard_allergens": ["tree nuts", "sesame"],
  "max_cook_time_min": 30,
  "default_servings": 2,
  "units_pref": "metric"
}
```

The API is controlled by the `CULINARY_PROFILE_ENABLED` Worker variable. Set it to `false` to return 404 while retaining the additive schema. Configure `JWT_SECRET` as a Worker secret with the same value as Auth Worker (never commit it).

### Meal plan and grocery list

The meal planner and its grocery list are stored per user so a plan survives a sign-out, a
reinstalled PWA, cleared site data, or a sign-in from another device. Like the culinary
profile these routes require the Bearer JWT issued by the Auth Worker, and the JWT subject
is the only key — a caller cannot read or write another person's plan.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/me/meal-plan` | Read the authenticated user's plan (empty plan before the first save) |
| `PUT` | `/me/meal-plan` | Replace the plan and the Up Next staging list |
| `GET` | `/me/grocery-list` | Read the authenticated user's grocery list |
| `PUT` | `/me/grocery-list` | Replace the grocery list and its last-generated timestamp |

Both `PUT`s take `clientUpdatedAt`, the epoch-millisecond time of the edit as the client saw
it. A save whose timestamp predates the stored one is refused with `409` and the newer stored
document, so a stale tab reconnecting after hours offline cannot roll back an edit made on
another device; the client adopts what comes back. Snake_case aliases (`meal_plan`, `up_next`,
`client_updated_at`, `last_generated_at`) are accepted, and the payload may be sent bare or
wrapped in `plan` / `list`.

Example save:

```json
{
  "mealPlan": {
    "2026-03-02": { "breakfast": [], "lunch": [], "dinner": [{ "id": "r1", "name": "Miso Soup" }], "snack": [] }
  },
  "upNext": [{ "id": "r2", "name": "Ramen" }],
  "clientUpdatedAt": 1772409600000
}
```

Limits: 400 days, 50 recipes per meal slot, 200 staged recipes, 500 grocery items, 512 KB of
plan JSON and 256 KB of grocery JSON per account. The API is controlled by the
`MEAL_PLAN_SYNC_ENABLED` Worker variable; set it to `false` to return 404 while retaining the
additive schema.

### Login History

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/login-history` | Create login history record |
| `GET` | `/login-history/recent` | Get recent login activity |

### Analytics

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/users/:user_id/statistics` | Get user statistics |

### System

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check |
| `GET` | `/` | API documentation |

## Database Schema

The worker uses a simplified database schema with two main tables:

### `users` Table
- Core user information with hashed emails
- Account status and type management
- Verification and 2FA status tracking

### `user_login_history` Table
- Comprehensive login audit trail
- Location and device information
- Risk assessment and security metrics

## Setup Instructions

### 1. Install Dependencies

```bash
cd user-management-worker
npm install
```

### 2. Create D1 Database

```bash
# Create the database
wrangler d1 create user-db

# Apply the schema
wrangler d1 execute user-db --file=./schema.sql

# Existing environments: apply additive migrations in order
npm run migrate:profile:preview
```

### 3. Update Configuration

Update `wrangler.toml` with your database ID:

```toml
[[d1_databases]]
binding = "USER_DB"
database_name = "user-db"
database_id = "your_database_id_here"
```

### 4. Run Setup Script (Optional)

```bash
# Setup with test data
node setup-user-db.js --env=preview --create-test-data

# Setup for production
node setup-user-db.js --env=production
```

### 5. Deploy

```bash
# Deploy to preview
npm run deploy:preview

# Deploy to staging
npm run deploy:staging

# Deploy to production
npm run deploy:production
```

## Environment Variables

The worker supports multiple environments:

- **Preview** - Development and testing
- **Staging** - Pre-production testing
- **Production** - Live environment

Each environment has its own database binding and configuration.

## Usage Examples

### Creating a User

```typescript
const response = await fetch('https://user-management-worker.your-domain.workers.dev/users', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email_hash: 'sha256_hash_of_email',
    email_encrypted: 'encrypted_email_for_recovery',
    account_type: 'FREE'
  })
});

const result = await response.json();
```

### Recording Login History

```typescript
const response = await fetch('https://user-management-worker.your-domain.workers.dev/login-history', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    user_id: 'user_hash_id',
    ip_address: '192.168.1.100',
    country: 'US',
    city: 'New York',
    login_method: 'OTP',
    success: true,
    risk_score: 25
  })
});
```

### Getting User Statistics

```typescript
const response = await fetch('https://user-management-worker.your-domain.workers.dev/users/user_hash_id/statistics');
const stats = await response.json();
```

## Integration with Auth Worker

The Auth Worker should call the User Management Worker for user operations:

```typescript
// In Auth Worker - after successful OTP verification
const userResponse = await fetch('https://user-management-worker.your-domain.workers.dev/users', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email_hash: emailHash,
    account_type: 'FREE'
  })
});

// Record successful login
const loginResponse = await fetch('https://user-management-worker.your-domain.workers.dev/login-history', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    user_id: emailHash,
    login_method: 'OTP',
    success: true,
    ip_address: request.headers.get('CF-Connecting-IP')
  })
});
```

## Security Considerations

### Culinary profile privacy

Culinary profiles can contain sensitive dietary and allergy information. They are stored per user in D1, are only addressable through the authenticated `/me/culinary-profile` routes, and are not included in admin list or login-history responses. The generation constraint helper treats declared hard allergens as authoritative input; it does not infer or weaken them.

### Data Protection
- All emails are hashed (SHA-256) for user IDs
- Sensitive data is encrypted before storage
- No plain-text email storage

### Access Control
- Implement proper authentication for admin endpoints
- Rate limiting for API endpoints
- Input validation and sanitization

### Audit Trail
- Complete login history tracking
- Risk scoring for suspicious activity
- Device fingerprinting for anomaly detection

## Monitoring and Health Checks

### Health Endpoint
The `/health` endpoint provides:
- Database connectivity status
- Environment information
- Overall service health

### Metrics to Monitor
- API response times
- Database query performance
- Error rates and types
- User creation/deletion rates

## Development

### Local Development

```bash
# Start local development server
npm run dev

# Run tests
npm test

# Run tests with coverage
npm run test:coverage
```

### Testing

```bash
# Run unit tests
npm test

# Run tests in watch mode
npm test -- --watch

# Run specific test file
npm test -- user-database.test.ts
```

## Deployment

### Preview Environment
```bash
npm run deploy:preview
```

### Staging Environment
```bash
npm run deploy:staging
```

### Production Environment
```bash
npm run deploy:production
```

## Troubleshooting

### Common Issues

1. **Database Connection Errors**
   - Verify database ID in wrangler.toml
   - Check database permissions
   - Ensure database exists in target environment

2. **Schema Issues**
   - Run setup script to verify schema
   - Check for missing tables or indexes
   - Verify database version compatibility

3. **Performance Issues**
   - Check database query performance
   - Verify index usage with EXPLAIN QUERY PLAN
   - Monitor worker execution time

### Debug Queries

```sql
-- Check table structure
SELECT name FROM sqlite_master WHERE type='table';

-- Verify user data
SELECT * FROM users LIMIT 5;

-- Check login history
SELECT * FROM user_login_history ORDER BY login_timestamp DESC LIMIT 10;
```

## Contributing

1. Follow the existing code structure
2. Add tests for new functionality
3. Update documentation for API changes
4. Follow security best practices
5. Test in preview environment before staging/production

## License

This project follows the same license as the main recipe-app repository.

### Passkey database migration

Passkey credential and audit storage is added by `migrations/001_add_passkey_credentials.sql`.
Apply it once to each existing D1 environment **before** deploying the updated workers:

```sh
cd user-management-worker
npm run migrate:preview   # or migrate:staging / migrate:production
```

The migration is additive. Do not run `schema.sql` against a populated database because the
legacy setup script contains destructive `DROP TABLE` statements. Configure the same
`PASSKEY_SERVICE_TOKEN` secret on the auth and user-management workers for each deployed
environment.

### Meal plan database migration

Per-user meal plan and grocery list storage is added by `migrations/005_add_meal_plan_sync.sql`.
Apply it to each D1 environment **before** deploying the updated worker, otherwise the sync
routes answer 500 while the app keeps working from its local copy:

```sh
cd user-management-worker
npm run migrate:mealplan:preview   # or :staging / :production
```

The migration is additive: it creates `meal_plans` and `grocery_lists` and touches no existing
table.

### Passkey storage and internal access

Passkey credential routes (`/passkey-credentials/*`) and user-management data routes are
worker-internal. In deployed environments they require the `PASSKEY_SERVICE_TOKEN` secret
shared with `auth-worker`; local development bypasses this check. Apply the additive
`migrations/001_add_passkey_credentials.sql` migration before deploying passkey support.
