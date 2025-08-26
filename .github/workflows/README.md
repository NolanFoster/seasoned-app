# GitHub Workflows

This directory contains GitHub Actions workflows for the Recipe App project.

## Workflows

### Recipe Generation Worker CI/CD (`recipe-generation-worker.yml`)

Comprehensive CI/CD pipeline for the Recipe Generation Worker service.

#### Triggers
- **Push** to `main` or `staging` branches (when recipe-generation-worker files change)
- **Pull Request** to `main` or `staging` branches (when recipe-generation-worker files change)

#### Jobs

##### 1. Test and Lint
- Runs on all push/PR events
- Tests: Unit tests, integration tests, full coverage
- Quality: ESLint, TypeScript type checking
- Coverage: Uploads to Codecov

##### 2. Security Scan
- Runs npm audit for vulnerabilities
- Uses audit-ci for strict security checking
- Fails build on moderate+ vulnerabilities

##### 3. Deploy Preview
- Triggers: Pull requests only
- Environment: `preview`
- Deploys to preview environment for testing
- Runs health checks after deployment

##### 4. Deploy Staging
- Triggers: Push to `staging` branch
- Environment: `staging`
- Deploys to staging environment
- Runs integration tests against staging
- Triggers performance tests

##### 5. Deploy Production
- Triggers: Push to `main` branch
- Environment: `production`
- Deploys to production environment
- Runs smoke tests
- Creates release tags

##### 6. Performance Tests
- Triggers: After successful staging deployment
- Uses k6 for load testing
- Tests critical endpoints under load
- Validates response times and throughput

#### Environment Variables

The workflow expects these secrets to be configured in GitHub repository settings:

##### Required Secrets
- `CLOUDFLARE_API_TOKEN`: Cloudflare API token for deployments

##### Optional Secrets
- `CODECOV_TOKEN`: For enhanced Codecov integration

#### Environment Configurations

##### Preview Environment
- URL: `https://recipe-generation-worker-preview.nolanfoster.workers.dev`
- Purpose: PR testing and validation
- Automatic cleanup: Handled by Cloudflare

##### Staging Environment
- URL: `https://recipe-generation-worker-staging.nolanfoster.workers.dev`
- Purpose: Pre-production testing
- Performance testing enabled

##### Production Environment
- URL: `https://recipe-generation-worker.nolanfoster.workers.dev`
- Purpose: Live service
- Smoke tests and monitoring

#### Path Filters

The workflow only runs when files in these paths change:
- `recipe-generation-worker/**`
- `shared/**`
- `.github/workflows/recipe-generation-worker.yml`

This ensures efficient resource usage and faster feedback.

#### Performance Metrics

The workflow includes k6 performance tests that validate:
- Health endpoint: < 500ms response time
- Root endpoint: < 1000ms response time
- Generate endpoint: < 2000ms response time
- Load capacity: 20 concurrent users for 2 minutes

#### Quality Gates

All deployments must pass:
1. ✅ All unit tests pass
2. ✅ All integration tests pass
3. ✅ Code coverage meets thresholds (85%+ lines, functions)
4. ✅ No linting errors
5. ✅ No type checking errors
6. ✅ No moderate+ security vulnerabilities
7. ✅ Health checks pass after deployment

#### Troubleshooting

##### Common Issues

1. **Deployment Failures**
   - Check `CLOUDFLARE_API_TOKEN` secret
   - Verify wrangler.toml configuration
   - Check Cloudflare Workers limits

2. **Test Failures**
   - Check test logs in GitHub Actions
   - Verify environment variables
   - Check dependencies compatibility

3. **Security Scan Failures**
   - Review `npm audit` output
   - Update vulnerable dependencies
   - Consider using `npm audit fix`

4. **Performance Test Failures**
   - Check staging deployment health
   - Review k6 output for bottlenecks
   - Verify network connectivity

##### Manual Deployment

If needed, you can deploy manually:

```bash
# Preview
wrangler deploy --env preview

# Staging
wrangler deploy --env staging

# Production
wrangler deploy --env production
```

#### Monitoring

- Cloudflare Analytics: Monitor request patterns and errors
- GitHub Actions: Track deployment success/failure rates
- Codecov: Monitor code coverage trends
- Performance Tests: Track response time trends

#### Future Enhancements

Planned improvements:
- [ ] Add E2E tests with Playwright
- [ ] Implement blue-green deployments
- [ ] Add canary deployment strategy
- [ ] Include vulnerability scanning with Snyk
- [ ] Add deployment notifications to Slack
- [ ] Implement rollback automation
