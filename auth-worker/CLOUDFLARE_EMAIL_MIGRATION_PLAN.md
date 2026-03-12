# Auth Worker Email Migration Plan: AWS SES -> Cloudflare Email Workers

This runbook describes how to migrate `auth-worker` email sending from AWS SES to Cloudflare Email Workers with minimal risk and clear rollback points.

## 1) Current state inventory (what exists today)

Based on current `auth-worker` config/docs:

- Email provider: AWS SES (`src/services/ses-service.ts`).
- Runtime bindings/secrets currently expected:
  - Secrets: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`
  - Vars: `AWS_REGION`, `FROM_EMAIL`
- Health endpoint currently reports SES status by checking AWS credentials (`src/index.ts`).
- Environments in `wrangler.toml`:
  - `preview` (`auth-worker-preview`)
  - `staging` (`auth-worker-staging`)
  - `production` (`auth-worker-production`)
- Existing SES setup doc: `auth-worker/AWS_SES_SETUP.md`.

## 2) Target architecture (post-migration)

### Desired flow

1. Client requests OTP (`POST /otp/generate`).
2. Auth Worker generates and stores OTP in KV.
3. Auth Worker sends OTP via Cloudflare `send_email` binding (instead of AWS SDK call).
4. Cloudflare Email Routing handles outbound delivery.
5. Auth Worker keeps current OTP verification and user-management flow unchanged.

### Architecture changes

- Remove dependency on AWS credentials and SES region config.
- Add Cloudflare Email Routing configuration at zone level.
- Add `send_email` binding to Auth Worker in each environment.
- Keep `FROM_EMAIL` (or equivalent) as the sender address, but ensure it belongs to the Cloudflare Email Routing-enabled domain.

## 3) Cloudflare Dashboard setup (explicit steps)

> Perform these steps in the Cloudflare zone that owns the sender domain (for example, the domain used by `FROM_EMAIL`).

### A. Zone/domain prerequisites

1. Confirm the sender domain is on Cloudflare (same domain used by `FROM_EMAIL`).
2. Confirm you have zone-level permissions to edit:
   - DNS
   - Email Routing
   - Workers
3. Pick a sender address for OTPs (example: `verify@yourdomain.com`).

### B. Enable Email Routing

1. In Cloudflare Dashboard, open **Email -> Email Routing** for the target zone.
2. Select **Get started** / **Enable Email Routing**.
3. Allow Cloudflare to add required DNS records (MX/TXT) when prompted.
4. Wait for DNS status to become healthy/active.

### C. Verify destination address(es)

1. In **Email Routing -> Destination addresses**, add at least one destination mailbox.
2. Open the verification email sent by Cloudflare and confirm verification.
3. Ensure destination status is **Verified** before continuing.

Why this matters:
- Email Routing rules remain disabled until destination verification is complete.
- `send_email` can only deliver to verified destinations through Email Routing.

### D. Enable Email Workers and route setup

1. In **Email Routing -> Email Workers**, create (or select) the Email Worker associated with outbound handling.
2. Create route/address rules so messages for the sender domain are handled by the intended worker logic.
3. If using custom addresses, ensure each address rule is explicit (for example, `verify@...`).
4. Save and deploy the Email Worker route configuration.

### E. Configure `send_email` binding for `auth-worker`

Configure a `send_email` binding in `auth-worker/wrangler.toml` (or dashboard-equivalent Worker settings) for each environment.

Example (restrictive rollout first):

```toml
# Preview: single destination mailbox
[[env.preview.send_email]]
name = "EMAIL_OUTBOUND"
destination_address = "qa-preview-inbox@example.com"

# Staging: explicit allowlist
[[env.staging.send_email]]
name = "EMAIL_OUTBOUND"
allowed_destination_addresses = ["qa1@example.com", "qa2@example.com"]

# Production: start restrictive, then relax when validated
[[env.production.send_email]]
name = "EMAIL_OUTBOUND"
allowed_destination_addresses = ["ops-alerts@example.com"]
```

Recommended pattern:

- Start restrictive in preview/staging:
  - `destination_address` (single recipient), or
  - `allowed_destination_addresses` (small allowlist)
- Relax only when ready for production traffic.

Key constraints to enforce:

1. Sender must be an address on the Email Routing-enabled domain.
2. Destination must be verified/allowed by binding or routing setup.
3. Keep binding names consistent across environments to reduce deploy risk.
4. If restrictions are omitted, sending scope is broader; do this only after staging validation.
5. Email size limits still apply (keep OTP emails small and plain).

## 4) Secrets and vars migration plan

### Phase 0: Prepare (no behavior change)

Keep SES settings in place until Cloudflare path is proven:

- Keep existing secrets:
  - `AWS_ACCESS_KEY_ID`
  - `AWS_SECRET_ACCESS_KEY`
- Keep vars:
  - `AWS_REGION`
  - `FROM_EMAIL`

Add planned Cloudflare settings (when implementation starts):

- `send_email` binding (for example, `EMAIL_OUTBOUND`)
- Optional rollout var (recommended): `EMAIL_PROVIDER=ses|cloudflare`

Suggested variable transition:

| Item | Current | Target |
|---|---|---|
| Provider secrets | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | none (remove after stabilization) |
| Provider vars | `AWS_REGION`, `FROM_EMAIL` | keep `FROM_EMAIL`; remove `AWS_REGION` when unused |
| New vars | none | `EMAIL_PROVIDER` (`ses` -> `cloudflare`) |
| New binding | none | `EMAIL_OUTBOUND` via `[[send_email]]` |

### Phase 1: Cutover

After code supports Cloudflare sending:

1. Set `EMAIL_PROVIDER=cloudflare` in preview, then staging, then production.
2. Keep AWS secrets during initial cutover window for quick rollback.
3. After stable period, remove:
   - `AWS_ACCESS_KEY_ID`
   - `AWS_SECRET_ACCESS_KEY`
   - `AWS_REGION` (if no longer used)

Practical commands (run per environment):

```bash
# Set rollout flag
wrangler secret put EMAIL_PROVIDER --env preview
wrangler secret put EMAIL_PROVIDER --env staging
wrangler secret put EMAIL_PROVIDER --env production

# After rollback window closes, remove AWS secrets
wrangler secret delete AWS_ACCESS_KEY_ID --env production
wrangler secret delete AWS_SECRET_ACCESS_KEY --env production
```

## 5) Rollout plan by environment

### Preview

Goal: prove end-to-end sending with low blast radius.

Steps:
1. Deploy Auth Worker with `send_email` binding configured for a single test destination (`destination_address`).
2. Execute OTP generation against preview endpoint.
3. Confirm:
   - API returns success
   - Email arrives in target inbox
   - `from` address is correct
   - OTP content and expiry are correct

Exit criteria:
- 20+ successful sends
- 0 unexpected 5xx from email path
- No SPF/DKIM/DMARC authentication surprises in received headers

### Staging

Goal: validate realistic traffic and operational monitoring.

Steps:
1. Expand allowlist to staging QA recipients (`allowed_destination_addresses`).
2. Run integration and manual OTP tests from staging frontend/client flows.
3. Monitor logs for email failures/timeouts and verify fallback behavior expectations.

Exit criteria:
- 2+ days stable staging operation
- Error rate on email send path within agreed threshold
- Support/QA signoff that OTP UX is unchanged

### Production

Goal: safe cutover with rollback readiness.

Steps:
1. Keep routing/binding restrictions initially if possible (controlled rollout).
2. Enable Cloudflare provider for a limited cohort (if feature flagging is implemented).
3. Ramp to 100% once metrics are stable.
4. Keep SES credentials for rollback window (for example, 7 days).

Exit criteria:
- Stable send success rate
- No material OTP delivery latency regression
- No increase in auth failures attributable to email delivery

## 6) Verification checklist

Use this checklist at each environment:

- [ ] Email Routing enabled on the correct zone/domain.
- [ ] Required DNS records (MX/TXT) are healthy.
- [ ] Destination mailbox addresses are verified.
- [ ] Email Worker route/address rules exist and are active.
- [ ] `send_email` binding exists in the deployed `auth-worker` environment.
- [ ] Sender (`FROM_EMAIL`) is on the Email Routing-enabled domain.
- [ ] OTP email is received and readable in major providers (Gmail/Outlook/etc).
- [ ] OTP value in email matches generated OTP and expiry expectations.
- [ ] `/otp/generate` response remains consistent with existing API contract.
- [ ] Worker logs show no recurring send failures.

## 7) Rollback plan

Trigger rollback if any of the following occurs after cutover:

- Significant drop in OTP delivery success.
- Sustained increase in `/otp/generate` failures.
- User-reported missing OTP emails beyond normal baseline.

Rollback actions:

1. Switch provider flag back to SES (or redeploy previous SES-based version).
2. Keep Cloudflare Email Routing config in place (do not delete during incident).
3. Verify SES credentials are still present and valid.
4. Re-run OTP smoke tests on affected environment.
5. Announce rollback completion and continue incident review.

Post-rollback follow-up:

1. Collect failure samples (headers, timestamps, worker logs).
2. Identify whether issue was:
   - routing config,
   - sender/domain policy,
   - binding restrictions,
   - code integration.
3. Fix in preview first, then repeat staged rollout.

## 8) Implementation handoff (next code change scope)

When engineering starts implementation, scope should include:

1. Add Cloudflare email sender service (`send_email` API usage).
2. Introduce provider switch (`EMAIL_PROVIDER`) for controlled rollout.
3. Update health endpoint to report Cloudflare email binding/provider status.
4. Remove AWS SDK/SES dependencies only after stable production window.

