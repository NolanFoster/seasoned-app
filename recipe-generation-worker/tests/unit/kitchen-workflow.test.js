import { beforeEach, describe, expect, it } from 'vitest';
import worker from '../../src/index.js';
import { createPostRequest } from '../setup.js';
import { clearKitchenWorkflowMemory } from '../../src/handlers/kitchen-workflow-handler.js';
import {
  createKitchenWorkflow,
  markWorkflowCancelled,
  markWorkflowCompleted,
  normalizeKitchenWorkflow,
  setPendingInterrupt
} from '../../src/kitchen-workflow.js';


const enabledEnv = {
  ENVIRONMENT: 'test',
  KITCHEN_WORKFLOW_V1: 'true'
};

function getWorkflowRequest(path, userId) {
  return new Request(`https://test.com${path}`, {
    method: 'GET',
    headers: { 'X-User-Id': userId }
  });
}

async function read(response) {
  return response.json();
}

describe('Kitchen Workflow V1 state model', () => {
  it('creates a typed workflow and preserves a stable trace across normalization', () => {
    const workflow = createKitchenWorkflow({
      type: 'week_plan',
      userId: 'user-a',
      goal: { description: 'three dinners' },
      constraints: { hardAllergens: ['peanuts'] },
      slots: ['2026-09-07::dinner']
    });
    setPendingInterrupt(workflow, 'approve_plan', 'Review the plan', [
      { action: 'approve_plan', label: 'Approve plan' }
    ]);

    const normalized = normalizeKitchenWorkflow(workflow);
    expect(normalized).toMatchObject({
      schemaVersion: 1,
      workflowId: workflow.workflowId,
      userId: 'user-a',
      status: 'awaiting_user',
      traceId: workflow.traceId,
      state: { node: 'clarify_goal', slots: ['2026-09-07::dinner'] },
      pendingInterrupt: { type: 'approve_plan' }
    });
    expect(normalized.expiresAt).toBeTruthy();
  });

  it('marks terminal states without dropping the audit trail', () => {
    const workflow = createKitchenWorkflow({ userId: 'user-a' });
    markWorkflowCompleted(workflow, 'complete', { cookSessionReady: true });
    expect(workflow.status).toBe('completed');
    expect(workflow.pendingInterrupt).toBeNull();
    expect(workflow.audit.at(-1).event).toBe('workflow_completed');

    const cancelled = createKitchenWorkflow({ userId: 'user-a' });
    markWorkflowCancelled(cancelled, 'changed_mind');
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.audit.at(-1).details.reason).toBe('changed_mind');
  });
});

describe('Kitchen Workflow V1 HTTP API', () => {
  beforeEach(() => {
    clearKitchenWorkflowMemory();
  });

  it('keeps all workflow routes disabled by default', async () => {
    const response = await worker.fetch(
      createPostRequest('/agent/workflow/start', { userId: 'user-a' }),
      { ENVIRONMENT: 'test' }
    );
    const data = await read(response);
    expect(response.status).toBe(404);
    expect(data.code).toBe('FEATURE_DISABLED');
  });

  it('runs a week plan through approval, shopping, prep, and cook handoff', async () => {
    const startResponse = await worker.fetch(
      createPostRequest('/agent/workflow/start', {
        userId: 'user-a',
        type: 'week_plan',
        goal: 'Plan two quick dinners',
        slots: ['2026-09-07::dinner', '2026-09-08::dinner'],
        usePantry: true,
        pantryIngredients: [{ name: 'carrots', quantity: 4, unit: 'piece' }],
        culinaryProfile: { hard_allergens: ['peanuts'] },
        overrides: { maxCookTime: 40 }
      }),
      enabledEnv
    );
    const started = await read(startResponse);

    expect(startResponse.status).toBe(200);
    expect(started.success).toBe(true);
    expect(started.status).toBe('awaiting_user');
    expect(started.workflow.state.node).toBe('propose_plan');
    expect(started.workflow.pendingInterrupt.type).toBe('approve_plan');
    expect(started.workflow.state.planDraft.meals).toHaveLength(2);
    expect(started.workflow.state.constraints.hardAllergens).toContain('peanuts');

    const workflowId = started.workflowId;
    const getResponse = await worker.fetch(
      getWorkflowRequest(`/agent/workflow/${workflowId}`, 'user-a'),
      enabledEnv
    );
    expect((await read(getResponse)).workflow.traceId).toBe(started.traceId);

    const approveResponse = await worker.fetch(
      createPostRequest(`/agent/workflow/${workflowId}/resume`, {
        userId: 'user-a',
        action: 'approve_plan',
        expectedVersion: started.workflow.version
      }),
      enabledEnv
    );
    const approved = await read(approveResponse);
    expect(approveResponse.status).toBe(200);
    expect(approved.workflow.status).toBe('awaiting_user');
    expect(approved.workflow.pendingInterrupt.type).toBe('grocery_done');
    expect(approved.workflow.state.groceryDraft.pantryMatched).toBe(true);
    expect(approved.workflow.audit.map((entry) => entry.event)).toContain('plan_approved');

    const shoppingResponse = await worker.fetch(
      createPostRequest(`/agent/workflow/${workflowId}/resume`, {
        userId: 'user-a', action: 'grocery_done'
      }),
      enabledEnv
    );
    const shopping = await read(shoppingResponse);
    expect(shopping.workflow.state.node).toBe('optional_prep');
    expect(shopping.workflow.pendingInterrupt.type).toBe('prep_done');

    const skipPrepResponse = await worker.fetch(
      createPostRequest(`/agent/workflow/${workflowId}/resume`, {
        userId: 'user-a', action: 'skip_prep'
      }),
      enabledEnv
    );
    const skipped = await read(skipPrepResponse);
    expect(skipped.workflow.state.node).toBe('ready_to_cook');
    expect(skipped.workflow.pendingInterrupt.type).toBe('ready_to_cook');

    const completeResponse = await worker.fetch(
      createPostRequest(`/agent/workflow/${workflowId}/resume`, {
        userId: 'user-a', action: 'start_cooking'
      }),
      enabledEnv
    );
    const completed = await read(completeResponse);
    expect(completed.workflow.status).toBe('completed');
    expect(completed.workflow.state.node).toBe('complete');
    expect(completed.workflow.pendingInterrupt).toBeNull();
  });

  it('derives bounded slots from a natural-language dinner goal when slots are omitted', async () => {
    const response = await worker.fetch(
      createPostRequest('/agent/workflow/start', {
        userId: 'user-a',
        goal: 'Plan 5 dinners for next week'
      }),
      enabledEnv
    );
    const data = await read(response);
    expect(response.status).toBe(200);
    expect(data.workflow.state.slots).toHaveLength(5);
    expect(data.workflow.state.slots.every((slot) => slot.endsWith('::dinner'))).toBe(true);
  });

  it('scopes persisted workflows to the account identity', async () => {
    const startResponse = await worker.fetch(
      createPostRequest('/agent/workflow/start', {
        userId: 'user-a',
        slots: ['2026-09-07::dinner']
      }),
      enabledEnv
    );
    const started = await read(startResponse);

    const otherUserResponse = await worker.fetch(
      getWorkflowRequest(`/agent/workflow/${started.workflowId}`, 'user-b'),
      enabledEnv
    );
    const otherUser = await read(otherUserResponse);
    expect(otherUserResponse.status).toBe(404);
    expect(otherUser.code).toBe('WORKFLOW_NOT_FOUND');

    const staleResponse = await worker.fetch(
      createPostRequest(`/agent/workflow/${started.workflowId}/resume`, {
        userId: 'user-a', action: 'approve_plan', expectedVersion: 0
      }),
      enabledEnv
    );
    const stale = await read(staleResponse);
    expect(staleResponse.status).toBe(409);
    expect(stale.code).toBe('VERSION_CONFLICT');
  });

  it('pauses for repair after a generation failure and fails closed after the retry budget', async () => {
    const failingEnv = {
      ...enabledEnv,
      AI: { run: async () => { throw new Error('model unavailable'); } },
      RECIPE_VECTORS: { query: async () => ({ matches: [] }) }
    };
    const startResponse = await worker.fetch(
      createPostRequest('/agent/workflow/start', {
        userId: 'repair-user', slots: ['2026-09-07::dinner']
      }),
      failingEnv
    );
    const started = await read(startResponse);
    expect(started.workflow.status).toBe('awaiting_user');
    expect(started.workflow.pendingInterrupt.type).toBe('repair_plan');
    expect(started.workflow.state.repair.attempts).toBe(1);

    const retryResponse = await worker.fetch(
      createPostRequest(`/agent/workflow/${started.workflowId}/resume`, {
        userId: 'repair-user', action: 'retry_plan'
      }),
      failingEnv
    );
    const retried = await read(retryResponse);
    expect(retried.workflow.pendingInterrupt.type).toBe('repair_plan');
    expect(retried.workflow.state.repair.attempts).toBe(2);

    const exhaustedResponse = await worker.fetch(
      createPostRequest(`/agent/workflow/${started.workflowId}/resume`, {
        userId: 'repair-user', action: 'retry_plan'
      }),
      failingEnv
    );
    const exhausted = await read(exhaustedResponse);
    expect(exhausted.workflow.status).toBe('failed');
    expect(exhausted.workflow.state.repair.code).toBe('REPAIR_EXHAUSTED');
    expect(exhausted.workflow.pendingInterrupt).toBeNull();
  });

  it('rejects invalid transitions without changing the workflow', async () => {
    const startResponse = await worker.fetch(
      createPostRequest('/agent/workflow/start', {
        userId: 'user-a', slots: ['2026-09-07::dinner']
      }),
      enabledEnv
    );
    const started = await read(startResponse);
    const response = await worker.fetch(
      createPostRequest(`/agent/workflow/${started.workflowId}/resume`, {
        userId: 'user-a', action: 'grocery_done'
      }),
      enabledEnv
    );
    const data = await read(response);
    expect(response.status).toBe(409);
    expect(data.code).toBe('INVALID_WORKFLOW_ACTION');

    const unchanged = await worker.fetch(
      getWorkflowRequest(`/agent/workflow/${started.workflowId}`, 'user-a'),
      enabledEnv
    );
    const current = await read(unchanged);
    expect(current.workflow.version).toBe(started.workflow.version);
    expect(current.workflow.pendingInterrupt.type).toBe('approve_plan');
  });

  it('cancels through the dedicated endpoint and keeps the reason', async () => {
    const startResponse = await worker.fetch(
      createPostRequest('/agent/workflow/start', {
        userId: 'user-a', slots: ['2026-09-07::dinner']
      }),
      enabledEnv
    );
    const started = await read(startResponse);
    const response = await worker.fetch(
      createPostRequest(`/agent/workflow/${started.workflowId}/cancel`, {
        userId: 'user-a', reason: 'schedule changed'
      }),
      enabledEnv
    );
    const data = await read(response);
    expect(response.status).toBe(200);
    expect(data.workflow.status).toBe('cancelled');
    expect(data.workflow.audit.at(-1).event).toBe('cancel_requested');
  });

  it('rejects malformed workflow IDs before touching storage', async () => {
    const response = await worker.fetch(
      getWorkflowRequest('/agent/workflow/not-a-workflow', 'user-a'),
      enabledEnv
    );
    const data = await read(response);
    expect(response.status).toBe(400);
    expect(data.code).toBe('INVALID_WORKFLOW_ID');
  });
});
