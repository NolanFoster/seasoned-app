# Auth Worker Cloudflare Email Notes

`auth-worker` now sends OTP emails through Cloudflare Email Workers using the `send_email` binding.

## Runtime contract

- Service: `EmailService` (`src/services/email-service.ts`)
- Binding: `env.send_email.send(message)`
- Message type: `EmailMessage` from `cloudflare:email`
- Message format: MIME generated via `mimetext`

## Required configuration

1. Keep `FROM_EMAIL` configured in `wrangler.toml`.
2. Configure `send_email` in default + each environment block:
   - `[[send_email]]`
   - `[[env.preview.send_email]]`
   - `[[env.staging.send_email]]`
   - `[[env.production.send_email]]`
3. Ensure Cloudflare Email Routing is enabled for the sender domain.

## Health endpoint behavior

`GET /health` reports email service status at:

```json
{
  "services": {
    "email": "healthy"
  }
}
```
