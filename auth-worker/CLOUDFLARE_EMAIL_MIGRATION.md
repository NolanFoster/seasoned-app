# Auth Worker: AWS SES → Cloudflare Email Migration Plan

> **Internal reference only — do NOT include this file in pull requests.**

---

## Table of Contents

1. [Overview](#1-overview)
2. [Prerequisites](#2-prerequisites)
3. [Cloudflare Dashboard Steps](#3-cloudflare-dashboard-steps)
4. [Code Changes Summary](#4-code-changes-summary)
5. [Secrets Cleanup](#5-secrets-cleanup)
6. [Deployment Checklist](#6-deployment-checklist)
7. [Rollback Plan](#7-rollback-plan)

---

## 1. Overview

### Why Migrate?

The auth worker currently uses AWS SES (`@aws-sdk/client-ses` and `@aws-sdk/credential-providers`) to send OTP verification emails from `verify@seasonedapp.com`. Migrating to Cloudflare Email provides the following benefits:

| Benefit | Details |
|---|---|
| **Eliminate AWS dependency** | The auth worker is a Cloudflare Worker — sending email through AWS requires an external network call, IAM credentials, and a separate billing relationship. Cloudflare Email is native to the platform. |
| **Reduce secrets management** | Removes `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` from every environment (preview, staging, production). The `send_email` binding is configured in `wrangler.toml` and requires zero runtime secrets. |
| **Native Cloudflare integration** | Uses Cloudflare's `send_email` Worker binding, which runs within the same infrastructure with lower latency and no cold-start overhead from the AWS SDK. |
| **Cost savings** | Eliminates AWS SES per-email charges and the overhead of bundling the AWS SDK (~500 KB+ minified) into the Worker. |
| **Smaller bundle size** | Replacing `@aws-sdk/client-ses` and `@aws-sdk/credential-providers` with the lightweight `mimetext` library (~15 KB) drastically reduces the Worker bundle. |

---

## 2. Prerequisites

Before starting the migration, ensure the following are in place:

- [ ] **Cloudflare account** with the domain `seasonedapp.com` active (already set up since the Worker is deployed there).
- [ ] **Email Routing enabled** for `seasonedapp.com` in the Cloudflare Dashboard (see Section 3).
- [ ] **Workers Paid plan** — required if using the Cloudflare Email Service (transactional email to any recipient).
- [ ] **Access to Cloudflare Dashboard** with permission to manage DNS records and Email Routing for `seasonedapp.com`.
- [ ] **`mimetext` npm package** available — this is used to construct RFC 5322-compliant MIME messages.

---

## 3. Cloudflare Dashboard Steps

### 3.1 Enable Email Routing for `seasonedapp.com`

1. Log in to the [Cloudflare Dashboard](https://dash.cloudflare.com).
2. Select the **`seasonedapp.com`** domain from the account home page.
3. In the left sidebar, click **Email** → **Email Routing**.
4. Click **Get started** (or **Enable Email Routing** if it's not yet active).
5. Cloudflare will prompt you to add the required DNS records automatically:
   - **MX record** — points incoming mail to Cloudflare's email infrastructure.
   - **SPF (TXT) record** — authorizes Cloudflare to send on behalf of `seasonedapp.com`.
6. Click **Add records and enable** to let Cloudflare configure these automatically.
7. Wait for DNS propagation (usually a few minutes since Cloudflare manages the zone).
8. Verify the Email Routing status shows **Active** on the Email Routing overview page.

### 3.2 Verify the Sender Address `verify@seasonedapp.com`

Since `seasonedapp.com` is already on Cloudflare, the domain-level Email Routing enablement covers sending from any address at that domain. However, for the `send_email` Worker binding:

1. Navigate to **Email** → **Email Routing** → **Routes** tab.
2. If you want to receive replies at `verify@seasonedapp.com`, create a routing rule:
   - Click **Create address**.
   - Set **Custom address** to `verify`.
   - Set **Action** to either **Drop** (since this is a no-reply verification sender) or forward to a monitoring mailbox.
   - Click **Save**.
3. For the Worker's `send_email` binding, the sender address is specified in code (via the MIME `From` header). As long as Email Routing is active for the domain, the binding will accept `verify@seasonedapp.com` as the sender.

### 3.3 Configure DNS Records for Email Deliverability

Good email deliverability requires three DNS records: **SPF**, **DKIM**, and **DMARC**. Navigate to **DNS** → **Records** for `seasonedapp.com` and verify or add the following:

#### SPF Record

Cloudflare adds this automatically when Email Routing is enabled. Verify it exists:

| Type | Name | Content |
|------|------|---------|
| TXT | `seasonedapp.com` | `v=spf1 include:_spf.mx.cloudflare.net ~all` |

If an existing SPF record exists from AWS SES (e.g., containing `include:amazonses.com`), update it to replace the Amazon include with the Cloudflare one:

```
v=spf1 include:_spf.mx.cloudflare.net ~all
```

> **Important:** There should only be one SPF TXT record per domain. Merge any existing includes if needed.

#### DKIM Record

Cloudflare Email Routing handles DKIM signing automatically when using the `send_email` binding. No manual DKIM key setup is required — Cloudflare signs outgoing messages with its own DKIM keys.

If you previously had AWS SES DKIM CNAME records (e.g., `*._domainkey.seasonedapp.com`), you can remove them after the migration is complete and verified.

#### DMARC Record

Add or update the DMARC record for `seasonedapp.com`:

| Type | Name | Content |
|------|------|---------|
| TXT | `_dmarc.seasonedapp.com` | `v=DMARC1; p=quarantine; rua=mailto:dmarc-reports@seasonedapp.com` |

This tells receiving mail servers to quarantine messages that fail SPF/DKIM checks and send aggregate reports to `dmarc-reports@seasonedapp.com`.

To verify DNS records are correct:

1. Go to **DNS** → **Records** in the Cloudflare Dashboard for `seasonedapp.com`.
2. Confirm the SPF TXT record exists and includes `_spf.mx.cloudflare.net`.
3. Confirm the DMARC TXT record exists at `_dmarc.seasonedapp.com`.
4. Optionally use an external tool like [MXToolbox](https://mxtoolbox.com/) to verify deliverability.

### 3.4 Cloudflare Email Service (Beta) — Optional

Cloudflare announced the **Email Service** in private beta (September 2025). This extends the `send_email` binding to support transactional email to **any recipient** (not just routed addresses). If you need to send OTP emails to arbitrary user email addresses, you will need this.

To request access:

1. Go to [Cloudflare Email Service Beta](https://www.cloudflare.com/lp/email-sending/) or search "Cloudflare Email Service beta" in the Dashboard.
2. Sign up for the waitlist / request beta access.
3. Once approved, the `send_email` binding will work for transactional emails to any external address.

**If the beta is not yet available:** The standard `send_email` binding with an **unrestricted** configuration (no `destination_address` attribute in `wrangler.toml`) allows sending to any address as long as Email Routing is active on the domain. Test this in the preview environment first.

### 3.5 The Unrestricted `send_email` Binding

The `[[send_email]]` binding in `wrangler.toml` can be configured in two ways:

1. **Restricted** — limits sending to specific destination addresses:
   ```toml
   [[send_email]]
   name = "SEND_EMAIL"
   destination_address = "specific@example.com"
   ```

2. **Unrestricted** — allows sending to any address (required for OTP emails):
   ```toml
   [[send_email]]
   name = "SEND_EMAIL"
   ```

For the auth worker, we need the **unrestricted** binding since OTP emails go to arbitrary user email addresses.

---

## 4. Code Changes Summary

### 4.1 New File: `src/services/email-service.ts`

Replace `src/services/ses-service.ts` with a new Cloudflare Email-based service.

```typescript
import { Env } from '../types/env';
import { EmailMessage } from 'cloudflare:email';
import { createMimeMessage } from 'mimetext';

export interface EmailOptions {
  to: string;
  subject: string;
  htmlBody: string;
  textBody?: string;
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export class EmailService {
  private fromEmail: string;
  private sendEmail: SendEmail;

  constructor(env: Env) {
    if (!env.SEND_EMAIL) {
      throw new Error('SEND_EMAIL binding not configured');
    }
    this.fromEmail = env.FROM_EMAIL || 'verify@seasonedapp.com';
    this.sendEmail = env.SEND_EMAIL;
  }

  async send(options: EmailOptions): Promise<SendEmailResult> {
    try {
      const { to, subject, htmlBody, textBody } = options;

      if (!to || !subject || !htmlBody) {
        return { success: false, error: 'Missing required email parameters' };
      }

      const msg = createMimeMessage();
      msg.setSender({ name: 'Seasoned', addr: this.fromEmail });
      msg.setRecipient(to);
      msg.setSubject(subject);
      msg.addMessage({ contentType: 'text/html', data: htmlBody });
      if (textBody) {
        msg.addMessage({ contentType: 'text/plain', data: textBody });
      }

      const message = new EmailMessage(this.fromEmail, to, msg.asRaw());
      await this.sendEmail.send(message);

      return { success: true, messageId: message.toString() };
    } catch (error) {
      console.error('Error sending email:', error);
      if (error instanceof Error) {
        return { success: false, error: `Email error: ${error.message}` };
      }
      return { success: false, error: 'Unknown error occurred while sending email' };
    }
  }

  async sendVerificationEmail(
    to: string,
    otp: string,
    otpExpiryMinutes: number = 10
  ): Promise<SendEmailResult> {
    const subject = 'Seasoned - Verify Your Email Address';
    const htmlBody = this.generateVerificationEmailHTML(to, otp, otpExpiryMinutes);
    const textBody = this.generateVerificationEmailText(to, otp, otpExpiryMinutes);
    return this.send({ to, subject, htmlBody, textBody });
  }

  // generateVerificationEmailHTML() — keep existing HTML template from ses-service.ts
  // generateVerificationEmailText() — keep existing text template from ses-service.ts
}
```

**Key differences from `SESService`:**
- No AWS SDK imports — uses `cloudflare:email` and `mimetext` instead.
- No credentials — the `SEND_EMAIL` binding handles authentication automatically.
- Uses `createMimeMessage()` from `mimetext` to build RFC 5322 MIME messages.
- Creates an `EmailMessage` from `cloudflare:email` and sends via the binding.

### 4.2 Remove AWS Dependencies

```bash
cd auth-worker
npm uninstall @aws-sdk/client-ses @aws-sdk/credential-providers
npm install mimetext
```

**Before** (`package.json` dependencies):
```json
{
  "@aws-sdk/client-ses": "^3.873.0",
  "@aws-sdk/credential-providers": "^3.873.0",
  "hono": "^4.5.0",
  "jose": "^5.2.3"
}
```

**After** (`package.json` dependencies):
```json
{
  "hono": "^4.5.0",
  "jose": "^5.2.3",
  "mimetext": "^3.0.0"
}
```

### 4.3 Update `wrangler.toml`

**Add** the `send_email` binding (unrestricted) to each environment:

```toml
# Top-level (applies to default/preview)
[[send_email]]
name = "SEND_EMAIL"
```

**Remove** `AWS_REGION` from `[vars]` in all environments.

**Updated `wrangler.toml`** (relevant sections):

```toml
name = "auth-worker"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[[kv_namespaces]]
binding = "OTP_KV"
id = "1fdebf1b59e249a691746f85a9eb5e62"

# Cloudflare Email binding (unrestricted — can send to any address)
[[send_email]]
name = "SEND_EMAIL"

[vars]
FROM_EMAIL = "verify@seasonedapp.com"
USER_MANAGEMENT_WORKER_URL = "https://user-management-worker.nolanfoster.workers.dev"

[observability]
enabled = true

# Preview environment
[env.preview]
name = "auth-worker-preview"

[[env.preview.kv_namespaces]]
binding = "OTP_KV"
id = "1fdebf1b59e249a691746f85a9eb5e62"

[[env.preview.send_email]]
name = "SEND_EMAIL"

[env.preview.observability]
enabled = true

# Staging environment
[env.staging]
name = "auth-worker-staging"

[env.staging.vars]
FROM_EMAIL = "verify@seasonedapp.com"
USER_MANAGEMENT_WORKER_URL = "https://user-management-worker.nolanfoster.workers.dev"

[[env.staging.kv_namespaces]]
binding = "OTP_KV"
id = "1fdebf1b59e249a691746f85a9eb5e62"

[[env.staging.send_email]]
name = "SEND_EMAIL"

[env.staging.observability]
enabled = true

# Production environment
[env.production]
name = "auth-worker-production"

[env.production.vars]
FROM_EMAIL = "verify@seasonedapp.com"
USER_MANAGEMENT_WORKER_URL = "https://user-management-worker.nolanfoster.workers.dev"

[[env.production.kv_namespaces]]
binding = "OTP_KV"
id = "1fdebf1b59e249a691746f85a9eb5e62"

[[env.production.send_email]]
name = "SEND_EMAIL"

[env.production.observability]
enabled = true
```

### 4.4 Update `src/types/env.ts`

**Before:**
```typescript
export interface Env {
  OTP_KV: KVNamespace;
  ENVIRONMENT: 'development' | 'preview' | 'staging' | 'production';
  USER_MANAGEMENT_WORKER_URL: string;

  // AWS SES configuration
  AWS_ACCESS_KEY_ID: string;
  AWS_SECRET_ACCESS_KEY: string;
  AWS_REGION?: string;
  FROM_EMAIL?: string;

  // JWT configuration
  JWT_SECRET: string;
}
```

**After:**
```typescript
export interface Env {
  OTP_KV: KVNamespace;
  ENVIRONMENT: 'development' | 'preview' | 'staging' | 'production';
  USER_MANAGEMENT_WORKER_URL: string;

  // Cloudflare Email binding
  SEND_EMAIL: SendEmail;
  FROM_EMAIL?: string;

  // JWT configuration
  JWT_SECRET: string;
}
```

**Changes:**
- Remove `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and `AWS_REGION`.
- Add `SEND_EMAIL: SendEmail` — the `SendEmail` type is provided by `@cloudflare/workers-types`.

### 4.5 Update `src/index.ts`

Replace all references to `SESService` with `EmailService`:

**Import change:**
```typescript
// Before
import { SESService } from './services/ses-service';

// After
import { EmailService } from './services/email-service';
```

**Usage changes in `/otp/generate` endpoint:**
```typescript
// Before
const sesService = new SESService(c.env);
const emailResult = await sesService.sendVerificationEmail(email, result.otp, 10);

// After
const emailService = new EmailService(c.env);
const emailResult = await emailService.sendVerificationEmail(email, result.otp, 10);
```

**Usage changes in `/email/send-verification` endpoint:**
```typescript
// Before
const sesService = new SESService(c.env);
const result = await sesService.sendVerificationEmail(email, otp, expiryMinutes);

// After
const emailService = new EmailService(c.env);
const result = await emailService.sendVerificationEmail(email, otp, expiryMinutes);
```

**Update `/health` endpoint:**
```typescript
// Before
try {
  if (env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY) {
    health.services.ses = 'healthy';
  } else {
    health.services.ses = 'unhealthy';
    health.status = 'degraded';
  }
}

// After — rename 'ses' to 'email' in health.services
try {
  if (env.SEND_EMAIL) {
    health.services.email = 'healthy';
  } else {
    health.services.email = 'unhealthy';
    health.status = 'degraded';
  }
}
```

Also remove any log messages referencing "SES" and replace with "email".

### 4.6 Update Tests

**Delete** `tests/ses-service.test.ts` and create `tests/email-service.test.ts`.

The new test file should mock `cloudflare:email` and `mimetext` instead of `@aws-sdk/client-ses`. The test structure remains similar:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EmailService } from '../src/services/email-service';

// Mock cloudflare:email
vi.mock('cloudflare:email', () => ({
  EmailMessage: vi.fn().mockImplementation((from, to, raw) => ({
    from, to, raw,
    toString: () => 'mock-message-id'
  }))
}));

// Mock environment with SEND_EMAIL binding
const mockSendEmail = { send: vi.fn().mockResolvedValue(undefined) };

const mockEnv = {
  SEND_EMAIL: mockSendEmail,
  FROM_EMAIL: 'verify@seasonedapp.com',
  OTP_KV: {} as any,
  ENVIRONMENT: 'development' as const,
  USER_MANAGEMENT_WORKER_URL: 'http://localhost:8787',
  JWT_SECRET: 'test-jwt-secret'
};

describe('EmailService', () => {
  let emailService: EmailService;

  beforeEach(() => {
    vi.clearAllMocks();
    emailService = new EmailService(mockEnv);
  });

  describe('constructor', () => {
    it('should throw when SEND_EMAIL binding is missing', () => {
      expect(() => {
        new EmailService({ ...mockEnv, SEND_EMAIL: undefined as any });
      }).toThrow('SEND_EMAIL binding not configured');
    });
  });

  // ... validation tests, sendVerificationEmail tests, template tests
  // (same structure as existing ses-service.test.ts)
});
```

Also update `tests/unit/endpoints.test.ts`, `tests/unit/otp-endpoints.test.ts`, and `tests/unit/health.test.ts` to reference `SEND_EMAIL` instead of AWS env vars.

### 4.7 Files Changed Summary

| File | Action |
|------|--------|
| `src/services/ses-service.ts` | **Delete** |
| `src/services/email-service.ts` | **Create** (new Cloudflare Email service) |
| `src/types/env.ts` | **Modify** (remove AWS types, add `SEND_EMAIL`) |
| `src/index.ts` | **Modify** (replace `SESService` with `EmailService`) |
| `wrangler.toml` | **Modify** (add `send_email` binding, remove `AWS_REGION`) |
| `package.json` | **Modify** (remove AWS deps, add `mimetext`) |
| `tests/ses-service.test.ts` | **Delete** |
| `tests/email-service.test.ts` | **Create** (new tests) |
| `tests/unit/endpoints.test.ts` | **Modify** (update mock env) |
| `tests/unit/otp-endpoints.test.ts` | **Modify** (update mock env) |
| `tests/unit/health.test.ts` | **Modify** (update health check assertions) |

---

## 5. Secrets Cleanup

After the migration is deployed and verified on all environments, remove the AWS secrets from Cloudflare:

### Preview Environment

```bash
wrangler secret delete AWS_ACCESS_KEY_ID --env preview
wrangler secret delete AWS_SECRET_ACCESS_KEY --env preview
```

### Staging Environment

```bash
wrangler secret delete AWS_ACCESS_KEY_ID --env staging
wrangler secret delete AWS_SECRET_ACCESS_KEY --env staging
```

### Production Environment

```bash
wrangler secret delete AWS_ACCESS_KEY_ID --env production
wrangler secret delete AWS_SECRET_ACCESS_KEY --env production
```

### Default Environment (if secrets were set without `--env`)

```bash
wrangler secret delete AWS_ACCESS_KEY_ID
wrangler secret delete AWS_SECRET_ACCESS_KEY
```

### AWS-Side Cleanup (After Migration is Stable)

Once the migration has been running successfully for at least 2 weeks:

1. **Deactivate the IAM access key** in the AWS Console (IAM → Users → select user → Security credentials → deactivate the key). Do not delete yet.
2. **Wait another week** to confirm nothing breaks.
3. **Delete the IAM access key** from AWS.
4. **Review the IAM user** — if it was only used for SES, delete the IAM user entirely.
5. **Remove the SES verified domain** `seasonedapp.com` from AWS SES if no other services use it.

---

## 6. Deployment Checklist

Follow this order to safely deploy the migration:

### Phase 1: Preparation

- [ ] Enable Email Routing for `seasonedapp.com` in Cloudflare Dashboard (Section 3.1).
- [ ] Verify DNS records are correct — SPF, DKIM, DMARC (Section 3.3).
- [ ] Confirm `send_email` unrestricted binding is supported for your plan (Section 3.5).

### Phase 2: Code Changes

- [ ] Create `src/services/email-service.ts` with Cloudflare Email implementation.
- [ ] Update `src/types/env.ts` to remove AWS types and add `SEND_EMAIL`.
- [ ] Update `src/index.ts` to use `EmailService` instead of `SESService`.
- [ ] Update `wrangler.toml` to add `[[send_email]]` bindings and remove `AWS_REGION`.
- [ ] Run `npm uninstall @aws-sdk/client-ses @aws-sdk/credential-providers`.
- [ ] Run `npm install mimetext`.
- [ ] Delete `src/services/ses-service.ts`.
- [ ] Update all test files (delete `tests/ses-service.test.ts`, create `tests/email-service.test.ts`, update unit tests).
- [ ] Run `npm test` — all tests must pass.
- [ ] Run `npm run type-check` — no TypeScript errors.
- [ ] Run `npm run lint` — no lint errors.

### Phase 3: Deploy to Preview

- [ ] Deploy: `npm run deploy:preview`
- [ ] Test the `/health` endpoint to confirm the email service is healthy.
- [ ] Test OTP generation: `POST /otp/generate` with a real email address.
- [ ] Verify the OTP email is received with correct formatting.
- [ ] Test the full flow: generate OTP → receive email → verify OTP → get JWT.
- [ ] Check email headers for proper SPF/DKIM alignment using an email testing tool.

### Phase 4: Deploy to Staging

- [ ] Deploy: `npm run deploy:staging`
- [ ] Repeat all tests from Phase 3 on staging.
- [ ] Run the deployed test suite: `npm run test:deployed -- --env staging`
- [ ] Monitor Cloudflare Workers logs: `npm run tail:staging`
- [ ] Soak for at least 24 hours on staging.

### Phase 5: Deploy to Production

- [ ] Deploy: `npm run deploy:production`
- [ ] Repeat all tests from Phase 3 on production.
- [ ] Run the deployed test suite: `npm run test:deployed -- --env production`
- [ ] Monitor Cloudflare Workers logs: `npm run tail:production`
- [ ] Monitor email delivery rates and bounce rates in Cloudflare Dashboard.

### Phase 6: Cleanup

- [ ] Delete AWS secrets from all environments (Section 5).
- [ ] Remove AWS SES DKIM CNAME records from DNS (after 1 week).
- [ ] Update SPF record to remove `include:amazonses.com` if present.
- [ ] Deactivate and eventually delete the AWS IAM access key.
- [ ] Delete `AWS_SES_SETUP.md` from the repository (no longer relevant).

---

## 7. Rollback Plan

If the Cloudflare Email migration fails or emails are not being delivered:

### Immediate Rollback (< 5 minutes)

1. **Revert the code** to the last known good commit:
   ```bash
   git log --oneline -5  # Find the pre-migration commit hash
   git revert HEAD        # Or revert specific commits
   git push
   ```

2. **Redeploy the previous version** to the affected environment:
   ```bash
   npm run deploy:production  # or whichever environment
   ```

3. **Re-add AWS secrets** if they were already deleted:
   ```bash
   wrangler secret put AWS_ACCESS_KEY_ID --env production
   wrangler secret put AWS_SECRET_ACCESS_KEY --env production
   ```

### Why This Works

- The rollback simply restores the SES-based code, which will use the existing AWS credentials.
- AWS SES verified domain configuration persists independently of the Worker code.
- No DNS changes are destructive — adding Cloudflare Email Routing records does not break SES.

### Preventing the Need for Rollback

- Deploy to preview first and test thoroughly.
- Use staging for a 24-hour soak test before production.
- Keep AWS secrets in place for at least 2 weeks after the production migration.
- Do NOT delete the AWS IAM credentials or SES domain verification until the migration is confirmed stable.

### Monitoring Checklist Post-Deploy

- [ ] Watch for increased error rates in Cloudflare Workers analytics.
- [ ] Check that email delivery latency is acceptable (< 5 seconds).
- [ ] Verify no emails are landing in spam folders (test with Gmail, Outlook, Yahoo).
- [ ] Confirm bounce/complaint rates stay below 1%.
- [ ] Monitor the `/health` endpoint for degraded status.
