# AWS SES Setup for Auth Worker

This document explains how to set up AWS SES (Simple Email Service) for sending verification emails in the auth-worker.

## Current Status ✅

- ✅ AWS SDK for JavaScript v3 installed and configured
- ✅ SES service implemented with proper error handling
- ✅ Worker deployed and endpoints working
- ✅ AWS credentials configured as Cloudflare secrets

## Next Steps Required 🚀

### 1. Verify Email Addresses in AWS SES

**IMPORTANT**: Before you can send emails, you must verify both the sender and recipient email addresses in AWS SES.

#### Verify Sender Email:
1. Go to [AWS SES Console](https://console.aws.amazon.com/ses/)
2. Navigate to "Verified identities" in the left sidebar
3. Click "Create identity"
4. Choose "Email address"
5. Enter: `noreply@nolanfoster.com` (your configured FROM_EMAIL)
6. Click "Create identity"
7. Check your email for a verification link and click it

#### Verify Test Recipient Email:
1. In the same SES Console, create another verified identity
2. Enter your own email address (e.g., `your-email@gmail.com`)
3. Verify it by clicking the link in your email

### 2. Test Email Functionality

Once both emails are verified, test the functionality:

```bash
# Test with verified email addresses
TEST_ENV=production node test-email.js your-verified-email@gmail.com 123456 15
```

### 3. Request Production Access (Optional)

If you want to send emails to unverified addresses:
1. In AWS SES Console, go to "Account dashboard"
2. Click "Request production access"
3. Fill out the form explaining your use case
4. Wait for AWS approval (usually 24-48 hours)

## Prerequisites

1. AWS Account with SES access
2. Cloudflare Workers environment with secret management
3. Verified domain or email address in SES

## AWS SES Configuration

### 1. Set up SES in AWS Console

1. Go to AWS SES Console
2. Verify your domain or email address
3. Request production access if needed (for sending to non-verified addresses)
4. Note your AWS region

### 2. Create IAM User for SES

1. Go to IAM Console
2. Create a new user with programmatic access
3. Attach the `AmazonSESFullAccess` policy (or create a custom policy with minimal permissions)
4. Save the Access Key ID and Secret Access Key

### 3. Configure Cloudflare Secrets

The following secrets are already configured in your Cloudflare Workers environment:

```bash
# AWS credentials (already set)
wrangler secret put AWS_ACCESS_KEY_ID
wrangler secret put AWS_SECRET_ACCESS_KEY
```

## Environment Variables

The following environment variables are configured:

| Variable | Value | Description |
|----------|-------|-------------|
| `AWS_ACCESS_KEY_ID` | ✅ Set | AWS access key for SES |
| `AWS_SECRET_ACCESS_KEY` | ✅ Set | AWS secret key for SES |
| `AWS_REGION` | `us-east-1` | AWS region for SES |
| `FROM_EMAIL` | `noreply@nolanfoster.com` | Sender email address |

## Usage

### Automatic Email Sending

When generating an OTP in production environment, verification emails are automatically sent:

```typescript
// POST /otp/generate
{
  "email": "user@example.com"
}
```

### Manual Email Sending

You can also send verification emails manually:

```typescript
// POST /email/send-verification
{
  "email": "user@example.com",
  "otp": "123456",
  "expiryMinutes": 10
}
```

## Email Templates

The service generates both HTML and text versions of verification emails with:

- Professional styling
- Clear OTP display
- Expiry information
- Security warnings
- Responsive design

## Testing

### Development Environment

In development/preview environments, OTPs are returned in the response for testing purposes.

### Production Environment

In production, OTPs are never returned in responses - only sent via email.

## Monitoring

The health check endpoint (`/health`) includes SES service status:

```json
{
  "status": "healthy",
  "services": {
    "ses": "healthy"
  }
}
```

## Troubleshooting

### Common Issues

1. **Unauthorized error**: Check AWS credentials and permissions
2. **Email not received**: Check spam folder, verify sender email
3. **SES quota exceeded**: Request production access or increase limits
4. **Identity not verified**: Verify both sender and recipient emails in SES Console

### Debug Logging

Check Cloudflare Workers logs for detailed error information:

```bash
wrangler tail auth-worker
```

### Test SES Configuration

Use the setup script to verify your AWS SES configuration:

```bash
# Set AWS credentials as environment variables first
export AWS_ACCESS_KEY_ID=your_access_key
export AWS_SECRET_ACCESS_KEY=your_secret_key

# Then run the setup script
node setup-ses.js
```

## Security Considerations

1. **Credentials**: Never commit AWS credentials to version control
2. **Permissions**: Use least-privilege IAM policies
3. **Rate Limiting**: Implement rate limiting for email endpoints
4. **Validation**: Always validate email addresses and OTPs

## Cost Optimization

1. **SES Pricing**: Monitor email sending costs
2. **Batching**: Consider batching emails for bulk operations
3. **Templates**: Use SES templates for consistent formatting
4. **Monitoring**: Set up CloudWatch alarms for costs and errors
