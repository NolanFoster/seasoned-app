/**
 * Durable Kitchen Workflow V1 orchestration.
 *
 * This is intentionally a small, explicit state machine rather than a hidden
 * prompt loop. It persists after every checkpoint, pauses before the plan is
 * applied, and reuses the existing generation and grocery handlers for typed,
 * safety-gated drafts. The rollout is opt-in with KITCHEN_WORKFLOW_V1.
 */

import { buildGenerationConstraints } from '../../../shared/culinary-profile.js';
import { handleGroceryList } from './grocery-list-handler.js';
import { handleMealPlanFill, parseSlot } from './meal-plan-fill-handler.js';
import {
  KITCHEN_WORKFLOW_TTL_SECONDS,
  WORKFLOW_TYPES,
  addCheckpoint,
  appendAudit,
  createKitchenWorkflow,
  markWorkflowCancelled,
  markWorkflowCompleted,
  markWorkflowFailed,
  normalizeKitchenWorkflow,
  setPendingInterrupt
} from '../kitchen-workflow.js';

const MAX_SLOTS = 28;
const MAX_DERIVED_SLOTS = 7;
const MAX_REPAIR_ATTEMPTS = 2;
const OWNER_ID_MAX_LENGTH = 160;
const WORKFLOW_ID_PATTERN = /^kwf_[A-Za-z0-9_-]{8,120}$/;
const OWNER_ID_PATTERN = /^[A-Za-z0-9@._:+-]{1,160}$/;

// The fallback is useful for local unit tests where Cloudflare bindings do not
// exist. Production/staging use RECIPE_STORAGE and therefore remain durable.
const memoryStore = new Map();

// ---------------------------------------------------------------------------
// Fix #1 — per-key write-serialization lock.
//
// Cloudflare KV has no compare-and-set primitive, so we use an in-process
// Promise-chain lock keyed by storage key. Each mutating operation (resume /
// cancel) acquires the lock before loading, runs the version check, mutates,
// and saves — all while the lock is held. Concurrent requests for the same
// workflow are therefore serialized into the same isolate queue, preventing a
// read-modify-write race between two simultaneous resumes that carry the same
// expectedVersion. Read-only requests (GET) skip the lock.
// ---------------------------------------------------------------------------
const writeLocks = new Map();

async function withWriteLock(storageKey, fn) {
  const prev = writeLocks.get(storageKey) ?? Promise.resolve();
  let resolve;
  const next = new Promise((r) => {
    resolve = r;
  });
  writeLocks.set(storageKey, next);
  try {
    await prev;
    return await fn();
  } finally {
    resolve();
    // Evict the entry once both the outgoing and next-in-line have released so
    // the map does not grow unboundedly for long-running isolates.
    if (writeLocks.get(storageKey) === next) {
      writeLocks.delete(storageKey);
    }
  }
}

function json(body, status, corsHeaders) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

function featureEnabled(env) {
  const value =
    env?.KITCHEN_WORKFLOW_V1 ??
    env?.FEATURE_KITCHEN_WORKFLOW_V1 ??
    env?.kitchen_workflow_v1;
  return ['1', 'true', 'on', 'enabled'].includes(String(value ?? '').toLowerCase());
}

function featureDisabled(corsHeaders) {
  return json(
    {
      success: false,
      error: 'Kitchen Workflow V1 is not enabled',
      code: 'FEATURE_DISABLED'
    },
    404,
    corsHeaders
  );
}

function invalid(message, corsHeaders, status = 400, code = 'INVALID_INPUT') {
  return json({ success: false, error: message, code }, status, corsHeaders);
}

function readOwnerId(request, body, url) {
  const candidate =
    request.headers.get('X-User-Id') ||
    body?.userId ||
    body?.ownerId ||
    url?.searchParams.get('userId') ||
    'anonymous';
  const ownerId = typeof candidate === 'string' ? candidate.trim() : '';
  if (
    !OWNER_ID_PATTERN.test(ownerId.slice(0, OWNER_ID_MAX_LENGTH)) ||
    ownerId.length > OWNER_ID_MAX_LENGTH
  ) {
    return null;
  }
  return ownerId;
}

function validWorkflowId(workflowId) {
  return typeof workflowId === 'string' && WORKFLOW_ID_PATTERN.test(workflowId);
}

function workflowStorageKey(ownerId, workflowId) {
  return `kitchen-workflow:v1:${encodeURIComponent(ownerId)}:${encodeURIComponent(workflowId)}`;
}

function storageFor(env) {
  return env?.RECIPE_STORAGE && typeof env.RECIPE_STORAGE.get === 'function'
    ? env.RECIPE_STORAGE
    : null;
}

async function loadWorkflow(env, ownerId, workflowId) {
  const key = workflowStorageKey(ownerId, workflowId);
  const storage = storageFor(env);
  let raw;
  if (storage) {
    raw = await storage.get(key);
  } else {
    raw = memoryStore.get(key) ?? null;
  }
  if (raw == null) return null;

  const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
  const workflow = normalizeKitchenWorkflow(parsed);
  if (!workflow) return null;
  if (workflow.userId !== ownerId) return null;
  if (workflow.expiresAt && Date.parse(workflow.expiresAt) <= Date.now()) {
    return null;
  }
  return workflow;
}

async function saveWorkflow(env, workflow) {
  const ownerId = workflow.userId || 'anonymous';
  const key = workflowStorageKey(ownerId, workflow.workflowId);
  const value = JSON.stringify({
    ...workflow,
    expiresAt:
      workflow.expiresAt ||
      new Date(Date.now() + KITCHEN_WORKFLOW_TTL_SECONDS * 1000).toISOString()
  });
  const storage = storageFor(env);
  if (storage) {
    await storage.put(key, value, { expirationTtl: KITCHEN_WORKFLOW_TTL_SECONDS });
  } else {
    memoryStore.set(key, value);
  }
  return normalizeKitchenWorkflow(JSON.parse(value));
}

export function clearKitchenWorkflowMemory() {
  memoryStore.clear();
}

export function getKitchenWorkflowStorageKey(ownerId, workflowId) {
  return workflowStorageKey(ownerId, workflowId);
}

function createIdDate(offsetDays) {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function deriveSlots(type, rawGoal) {
  const goalText = typeof rawGoal === 'string' ? rawGoal.toLowerCase() : '';
  const match = goalText.match(/\b([1-7])\s+(?:dinners?|meals?)\b/);
  const requestedCount = match ? Number(match[1]) : type === 'dinner_tonight' ? 1 : 3;
  const count = Math.min(Math.max(requestedCount, 1), MAX_DERIVED_SLOTS);
  const firstOffset = type === 'dinner_tonight' ? 0 : 1;
  return Array.from({ length: count }, (_, index) => `${createIdDate(firstOffset + index)}::dinner`);
}

function normalizeSlots(rawSlots, type, rawGoal = '') {
  const candidate = rawSlots === undefined ? deriveSlots(type, rawGoal) : rawSlots;
  if (!Array.isArray(candidate) || candidate.length === 0 || candidate.length > MAX_SLOTS) {
    return { error: `slots must contain between 1 and ${MAX_SLOTS} valid meal slots` };
  }
  const slots = [];
  const seen = new Set();
  for (const raw of candidate) {
    const parsed = parseSlot(raw);
    if (!parsed) return { error: `Invalid slot: ${String(raw)}` };
    const key = `${parsed.date}::${parsed.mealType}`;
    if (seen.has(key)) return { error: `Duplicate slot: ${key}` };
    seen.add(key);
    slots.push(key);
  }
  return { slots };
}

function normalizeGoal(body) {
  const source = body?.goal ?? body?.prompt ?? body?.message;
  if (source && typeof source === 'object' && !Array.isArray(source)) {
    return JSON.parse(JSON.stringify(source));
  }
  return {
    description: typeof source === 'string' ? source.trim().slice(0, 500) : ''
  };
}

// ---------------------------------------------------------------------------
// Fix #2 — merge edit_plan overrides before regenerating.
//
// Previously this function selected `existing` as `base` and then only updated
// hardAllergens, discarding every other submitted override (dietary,
// maxCookTime, etc.). The corrected version spreads the caller's `overrides`
// over `existing` so all fields are applied, then reapplies the union of hard
// allergens from all three sources so no stored/profile block can be weakened.
// ---------------------------------------------------------------------------
function mergeConstraints(profile, overrides, existing = null) {
  const profileConstraints = buildGenerationConstraints(profile || {}, {});
  const requestedOverrides = overrides && typeof overrides === 'object' ? overrides : {};
  const freshConstraints = buildGenerationConstraints({}, requestedOverrides);

  // buildGenerationConstraints supplies safe defaults for every field. When an
  // edit is applied to an existing workflow, copying that whole object would
  // silently reset constraints that the user did not edit (for example,
  // changing dietary preferences would reset a custom cuisine). Only copy a
  // canonical field when one of its accepted input aliases was explicitly sent.
  const overrideAliases = {
    dietary: ['dietary', 'diet_tags'],
    hardAllergens: ['hardAllergens', 'hard_allergens'],
    softAvoids: ['softAvoids', 'soft_avoids'],
    cuisine: ['cuisine'],
    equipment: ['equipment'],
    servings: ['servings'],
    maxCookTime: ['maxCookTime', 'max_cook_time_min'],
    spiceLevel: ['spiceLevel', 'spice_level'],
    skillLevel: ['skillLevel', 'skill_level'],
    excludeIngredients: ['excludeIngredients', 'exclude_ingredients'],
    nutritionGoals: ['nutritionGoals', 'nutrition_goals'],
    inferredPreferences: ['inferredPreferences', 'inferred_preferences'],
    units: ['units', 'units_pref'],
    lifestyleModes: ['lifestyleModes', 'lifestyle_modes'],
    budgetBand: ['budgetBand', 'budget_band'],
    mealBudgetUsd: ['mealBudgetUsd', 'meal_budget_usd'],
    seasonality: ['seasonality']
  };

  const base = existing
    ? { ...existing }
    : buildGenerationConstraints(profile || {}, requestedOverrides);
  if (existing) {
    for (const [field, aliases] of Object.entries(overrideAliases)) {
      if (aliases.some((alias) => Object.prototype.hasOwnProperty.call(requestedOverrides, alias))) {
        base[field] = freshConstraints[field];
      }
    }
  }

  // An explicit empty override must never weaken a stored/profile hard block.
  base.hardAllergens = [
    ...new Set([
      ...(profileConstraints.hardAllergens || []),
      ...(freshConstraints.hardAllergens || []),
      ...(existing?.hardAllergens || [])
    ])
  ];
  return base;
}

function buildPlanRequest(workflow, repairNote = '') {
  const body = {
    slots: workflow.state.slots,
    overrides: workflow.state.constraints,
    hardAllergens: workflow.state.constraints.hardAllergens,
    usePantry: workflow.state.usePantry,
    pantryIngredients: workflow.state.pantryIngredients,
    prioritizeExpiring: workflow.state.usePantry,
    generateImage: false
  };
  if (repairNote) {
    body.overrides = {
      ...body.overrides,
      notes: repairNote.slice(0, 240)
    };
  }
  return body;
}

async function responseJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Fix #4 — reject partial meal-plan fills before approval.
//
// Previously the success condition accepted any non-empty meals array even
// when fewer meals were returned than slots requested, allowing the workflow to
// proceed through approval and grocery generation with a partial plan.
// The corrected check requires that every requested slot is filled; a partial
// result is now treated as a failure and routed to the repair interrupt with a
// PARTIAL_PLAN_FILL code so the user can retry or cancel.
// ---------------------------------------------------------------------------
async function runPlanDraft(workflow, env, corsHeaders, repairNote = '') {
  const request = new Request('https://internal/agent/workflow/plan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildPlanRequest(workflow, repairNote))
  });
  try {
    const response = await handleMealPlanFill(request, env, corsHeaders);
    const data = await responseJson(response);
    const expectedSlots = workflow.state.slots;
    const expectedCount = expectedSlots.length;
    const returnedMeals = Array.isArray(data?.meals) ? data.meals : [];
    const returnedSlots = new Set(
      returnedMeals
        .map((meal) => meal?.slot)
        .filter((slot) => typeof slot === 'string')
    );
    const mealsOk =
      returnedMeals.length === expectedCount &&
      returnedSlots.size === expectedCount &&
      expectedSlots.every((slot) => returnedSlots.has(slot));
    if (!response.ok || !data?.success || !mealsOk) {
      const firstWarning = Array.isArray(data?.warnings) ? data.warnings[0] : null;
      // Distinguish a partial fill from a total failure for better UX messages.
      const hasSomeMeals = returnedMeals.length > 0;
      const isPartial =
        response.ok && data?.success === true && hasSomeMeals && returnedMeals.length < expectedCount;
      return {
        ok: false,
        code: isPartial
          ? 'PARTIAL_PLAN_FILL'
          : firstWarning?.code || data?.code || 'PLAN_DRAFT_FAILED',
        message: isPartial
          ? `Only ${returnedMeals.length} of ${expectedCount} requested slots were filled`
          : firstWarning?.message || data?.error || 'Could not draft a safe meal plan',
        warnings: data?.warnings || []
      };
    }
    return {
      ok: true,
      draft: {
        slots: workflow.state.slots,
        meals: data.meals,
        warnings: Array.isArray(data.warnings) ? data.warnings : [],
        generatedAt: new Date().toISOString()
      }
    };
  } catch (error) {
    return {
      ok: false,
      code: 'PLAN_DRAFT_FAILED',
      message: error instanceof Error ? error.message : 'Could not draft a safe meal plan',
      warnings: []
    };
  }
}

function setPlanProposal(workflow, planResult, auditEvent = 'plan_drafted') {
  workflow.state.planDraft = planResult.draft;
  workflow.state.repair = null;
  workflow.state.node = 'validate_safety';
  addCheckpoint(workflow, 'validate_safety', {
    mealCount: planResult.draft.meals.length,
    warningCount: planResult.draft.warnings.length
  });
  appendAudit(workflow, auditEvent, 'validate_safety', {
    mealCount: planResult.draft.meals.length,
    warningCount: planResult.draft.warnings.length
  });
  workflow.state.node = 'propose_plan';
  setPendingInterrupt(
    workflow,
    'approve_plan',
    'Review the meal plan draft before it is used to build a grocery list.',
    [
      { action: 'approve_plan', label: 'Approve plan' },
      { action: 'edit_plan', label: 'Edit constraints and regenerate' },
      { action: 'cancel', label: 'Cancel workflow' }
    ]
  );
}

function setRepairInterrupt(workflow, result, attempt) {
  workflow.state.node = 'validate_safety';
  workflow.state.repair = {
    attempts: attempt,
    code: result.code,
    message: result.message,
    warnings: result.warnings,
    at: new Date().toISOString()
  };
  setPendingInterrupt(
    workflow,
    'repair_plan',
    `${result.message}. Retry the draft or cancel this workflow.`,
    [
      { action: 'retry_plan', label: 'Retry plan' },
      { action: 'cancel', label: 'Cancel workflow' }
    ]
  );
  appendAudit(workflow, 'plan_repair_required', 'validate_safety', {
    attempt,
    code: result.code
  });
}

function ingredientLinesFromDraft(planDraft) {
  const lines = [];
  for (const meal of planDraft?.meals || []) {
    const ingredients = meal?.recipe?.ingredients;
    if (!Array.isArray(ingredients)) continue;
    for (const ingredient of ingredients) {
      if (typeof ingredient === 'string' && ingredient.trim()) {
        lines.push(ingredient.trim().slice(0, 400));
      } else if (
        ingredient &&
        typeof ingredient === 'object' &&
        typeof ingredient.name === 'string' &&
        ingredient.name.trim()
      ) {
        const quantity = ingredient.quantity == null ? '' : `${ingredient.quantity} `;
        const unit = ingredient.unit == null ? '' : `${ingredient.unit} `;
        lines.push(`${quantity}${unit}${ingredient.name}`.trim().slice(0, 400));
      }
    }
  }
  return [...new Set(lines)];
}

async function runGroceryDraft(workflow, env, corsHeaders) {
  const ingredients = ingredientLinesFromDraft(workflow.state.planDraft);
  if (ingredients.length === 0) {
    return {
      ok: false,
      code: 'GROCERY_INPUT_EMPTY',
      message: 'The approved plan did not contain grocery ingredients.'
    };
  }
  const body = { ingredients };
  if (workflow.state.usePantry) body.pantryItems = workflow.state.pantryIngredients;
  const request = new Request('https://internal/agent/workflow/grocery', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  try {
    const response = await handleGroceryList(request, env, corsHeaders);
    const data = await responseJson(response);
    if (!response.ok || !data?.success || !Array.isArray(data.categories)) {
      return {
        ok: false,
        code: data?.code || 'GROCERY_DRAFT_FAILED',
        message: data?.error || 'Could not build the grocery draft.'
      };
    }
    return {
      ok: true,
      draft: {
        categories: data.categories,
        pantryMatched: data.pantryMatched === true,
        ingredientCount: ingredients.length,
        generatedAt: new Date().toISOString()
      }
    };
  } catch (error) {
    return {
      ok: false,
      code: 'GROCERY_DRAFT_FAILED',
      message: error instanceof Error ? error.message : 'Could not build the grocery draft.'
    };
  }
}

function setGroceryCheckpoint(workflow, groceryResult) {
  workflow.state.groceryDraft = groceryResult.draft;
  workflow.state.node = 'await_shop';
  addCheckpoint(workflow, 'await_shop', {
    categoryCount: groceryResult.draft.categories.length,
    ingredientCount: groceryResult.draft.ingredientCount
  });
  appendAudit(workflow, 'grocery_drafted', 'await_shop', {
    categoryCount: groceryResult.draft.categories.length,
    pantryMatched: groceryResult.draft.pantryMatched
  });
  setPendingInterrupt(
    workflow,
    'grocery_done',
    'The grocery draft is ready. Resume after the shopping trip to continue prep.',
    [
      { action: 'grocery_done', label: 'Shopping complete' },
      { action: 'cancel', label: 'Cancel workflow' }
    ]
  );
}

function actionName(body) {
  const action = body?.action ?? body?.decision;
  if (typeof action === 'string') return action.trim().toLowerCase();
  if (action && typeof action === 'object') {
    const name = action.type || action.action;
    if (typeof name === 'string') return name.trim().toLowerCase();
  }
  return '';
}

function versionConflict(workflow, body, corsHeaders) {
  if (body?.expectedVersion === undefined) return null;
  if (!Number.isInteger(body.expectedVersion) || body.expectedVersion !== workflow.version) {
    return json(
      {
        success: false,
        error: 'Workflow version is stale; reload before resuming',
        code: 'VERSION_CONFLICT',
        workflowId: workflow.workflowId,
        version: workflow.version
      },
      409,
      corsHeaders
    );
  }
  return null;
}

function workflowResponse(workflow, corsHeaders) {
  return json(
    {
      success: true,
      workflowId: workflow.workflowId,
      status: workflow.status,
      traceId: workflow.traceId,
      workflow
    },
    200,
    corsHeaders
  );
}

async function persistAndRespond(env, workflow, corsHeaders) {
  try {
    workflow.version += 1;
    const saved = await saveWorkflow(env, workflow);
    return workflowResponse(saved, corsHeaders);
  } catch {
    return invalid('Workflow storage is unavailable', corsHeaders, 503, 'STORAGE_ERROR');
  }
}

async function parseBody(request, corsHeaders) {
  const contentType = request.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    return { error: invalid('Content-Type must be application/json', corsHeaders) };
  }
  try {
    return { body: await request.json() };
  } catch {
    return { error: invalid('Request body must be valid JSON', corsHeaders, 400, 'INVALID_JSON') };
  }
}

/** POST /agent/workflow/start */
export async function handleKitchenWorkflowStart(request, env, corsHeaders) {
  if (!featureEnabled(env)) return featureDisabled(corsHeaders);
  const parsed = await parseBody(request, corsHeaders);
  if (parsed.error) return parsed.error;
  const body = parsed.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return invalid('Request body must be a JSON object', corsHeaders);
  }

  const url = new URL(request.url);
  const ownerId = readOwnerId(request, body, url);
  if (!ownerId) return invalid('userId must be a short, valid account identifier', corsHeaders);
  const type = body.type || 'week_plan';
  if (!WORKFLOW_TYPES.includes(type)) {
    return invalid(`type must be one of: ${WORKFLOW_TYPES.join(', ')}`, corsHeaders);
  }
  const goal = normalizeGoal(body);
  const slotResult = normalizeSlots(
    body.slots,
    type,
    typeof goal.description === 'string' ? goal.description : ''
  );
  if (slotResult.error) return invalid(slotResult.error, corsHeaders);

  const constraints = mergeConstraints(
    body.culinaryProfile || body.profile,
    body.overrides || body.constraints
  );
  const workflow = createKitchenWorkflow({
    type,
    userId: ownerId,
    goal,
    constraints,
    slots: slotResult.slots,
    usePantry: body.usePantry === true,
    pantryIngredients: Array.isArray(body.pantryIngredients) ? body.pantryIngredients : []
  });

  const planResult = await runPlanDraft(workflow, env, corsHeaders);
  if (planResult.ok) {
    setPlanProposal(workflow, planResult);
  } else {
    setRepairInterrupt(workflow, planResult, 1);
  }

  try {
    workflow.version += 1;
    const saved = await saveWorkflow(env, workflow);
    return workflowResponse(saved, corsHeaders);
  } catch {
    return invalid('Workflow storage is unavailable', corsHeaders, 503, 'STORAGE_ERROR');
  }
}

/** GET /agent/workflow/:workflowId */
export async function handleKitchenWorkflowGet(request, env, corsHeaders, workflowId) {
  if (!featureEnabled(env)) return featureDisabled(corsHeaders);
  if (!validWorkflowId(workflowId)) {
    return invalid('Invalid workflow ID format', corsHeaders, 400, 'INVALID_WORKFLOW_ID');
  }

  const url = new URL(request.url);
  const ownerId = readOwnerId(request, null, url);
  if (!ownerId) return invalid('userId must be a short, valid account identifier', corsHeaders);

  const workflow = await loadWorkflow(env, ownerId, workflowId);
  if (!workflow) {
    return json(
      { success: false, error: 'Workflow not found', code: 'WORKFLOW_NOT_FOUND' },
      404,
      corsHeaders
    );
  }

  // ---------------------------------------------------------------------------
  // Fix #5 — recovery path for persisted running checkpoints with no interrupt.
  //
  // If execution ended after the initial save but before a final KV write (e.g.
  // a timeout or crash), the only durable record is status:"running" with
  // pendingInterrupt:null. GET now surfaces a recoverableRunning flag and a
  // descriptive message so clients know a `recover` resume action is available.
  // ---------------------------------------------------------------------------
  const recoverableRunning =
    workflow.status === 'running' && workflow.pendingInterrupt === null;

  const responseBody = {
    success: true,
    workflowId: workflow.workflowId,
    status: workflow.status,
    traceId: workflow.traceId,
    workflow
  };
  if (recoverableRunning) {
    responseBody.recoverableRunning = true;
    responseBody.recoveryMessage =
      'This workflow was interrupted before completing its last step. ' +
      'Resume with action "recover" to retry from the last checkpoint.';
  }
  return json(responseBody, 200, corsHeaders);
}

/** POST /agent/workflow/:workflowId/resume */
export async function handleKitchenWorkflowResume(request, env, corsHeaders, workflowId) {
  if (!featureEnabled(env)) return featureDisabled(corsHeaders);
  if (!validWorkflowId(workflowId)) {
    return invalid('Invalid workflow ID format', corsHeaders, 400, 'INVALID_WORKFLOW_ID');
  }

  const parsed = await parseBody(request, corsHeaders);
  if (parsed.error) return parsed.error;
  const body = parsed.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return invalid('Request body must be a JSON object', corsHeaders);
  }

  const url = new URL(request.url);
  const ownerId = readOwnerId(request, body, url);
  if (!ownerId) return invalid('userId must be a short, valid account identifier', corsHeaders);

  const storageKey = workflowStorageKey(ownerId, workflowId);

  // Fix #1: acquire the per-key write lock before loading so concurrent resume
  // and cancel requests for the same workflow are serialized.
  return withWriteLock(storageKey, async () => {
    const workflow = await loadWorkflow(env, ownerId, workflowId);
    if (!workflow) {
      return json(
        { success: false, error: 'Workflow not found', code: 'WORKFLOW_NOT_FOUND' },
        404,
        corsHeaders
      );
    }

    const conflict = versionConflict(workflow, body, corsHeaders);
    if (conflict) return conflict;

    const action = actionName(body);

    // -------------------------------------------------------------------------
    // Fix #5 — recovery action for running-with-no-interrupt workflows.
    //
    // A workflow stranded in status:"running" with no pendingInterrupt can be
    // resumed with action:"recover". The handler re-runs the plan draft from the
    // current node so the user is not forced to start over. Any other action
    // against such a workflow is rejected with WORKFLOW_NOT_AWAITING_USER.
    // -------------------------------------------------------------------------
    if (workflow.status === 'running' && workflow.pendingInterrupt === null) {
      if (action !== 'recover') {
        return json(
          {
            success: false,
            error:
              'Workflow is running but has no pending interrupt; resume with action "recover" to retry',
            code: 'WORKFLOW_NOT_AWAITING_USER',
            recoverableRunning: true
          },
          409,
          corsHeaders
        );
      }
      // Recovery: re-attempt the draft from the last durable checkpoint.
      appendAudit(workflow, 'workflow_recovered', workflow.state.node || 'draft_plan', {
        fromNode: workflow.state.node
      });
      const planResult = await runPlanDraft(workflow, env, corsHeaders);
      if (planResult.ok) {
        setPlanProposal(workflow, planResult, 'plan_drafted_after_recovery');
      } else {
        const attempt = (workflow.state.repair?.attempts || 0) + 1;
        if (attempt >= MAX_REPAIR_ATTEMPTS) {
          markWorkflowFailed(
            workflow,
            'REPAIR_EXHAUSTED',
            'Maximum plan repair attempts reached. Start a new workflow.',
            'validate_safety'
          );
        } else {
          setRepairInterrupt(workflow, planResult, attempt);
        }
      }
      return persistAndRespond(env, workflow, corsHeaders);
    }

    if (workflow.status !== 'awaiting_user') {
      return json(
        {
          success: false,
          error: `Workflow is ${workflow.status} and cannot be resumed`,
          code: 'WORKFLOW_NOT_AWAITING_USER'
        },
        409,
        corsHeaders
      );
    }

    const interruptType = workflow.pendingInterrupt?.type;

    // --- cancel is allowed from any awaiting_user interrupt ---
    if (action === 'cancel') {
      const reason =
        typeof body.reason === 'string'
          ? body.reason.trim().slice(0, 240)
          : 'cancelled_by_user';
      markWorkflowCancelled(workflow, reason);
      appendAudit(workflow, 'cancel_requested', workflow.state.node, { reason });
      return persistAndRespond(env, workflow, corsHeaders);
    }

    // --- approve_plan ---
    if (interruptType === 'approve_plan' && action === 'approve_plan') {
      workflow.pendingInterrupt = null;
      workflow.status = 'running';
      appendAudit(workflow, 'plan_approved', 'build_grocery', {});
      workflow.state.node = 'build_grocery';
      addCheckpoint(workflow, 'build_grocery', {});

      const groceryResult = await runGroceryDraft(workflow, env, corsHeaders);
      if (!groceryResult.ok) {
        markWorkflowFailed(
          workflow,
          groceryResult.code,
          groceryResult.message,
          'build_grocery'
        );
        return persistAndRespond(env, workflow, corsHeaders);
      }
      setGroceryCheckpoint(workflow, groceryResult);
      return persistAndRespond(env, workflow, corsHeaders);
    }

    // --- edit_plan: merge overrides and regenerate ---
    if (interruptType === 'approve_plan' && action === 'edit_plan') {
      // Fix #2: merge the caller's overrides (dietary, maxCookTime, etc.) over
      // the existing constraints, then reapply the full allergen union.
      const updatedConstraints = mergeConstraints(
        null,
        body.overrides || {},
        workflow.state.constraints
      );
      workflow.state.constraints = updatedConstraints;
      workflow.pendingInterrupt = null;
      workflow.status = 'running';
      appendAudit(workflow, 'plan_edit_requested', workflow.state.node, {
        overrideKeys: Object.keys(body.overrides || {})
      });

      const planResult = await runPlanDraft(workflow, env, corsHeaders);
      if (planResult.ok) {
        setPlanProposal(workflow, planResult, 'plan_redrafted');
      } else {
        const attempt = (workflow.state.repair?.attempts || 0) + 1;
        if (attempt >= MAX_REPAIR_ATTEMPTS) {
          markWorkflowFailed(
            workflow,
            'REPAIR_EXHAUSTED',
            'Maximum plan repair attempts reached. Start a new workflow.',
            'validate_safety'
          );
        } else {
          setRepairInterrupt(workflow, planResult, attempt);
        }
      }
      return persistAndRespond(env, workflow, corsHeaders);
    }

    // --- retry_plan ---
    if (interruptType === 'repair_plan' && action === 'retry_plan') {
      const attempt = (workflow.state.repair?.attempts || 1) + 1;
      if (attempt > MAX_REPAIR_ATTEMPTS) {
        markWorkflowFailed(
          workflow,
          'REPAIR_EXHAUSTED',
          'Maximum plan repair attempts reached. Start a new workflow.',
          'validate_safety'
        );
        return persistAndRespond(env, workflow, corsHeaders);
      }
      workflow.pendingInterrupt = null;
      workflow.status = 'running';
      const repairNote =
        typeof body.note === 'string' ? body.note.trim().slice(0, 240) : '';
      const planResult = await runPlanDraft(workflow, env, corsHeaders, repairNote);
      if (planResult.ok) {
        setPlanProposal(workflow, planResult, 'plan_repaired');
      } else {
        setRepairInterrupt(workflow, planResult, attempt);
      }
      return persistAndRespond(env, workflow, corsHeaders);
    }

    // --- grocery_done ---
    if (interruptType === 'grocery_done' && action === 'grocery_done') {
      workflow.pendingInterrupt = null;
      workflow.status = 'running';
      workflow.state.node = 'optional_prep';
      addCheckpoint(workflow, 'optional_prep', {});
      appendAudit(workflow, 'shopping_complete', 'optional_prep', {});
      setPendingInterrupt(
        workflow,
        'prep_done',
        'Shopping is complete. Record prep steps or skip to cooking.',
        [
          { action: 'prep_done', label: 'Prep complete' },
          { action: 'skip_prep', label: 'Skip prep' },
          { action: 'cancel', label: 'Cancel workflow' }
        ]
      );
      return persistAndRespond(env, workflow, corsHeaders);
    }

    // --- prep_done / skip_prep ---
    if (interruptType === 'prep_done' && (action === 'prep_done' || action === 'skip_prep')) {
      workflow.pendingInterrupt = null;
      workflow.status = 'running';
      workflow.state.node = 'ready_to_cook';
      addCheckpoint(workflow, 'ready_to_cook', { skipped: action === 'skip_prep' });
      appendAudit(
        workflow,
        action === 'skip_prep' ? 'prep_skipped' : 'prep_done',
        'ready_to_cook',
        {}
      );
      setPendingInterrupt(
        workflow,
        'ready_to_cook',
        'Everything is prepped. Start cooking when ready.',
        [
          { action: 'start_cooking', label: 'Start cooking' },
          { action: 'cancel', label: 'Cancel workflow' }
        ]
      );
      return persistAndRespond(env, workflow, corsHeaders);
    }

    // --- start_cooking ---
    if (interruptType === 'ready_to_cook' && action === 'start_cooking') {
      markWorkflowCompleted(workflow, 'complete', { cookSessionReady: true });
      return persistAndRespond(env, workflow, corsHeaders);
    }

    // Unknown / invalid action for current interrupt
    return json(
      {
        success: false,
        error: `Action "${action}" is not valid for interrupt "${interruptType}"`,
        code: 'INVALID_WORKFLOW_ACTION'
      },
      409,
      corsHeaders
    );
  });
}

/** POST /agent/workflow/:workflowId/cancel */
export async function handleKitchenWorkflowCancel(request, env, corsHeaders, workflowId) {
  if (!featureEnabled(env)) return featureDisabled(corsHeaders);
  if (!validWorkflowId(workflowId)) {
    return invalid('Invalid workflow ID format', corsHeaders, 400, 'INVALID_WORKFLOW_ID');
  }

  const parsed = await parseBody(request, corsHeaders);
  if (parsed.error) return parsed.error;
  const body = parsed.body ?? {};
  if (typeof body !== 'object' || Array.isArray(body)) {
    return invalid('Request body must be a JSON object', corsHeaders);
  }

  const url = new URL(request.url);
  const ownerId = readOwnerId(request, body, url);
  if (!ownerId) return invalid('userId must be a short, valid account identifier', corsHeaders);

  const storageKey = workflowStorageKey(ownerId, workflowId);

  // Fix #1: acquire the write lock before loading so a concurrent resume
  // cannot overwrite a cancel that has already committed.
  return withWriteLock(storageKey, async () => {
    const workflow = await loadWorkflow(env, ownerId, workflowId);
    if (!workflow) {
      return json(
        { success: false, error: 'Workflow not found', code: 'WORKFLOW_NOT_FOUND' },
        404,
        corsHeaders
      );
    }

    const reason =
      typeof body.reason === 'string'
        ? body.reason.trim().slice(0, 240)
        : 'cancelled_by_user';
    markWorkflowCancelled(workflow, reason);
    appendAudit(workflow, 'cancel_requested', workflow.state.node, { reason });
    return persistAndRespond(env, workflow, corsHeaders);
  });
}
