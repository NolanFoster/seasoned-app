# Updating Test Workflows with Slack Notifications

## Overview
This guide explains how to update test workflows to send Slack notifications to the Cursor agent when tests or coverage fail.

## Workflows Already Updated
- ✅ frontend-tests.yml (with coverage support)
- ✅ shared-tests.yml
- ✅ recipe-scraper-tests.yml
- ✅ crawler-tests.yml

## Workflows Still Need Updating
- clipper-tests.yml
- clipped-recipe-db-worker-tests.yml
- recipe-recommendation-worker-tests.yml
- recipe-search-db-tests.yml

## Steps to Update a Test Workflow

### 1. Add Output to Test Job
Add an `outputs` section to your test job:
```yaml
outputs:
  tests_passed: ${{ steps.test-results.outputs.tests_passed }}
```

### 2. Add ID to Test Step
Add an `id` to your test execution step:
```yaml
- name: Run Tests
  id: test-results
  working-directory: ./your-directory
  run: |
    # Your test command here
```

### 3. Modify Test Execution Logic
Replace simple test commands with conditional logic:

**For npm-based tests:**
```yaml
if npm run | grep -q "test"; then
  if npm test; then
    echo "tests_passed=true" >> $GITHUB_OUTPUT
    echo "Tests passed successfully"
  else
    echo "tests_passed=false" >> $GITHUB_OUTPUT
    echo "Tests failed"
    exit 1
  fi
else
  echo "tests_passed=true" >> $GITHUB_OUTPUT
  echo "No test script found in package.json"
fi
```

**For Python tests:**
```yaml
if [ -f "test_file.py" ]; then
  if python -m pytest test_file.py -v; then
    echo "tests_passed=true" >> $GITHUB_OUTPUT
    echo "Tests passed successfully"
  else
    echo "tests_passed=false" >> $GITHUB_OUTPUT
    echo "Tests failed"
    exit 1
  fi
else
  echo "tests_passed=true" >> $GITHUB_OUTPUT
  echo "No test files found"
fi
```

### 4. Add Slack Notification Job
Add this job at the end of your workflow:
```yaml
  # Slack notification for test failures
  notify-test-failure:
    name: Notify Slack on Test Failure
    needs: test-job-name  # Replace with your test job name
    if: always() && needs.test-job-name.outputs.tests_passed == 'false'
    uses: ./.github/workflows/slack-notify-cursor.yml
    with:
      test_type: 'unit-tests'
      workflow_name: 'Your Workflow Name'  # Replace with descriptive name
      failure_details: 'Your component unit tests failed'  # Replace with specific details
      branch: ${{ github.ref_name }}
      commit_sha: ${{ github.sha }}
      run_url: ${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}
    secrets: inherit  # This passes all repository secrets to the reusable workflow
```

## GitHub Secrets Required
The following secrets need to be configured in your GitHub repository:
- `SLACK_WEBHOOK_URL`: The webhook URL from your Slack app
- `SLACK_CHANNEL`: (Optional) The Slack channel to send notifications to (defaults to #cursor-notifications)
- `CURSOR_AGENT_ID`: (Optional) The Cursor agent ID to mention in Slack

## Setting Up Slack Integration
1. Create a Slack App at https://api.slack.com/apps
2. Add an Incoming Webhook to your app
3. Select the channel for notifications
4. Copy the webhook URL
5. Add the webhook URL as a GitHub secret named `SLACK_WEBHOOK_URL`

## Testing
To test the integration:
1. Make a commit that intentionally fails tests
2. Push to a branch that triggers the workflow
3. Verify that the Slack notification is sent to the configured channel
4. Check that the Cursor agent is mentioned in the notification