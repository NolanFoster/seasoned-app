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
