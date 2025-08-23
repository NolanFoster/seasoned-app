# Auth Worker

A focused Cloudflare Worker for handling OTP-based authentication, completely separated from user management concerns.

## Overview

The Auth Worker is responsible for authentication operations only:

- **OTP Generation** - Create and store one-time passwords
- **OTP Verification** - Validate OTPs and authenticate users
- **Authentication Flow** - Manage the complete OTP lifecycle
- **Integration** - Coordinate with User Management Worker for user operations

## Architecture

This worker is designed to work alongside the User Management Worker, providing a clean separation of concerns:

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

### 🔐 **OTP Authentication**
- Generate secure one-time passwords
- Store OTPs in Cloudflare KV with TTL
- Verify OTPs with rate limiting
- Automatic cleanup of expired OTPs

### 🔗 **User Management Integration**
- Seamless integration with User Management Worker
- Automatic user creation on first successful authentication
- Login history recording
- No direct database operations

### 🛡️ **Security Features**
- Rate limiting on OTP attempts
- Secure OTP hashing with salt
- Automatic expiration and cleanup
- No password storage

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check and service status |
| `POST` | `/otp/generate` | Generate and store OTP for email |
| `POST` | `/otp/verify` | Verify OTP and authenticate user |

## Setup Instructions

### 1. Install Dependencies

```bash
cd auth-worker
npm install
```

### 2. Configure KV Namespace

Create a KV namespace for OTP storage:

```bash
wrangler kv:namespace create "OTP_KV"
```

### 3. Update Configuration

Update `wrangler.toml` with your KV namespace ID and User Management Worker URL:

```toml
[[kv_namespaces]]
binding = "OTP_KV"
id = "your_kv_namespace_id"

[vars]
USER_MANAGEMENT_WORKER_URL = "https://user-management-worker.your-domain.workers.dev"
```

### 4. Deploy

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

Each environment has its own KV namespace binding and User Management Worker URL.

## Usage Examples

### Generate OTP

```typescript
const response = await fetch('https://auth-worker.your-domain.workers.dev/otp/generate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'user@example.com'
  })
});

const result = await response.json();
// result.otp contains the generated OTP
```

### Verify OTP

```typescript
const response = await fetch('https://auth-worker.your-domain.workers.dev/otp/verify', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'user@example.com',
    otp: '123456'
  })
});

const result = await response.json();
if (result.success) {
  // User authenticated successfully
  // User data is automatically managed by User Management Worker
}
```

## Authentication Flow

### 1. OTP Generation
1. User requests OTP for email
2. Auth Worker generates secure OTP
3. OTP is hashed and stored in KV with expiration
4. OTP is returned to user (or sent via email)

### 2. OTP Verification
1. User submits OTP for verification
2. Auth Worker validates OTP against stored hash
3. If valid, OTP is deleted from KV
4. Auth Worker calls User Management Worker to:
   - Create new user (if first time)
   - Record successful login
5. User receives authentication success

### 3. User Management Integration
- User creation and updates handled by User Management Worker
- Login history automatically recorded
- No direct database operations in Auth Worker

## Security Considerations

### OTP Security
- OTPs are hashed with salt before storage
- Automatic expiration (default: 5 minutes)
- Rate limiting on verification attempts
- Secure cleanup of expired OTPs

### Integration Security
- User Management Worker calls use HTTPS
- No sensitive user data stored in Auth Worker
- Authentication failures don't expose user information

## Monitoring and Health Checks

### Health Endpoint
The `/health` endpoint provides:
- KV storage connectivity status
- User Management Worker connectivity
- Environment information
- Overall service health

### Metrics to Monitor
- OTP generation and verification rates
- Authentication success/failure rates
- KV storage performance
- User Management Worker response times

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
npm test -- otp-manager.test.ts
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

1. **KV Connection Errors**
   - Verify KV namespace ID in wrangler.toml
   - Check KV namespace permissions
   - Ensure namespace exists in target environment

2. **User Management Worker Integration**
   - Verify User Management Worker URL
   - Check User Management Worker health
   - Ensure both workers are deployed to same environment

3. **OTP Issues**
   - Check OTP expiration settings
   - Verify rate limiting configuration
   - Monitor KV storage performance

### Debug Queries

```bash
# Check KV namespace contents
wrangler kv:key list --binding=OTP_KV

# Check worker logs
wrangler tail --env=preview
```

## Contributing

1. Follow the existing code structure
2. Add tests for new functionality
3. Update documentation for API changes
4. Follow security best practices
5. Test in preview environment before staging/production

## License

This project follows the same license as the main recipe-app repository.