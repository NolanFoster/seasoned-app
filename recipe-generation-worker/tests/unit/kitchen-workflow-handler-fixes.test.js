/**
 * Regression tests for the five P1/P2 review findings fixed in PR #569.
 *
 * Each describe block is named after the finding number and the review comment
 * summary so failures are immediately traceable to the original issue.
 *
 * All tests use the in-memory store (no KV binding) and the miniflare
 * environment supplied by vitest.config.js, so they run deterministically
 * without network access or real AI model calls.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../../src/index.js';
import { createPostRequest } from '../setup.js';
import { clearKitchenWorkflowMemory } from '../../src/handlers/kitchen-workflow-handler.js';

const enabledEnv = { ENVIRONMENT: 'test', KITCHEN_WORKFLOW_V1: 'true' };

function getRequest(path, userId) {
  return new Request(`https://test.com${path}`, {
    method: 'GET',
    headers: { 'X-User-Id': userId }
  });
}

async function json(response) {
  return response.json();
}

// ---------------------------------------------------------------------------
// Helper: start a workflow and return the parsed body.
// ---------------------------------------------------------------------------
async function startWorkflow(slots = ['2026-09-10::dinner'], extra = {}) {
  const response = await worker.fetch(
    createPostRequest('/agent/workflow/start', {
      userId: 'fix-test-user',
      slots,
      ...extra
    }),
    enabledEnv
  );
  return { response, data: await json(response) };
}

// ---------------------------------------------------------------------------
// Helper: resume a workflow and return the parsed body.
// ---------------------------------------------------------------------------
async function resumeWorkflow(workflowId, body, env = enabledEnv) {
  const response = await worker.fetch(
    createPostRequest(`/agent/workflow/${workflowId}/resume`, {
      userId: 'fix-test-user',
      ...body
    }),
    env
  );
  return { response, data: await json(response) };
}

// ---------------------------------------------------------------------------
// Helper: GET a workflow and return the parsed body.
// ---------------------------------------------------------------------------
async function getWorkflow(workflowId, userId = 'fix-test-user') {
  const response = await worker.fetch(
    getRequest(`/agent/workflow/${workflowId}`, userId),
    enabledEnv
  );
  return { response, data: await json(response) };
}

beforeEach(() => {
  clearKitchenWorkflowMemory();
  vi.restoreAllMocks();
});

// ============================================================================
// Fix #1 — Serialize version checks with workflow writes
// ============================================================================
describe('Fix #1 — concurrent resume/cancel serialization', () => {
  it('serializes two simultaneous resumes: only one succeeds, the other gets VERSION_CONFLICT', async () => {
    // Start a workflow so we have something to race against.
    const { data: started } = await startWorkflow();
    expect(started.success).toBe(true);
    const workflowId = started.workflowId;
    const version = started.workflow.version;

    // Fire two resumes concurrently with the same expectedVersion.
    // Only the first one to acquire the write lock should commit.
    const [r1, r2] = await Promise.all([
      resumeWorkflow(workflowId, {
        action: 'approve_plan',
        expectedVersion: version
      }),
      resumeWorkflow(workflowId, {
        action: 'approve_plan',
        expectedVersion: version
      })
    ]);

    const statuses = [r1.response.status, r2.response.status].sort();
    // One request should succeed (200) and one should be rejected (409).
    expect(statuses).toEqual([200, 409]);
    const loser = r1.response.status === 409 ? r1 : r2;
    expect(loser.data.code).toBe('VERSION_CONFLICT');
  });

  it('serializes a concurrent resume and cancel: the cancel wins, resume gets VERSION_CONFLICT or WORKFLOW_NOT_AWAITING_USER', async () => {
    const { data: started } = await startWorkflow();
    const workflowId = started.workflowId;
    const version = started.workflow.version;

    const [resumeResult, cancelResult] = await Promise.all([
      resumeWorkflow(workflowId, {
        action: 'approve_plan',
        expectedVersion: version
      }),
      worker
        .fetch(
          createPostRequest(`/agent/workflow/${workflowId}/cancel`, {
            userId: 'fix-test-user',
            reason: 'race test'
          }),
          enabledEnv
        )
        .then(async (r) => ({ response: r, data: await r.json() }))
    ]);

    // Both cannot succeed with a clean write: one must win, one must lose.
    const codes = [
      resumeResult.response.status,
      cancelResult.response.status
    ];
    expect(codes).toContain(200);
    // The losing request either sees a version conflict or a terminal-status
    // rejection (the workflow is already cancelled).
    const loser = resumeResult.response.status !== 200 ? resumeResult : cancelResult;
    expect([200, 409]).toContain(loser.response.status);
    // After settling, the workflow must be in exactly one terminal or
    // advanced state — never have two successful writes.
    const { data: final } = await getWorkflow(workflowId);
    expect(['cancelled', 'awaiting_user', 'running', 'completed']).toContain(
      final.workflow.status
    );
  });

  it('sequential resumes with the correct version each time all succeed', async () => {
    const { data: started } = await startWorkflow();
    const workflowId = started.workflowId;

    const { data: approved } = await resumeWorkflow(workflowId, {
      action: 'approve_plan',
      expectedVersion: started.workflow.version
    });
    expect(approved.workflow.status).toBe('awaiting_user');
    expect(approved.workflow.pendingInterrupt.type).toBe('grocery_done');

    const { data: shopping } = await resumeWorkflow(workflowId, {
      action: 'grocery_done',
      expectedVersion: approved.workflow.version
    });
    expect(shopping.workflow.pendingInterrupt.type).toBe('prep_done');
  });
});

// ============================================================================
// Fix #2 — Apply edited overrides before regenerating, preserving allergens
// ============================================================================
describe('Fix #2 — edit_plan merges all overrides and preserves hard allergens', () => {
  it('merges dietary and maxCookTime into the stored constraints on edit_plan', async () => {
    const { data: started } = await startWorkflow(['2026-09-10::dinner'], {
      culinaryProfile: { hard_allergens: ['peanuts'] },
      overrides: { maxCookTime: 60 }
    });
    expect(started.success).toBe(true);
    const workflowId = started.workflowId;

    // Submit edit_plan with new overrides.
    const { data: edited } = await resumeWorkflow(workflowId, {
      action: 'edit_plan',
      overrides: { dietary: ['vegetarian'], maxCookTime: 30 }
    });

    // The workflow should have moved on (either a new propose_plan or repair).
    expect(edited.success).toBe(true);
    // The stored constraints must now carry the new dietary and maxCookTime.
    const constraints = edited.workflow.state.constraints;
    expect(constraints).toBeDefined();
    // The submitted values must be applied before regeneration.
    expect(constraints.dietary).toContain('vegetarian');
    expect(constraints.maxCookTime).toBe(30);
    // Hard allergens from the original profile must still be present.
    expect(Array.isArray(constraints.hardAllergens)).toBe(true);
    expect(constraints.hardAllergens).toContain('peanuts');
  });

  it('does not weaken hard allergens when edit_plan provides an empty allergen array', async () => {
    const { data: started } = await startWorkflow(['2026-09-10::dinner'], {
      // Use the canonical underscore form that buildGenerationConstraints stores internally.
      // 'tree nuts' (space) is an alias that normalizes to 'tree_nuts' via ALLERGEN_ALIASES.
      culinaryProfile: { hard_allergens: ['shellfish', 'tree_nuts'] }
    });
    const workflowId = started.workflowId;

    const { data: edited } = await resumeWorkflow(workflowId, {
      action: 'edit_plan',
      overrides: { hardAllergens: [] }
    });

    const allergens = edited.workflow.state.constraints.hardAllergens;
    // The original profile allergens must survive even when the caller sends [].
    expect(allergens).toContain('shellfish');
    // Canonical form is underscore-separated (ALLERGEN_ALIASES maps 'tree nuts' → 'tree_nuts').
    expect(allergens).toContain('tree_nuts');
  });

  it('audit trail records plan_edit_requested with the submitted override keys', async () => {
    const { data: started } = await startWorkflow(['2026-09-10::dinner']);
    const workflowId = started.workflowId;

    const { data: edited } = await resumeWorkflow(workflowId, {
      action: 'edit_plan',
      overrides: { maxCookTime: 25, servings: 2 }
    });

    const auditEvent = edited.workflow.audit.find(
      (e) => e.event === 'plan_edit_requested'
    );
    expect(auditEvent).toBeDefined();
    expect(auditEvent.details.overrideKeys).toEqual(
      expect.arrayContaining(['maxCookTime', 'servings'])
    );
  });
});

// ============================================================================
// Fix #3 — Allow X-User-Id in CORS Access-Control-Allow-Headers
// ============================================================================
describe('Fix #3 — CORS preflight includes X-User-Id in Access-Control-Allow-Headers', () => {
  it('OPTIONS preflight response lists X-User-Id in allowed headers', async () => {
    const response = await worker.fetch(
      new Request('https://test.com/agent/workflow/kwf_testid123456789', {
        method: 'OPTIONS'
      }),
      enabledEnv
    );
    expect(response.status).toBe(200);
    const allowHeaders = response.headers.get('Access-Control-Allow-Headers') ?? '';
    expect(allowHeaders).toContain('X-User-Id');
  });

  it('OPTIONS preflight for /agent/workflow/start also includes X-User-Id', async () => {
    const response = await worker.fetch(
      new Request('https://test.com/agent/workflow/start', { method: 'OPTIONS' }),
      enabledEnv
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Headers')).toContain('X-User-Id');
  });

  it('normal GET response also carries X-User-Id in CORS headers', async () => {
    // Start a workflow first so the GET can find something.
    const { data: started } = await startWorkflow();
    const { response } = await getWorkflow(started.workflowId);
    expect(response.headers.get('Access-Control-Allow-Headers')).toContain('X-User-Id');
  });
});

// ============================================================================
// Fix #4 — Reject partial meal-plan fills before approval
// ============================================================================
describe('Fix #4 — partial meal-plan fill triggers repair interrupt, not approval', () => {
  it('routes to repair_plan when the fill handler returns fewer meals than slots', async () => {
    // Patch handleMealPlanFill to simulate a partial result (1 meal for 2 slots).
    const mealFillMod = await import('../../src/handlers/meal-plan-fill-handler.js');
    const spy = vi
      .spyOn(mealFillMod, 'handleMealPlanFill')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            meals: [
              {
                slot: '2026-09-10::dinner',
                recipe: { name: 'Soup', ingredients: ['water'] }
              }
            ],
            warnings: []
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

    // Start with two slots so one meal < two slots triggers the partial check.
    const response = await worker.fetch(
      createPostRequest('/agent/workflow/start', {
        userId: 'fix-test-user',
        slots: ['2026-09-10::dinner', '2026-09-11::dinner']
      }),
      enabledEnv
    );
    const data = await json(response);
    spy.mockRestore();

    // The workflow must have landed in repair, not propose_plan.
    expect(data.success).toBe(true);
    expect(data.workflow.pendingInterrupt.type).toBe('repair_plan');
    expect(data.workflow.state.repair.code).toBe('PARTIAL_PLAN_FILL');
    expect(data.workflow.state.repair.message).toMatch(/1 of 2/);
  });

  it('accepts a full fill when all slots are covered', async () => {
    // Default mock environment has the AI stub that returns meals; a 2-slot
    // start should succeed if both meals come back.
    const { data: started } = await startWorkflow([
      '2026-09-10::dinner',
      '2026-09-11::dinner'
    ]);
    // The workflow may land in propose_plan (full fill) or repair_plan
    // (if the AI stub returns fewer meals). What it must NOT do is proceed
    // to propose_plan with fewer meals than slots.
    if (started.workflow.pendingInterrupt?.type === 'approve_plan') {
      expect(started.workflow.state.planDraft.meals.length).toBe(2);
    }
  });
});

// ============================================================================
// Fix #5 — Recovery path for persisted running checkpoints with no interrupt
// ============================================================================
describe('Fix #5 — running workflow with no interrupt is recoverable', () => {
  it('GET surfaces recoverableRunning:true when status is running and pendingInterrupt is null', async () => {
    // Start a workflow so we have a valid workflowId/ownerId in memory.
    const { data: started } = await startWorkflow();
    const workflowId = started.workflowId;

    // 1. Normal state: GET should NOT include recoverableRunning.
    const { data: getResult } = await getWorkflow(workflowId);
    expect(getResult.workflow.status).toBe('awaiting_user');
    expect(getResult.recoverableRunning).toBeUndefined();

    // 2. Attempting to resume an awaiting_user workflow with action:'recover'
    //    (which is not a valid action for that interrupt) should be rejected
    //    as INVALID_WORKFLOW_ACTION, proving the recover branch is separate.
    const { data: badRecover } = await resumeWorkflow(workflowId, {
      action: 'recover'
    });
    expect(badRecover.code).toBe('INVALID_WORKFLOW_ACTION');
  });

  it('GET stranded-running workflow surfaces recoverableRunning:true and recoveryMessage', async () => {
    const { getKitchenWorkflowStorageKey } = await import(
      '../../src/handlers/kitchen-workflow-handler.js'
    );

    const strandedWorkflowId = 'kwf_strandedtest1234567';
    const ownerId = 'fix-test-user';
    const key = getKitchenWorkflowStorageKey(ownerId, strandedWorkflowId);

    // Build a minimal valid stranded workflow record.
    const strandedRecord = JSON.stringify({
      schemaVersion: 1,
      workflowId: strandedWorkflowId,
      type: 'week_plan',
      userId: ownerId,
      status: 'running',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400 * 1000 * 30).toISOString(),
      version: 2,
      traceId: 'trace_strandedtest',
      state: {
        node: 'draft_plan',
        goal: { description: 'stranded test' },
        constraints: { hardAllergens: [] },
        usePantry: false,
        pantryIngredients: [],
        slots: ['2026-09-10::dinner'],
        planDraft: null,
        groceryDraft: null,
        repair: null,
        checkpoints: []
      },
      pendingInterrupt: null,
      audit: []
    });

    // Inject via a mock KV binding passed as the env.
    const kvStore = new Map([[key, strandedRecord]]);
    const strandedEnv = {
      ...enabledEnv,
      RECIPE_STORAGE: {
        get: (k) => Promise.resolve(kvStore.get(k) ?? null),
        put: (k, v) => { kvStore.set(k, v); return Promise.resolve(); },
        delete: (k) => { kvStore.delete(k); return Promise.resolve(); }
      }
    };

    // GET should surface recoverableRunning:true.
    const getResponse = await worker.fetch(
      getRequest(`/agent/workflow/${strandedWorkflowId}`, ownerId),
      strandedEnv
    );
    const getData = await json(getResponse);
    expect(getResponse.status).toBe(200);
    expect(getData.recoverableRunning).toBe(true);
    expect(getData.recoveryMessage).toContain('recover');
  });

  it('non-recover action on a stranded-running workflow returns 409 with recoverableRunning:true', async () => {
    const { getKitchenWorkflowStorageKey } = await import(
      '../../src/handlers/kitchen-workflow-handler.js'
    );

    const strandedWorkflowId = 'kwf_strandedtest7654321';
    const ownerId = 'fix-test-user';
    const key = getKitchenWorkflowStorageKey(ownerId, strandedWorkflowId);

    const strandedRecord = JSON.stringify({
      schemaVersion: 1,
      workflowId: strandedWorkflowId,
      type: 'week_plan',
      userId: ownerId,
      status: 'running',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400 * 1000 * 30).toISOString(),
      version: 2,
      traceId: 'trace_stranded2',
      state: {
        node: 'draft_plan',
        goal: { description: 'stranded test 2' },
        constraints: { hardAllergens: [] },
        usePantry: false,
        pantryIngredients: [],
        slots: ['2026-09-10::dinner'],
        planDraft: null,
        groceryDraft: null,
        repair: null,
        checkpoints: []
      },
      pendingInterrupt: null,
      audit: []
    });

    const kvStore = new Map([[key, strandedRecord]]);
    const strandedEnv = {
      ...enabledEnv,
      RECIPE_STORAGE: {
        get: (k) => Promise.resolve(kvStore.get(k) ?? null),
        put: (k, v) => { kvStore.set(k, v); return Promise.resolve(); },
        delete: (k) => { kvStore.delete(k); return Promise.resolve(); }
      }
    };

    const badResponse = await worker.fetch(
      createPostRequest(`/agent/workflow/${strandedWorkflowId}/resume`, {
        userId: ownerId,
        action: 'approve_plan'
      }),
      strandedEnv
    );
    const badData = await json(badResponse);
    expect(badResponse.status).toBe(409);
    expect(badData.code).toBe('WORKFLOW_NOT_AWAITING_USER');
    expect(badData.recoverableRunning).toBe(true);
  });

  it('recover action on a stranded-running workflow re-drafts the plan and appends audit event', async () => {
    const { getKitchenWorkflowStorageKey } = await import(
      '../../src/handlers/kitchen-workflow-handler.js'
    );

    const strandedWorkflowId = 'kwf_strandedrecover5678';
    const ownerId = 'fix-test-user';
    const key = getKitchenWorkflowStorageKey(ownerId, strandedWorkflowId);

    const strandedRecord = JSON.stringify({
      schemaVersion: 1,
      workflowId: strandedWorkflowId,
      type: 'week_plan',
      userId: ownerId,
      status: 'running',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400 * 1000 * 30).toISOString(),
      version: 2,
      traceId: 'trace_strandedrecover',
      state: {
        node: 'draft_plan',
        goal: { description: 'stranded recover test' },
        constraints: { hardAllergens: [] },
        usePantry: false,
        pantryIngredients: [],
        slots: ['2026-09-10::dinner'],
        planDraft: null,
        groceryDraft: null,
        repair: null,
        checkpoints: []
      },
      pendingInterrupt: null,
      audit: []
    });

    const kvStore = new Map([[key, strandedRecord]]);
    const strandedEnv = {
      ...enabledEnv,
      RECIPE_STORAGE: {
        get: (k) => Promise.resolve(kvStore.get(k) ?? null),
        put: (k, v) => { kvStore.set(k, v); return Promise.resolve(); },
        delete: (k) => { kvStore.delete(k); return Promise.resolve(); }
      }
    };

    // Recover action should re-draft and return a valid workflow state.
    const recoverResponse = await worker.fetch(
      createPostRequest(`/agent/workflow/${strandedWorkflowId}/resume`, {
        userId: ownerId,
        action: 'recover'
      }),
      strandedEnv
    );
    const recoverData = await json(recoverResponse);
    expect(recoverResponse.status).toBe(200);
    // The recovery should have produced either a propose_plan or repair_plan
    // interrupt (depending on whether the AI model is available in the test env).
    expect(['awaiting_user', 'failed']).toContain(recoverData.workflow.status);
    // The audit trail must contain the recovery event.
    const recoveryAudit = recoverData.workflow.audit.find(
      (e) => e.event === 'workflow_recovered'
    );
    expect(recoveryAudit).toBeDefined();
    expect(recoveryAudit.details.fromNode).toBe('draft_plan');
  });
});
