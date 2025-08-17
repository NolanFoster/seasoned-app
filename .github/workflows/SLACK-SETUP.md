# Setting Up Slack Notifications for Test Failures

This guide explains how to configure Slack notifications to alert the Cursor agent when GitHub Actions tests or coverage checks fail.

## Prerequisites
- Admin access to your GitHub repository
- Admin access to a Slack workspace
- Cursor agent set up in your Slack workspace (if you want to mention it)

## Step 1: Create a Slack App

1. Go to [https://api.slack.com/apps](https://api.slack.com/apps)
2. Click "Create New App"
3. Choose "From scratch"
4. Enter an app name (e.g., "GitHub Actions Notifier")
5. Select your Slack workspace
6. Click "Create App"

## Step 2: Configure Incoming Webhooks

1. In your app settings, navigate to "Incoming Webhooks" in the sidebar
2. Toggle "Activate Incoming Webhooks" to On
3. Click "Add New Webhook to Workspace"
4. Select the channel where you want notifications (e.g., `#cursor-notifications`)
5. Click "Allow"
6. Copy the webhook URL (it should look like `https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX`)

## Step 3: Add GitHub Secrets

1. Go to your GitHub repository
2. Navigate to Settings → Secrets and variables → Actions
3. Click "New repository secret"
4. Add the following secrets:

### Required Secret:
- **Name**: `SLACK_WEBHOOK_URL`
- **Value**: The webhook URL you copied from Slack

### Optional Secrets:
- **Name**: `SLACK_CHANNEL`
- **Value**: The channel name (e.g., `cursor-notifications`)
- **Note**: If not set, uses the default channel configured in the webhook

- **Name**: `CURSOR_AGENT_ID`
- **Value**: The Slack user ID of your Cursor agent (e.g., `U1234567890`)
- **Note**: This allows the notification to mention the Cursor agent

## Step 4: Finding the Cursor Agent ID (Optional)

To mention the Cursor agent in notifications:

1. In Slack, right-click on the Cursor agent
2. Select "View profile"
3. Click the three dots menu
4. Select "Copy member ID"
5. Use this ID as the value for `CURSOR_AGENT_ID`

## Step 5: Test the Integration

1. Make a test commit that intentionally fails a test:
   ```javascript
   // In a test file
   test('intentional failure', () => {
     expect(true).toBe(false);
   });
   ```

2. Push to a branch that triggers your test workflow
3. Check your Slack channel for the notification
4. Verify that:
   - The notification appears in the correct channel
   - The failure details are accurate
   - The Cursor agent is mentioned (if configured)
   - The workflow run link works

## Notification Format

The Slack notification will include:
- Type of failure (unit tests, coverage, etc.)
- Workflow name
- Branch name
- Commit SHA
- Failure details
- Direct link to the workflow run
- Mention of the Cursor agent (if configured)

## Troubleshooting

### Notifications not appearing
1. Check the GitHub Actions logs for the notification job
2. Verify the webhook URL is correct
3. Ensure the Slack app has permissions for the channel

### Cursor agent not mentioned
1. Verify the `CURSOR_AGENT_ID` is set correctly
2. Ensure the agent is a member of the notification channel

### Webhook errors
1. Regenerate the webhook URL in Slack
2. Update the `SLACK_WEBHOOK_URL` secret in GitHub
3. Check that the webhook hasn't been revoked

## Security Notes

- Keep the webhook URL secret - anyone with it can post to your Slack
- Use GitHub's secret management - never commit webhook URLs to code
- Regularly rotate webhook URLs for security
- Limit the app's permissions to only what's necessary

## Advanced Configuration

### Custom Notification Channels
You can override the notification channel per workflow by passing a different channel in the workflow call:

```yaml
secrets:
  SLACK_CHANNEL: 'frontend-alerts'  # Override default channel
```

### Multiple Environments
For different environments (staging, production), you can use environment-specific secrets:

```yaml
secrets:
  SLACK_WEBHOOK_URL: ${{ secrets[format('SLACK_WEBHOOK_URL_{0}', github.ref_name)] }}
```

## Related Documentation
- [Slack Incoming Webhooks](https://api.slack.com/messaging/webhooks)
- [GitHub Encrypted Secrets](https://docs.github.com/en/actions/security-guides/encrypted-secrets)
- [GitHub Actions Workflow Syntax](https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions)