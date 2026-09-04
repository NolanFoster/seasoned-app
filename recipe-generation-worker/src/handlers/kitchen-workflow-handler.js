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

function json(body, status, corsHeaders) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

function featureEnabled(env) {
  const value = env?.KITCHEN_WORKFLOW_V1
    ?? env?.FEATURE_KITCHEN_WORKFLOW_V1
    ?? env?.kitchen_workflow_v1;
  return ['1', 'true', 'on', 'enabled'].includes(String(value ?? '').toLowerCase());
}

function featureDisabled(corsHeaders) {
  return json({
    success: false,
    error: 'Kitchen Workflow V1 is not enabled',
    code: 'FEATURE_DISABLED'
  }, 404, corsHeaders);
}

function invalid(message, corsHeaders, status = 400, code = 'INVALID_INPUT') {
  return json({ success: false, error: message, code }, status, corsHeaders);
}

function readOwnerId(request, body, url) {
  const candidate = request.headers.get('X-User-Id')
    || body?.userId
    || body?.ownerId
    || url?.searchParams.get('userId')
    || 'anonymous';
  const ownerId = typeof candidate === 'string' ? candidate.trim() : '';
  if (!OWNER_ID_PATTERN.test(ownerId.slice(0, OWNER_ID_MAX_LENGTH)) || ownerId.length > OWNER_ID_MAX_LENGTH) {
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
    expiresAt: workflow.expiresAt || new Date(Date.now() + KITCHEN_WORKFLOW_TTL_SECONDS * 1000).toISOString()
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

function mergeConstraints(profile, overrides, existing = null) {
  const profileConstraints = buildGenerationConstraints(profile || {}, {});
  const freshConstraints = buildGenerationConstraints({}, overrides || {});
  const base = existing || buildGenerationConstraints(profile || {}, overrides || {});
  // An explicit empty override must never weaken a stored/profile hard block.
  base.hardAllergens = [...new Set([
    ...(profileConstraints.hardAllergens || []),
    ...(freshConstraints.hardAllergens || []),
    ...(existing?.hardAllergens || [])
  ])];
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

async function runPlanDraft(workflow, env, corsHeaders, repairNote = '') {
  const request = new Request('https://internal/agent/workflow/plan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildPlanRequest(workflow, repairNote))
  });
  try {
    const response = await handleMealPlanFill(request, env, corsHeaders);
    const data = await responseJson(response);
    if (!response.ok || !data?.success || !Array.isArray(data.meals) || data.meals.length === 0) {
      const firstWarning = Array.isArray(data?.warnings) ? data.warnings[0] : null;
      return {
        ok: false,
        code: firstWarning?.code || data?.code || 'PLAN_DRAFT_FAILED',
        message: firstWarning?.message || data?.error || 'Could not draft a safe meal plan',
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
      } else if (ingredient && typeof ingredient === 'object' && typeof ingredient.name === 'string' && ingredient.name.trim()) {
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
    return { ok: false, code: 'GROCERY_INPUT_EMPTY', message: 'The approved plan did not contain grocery ingredients.' };
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
    return json({
      success: false,
      error: 'Workflow version is stale; reload before resuming',
      code: 'VERSION_CONFLICT',
      workflowId: workflow.workflowId,
      version: workflow.version
    }, 409, corsHeaders);
  }
  return null;
}

function workflowResponse(workflow, corsHeaders) {
  return json({
    success: true,
    workflowId: workflow.workflowId,
    status: workflow.status,
    traceId: workflow.traceId,
    workflow
  }, 200, corsHeaders);
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
  const slotResult = normalizeSlots(body.slots, type, goal.description);
  if (slotResult.error) return invalid(slotResult.error, corsHeaders);

  const profile = body.culinaryProfile || body.profile || {};
  const overrides = body.constraints || body.overrides || {};
  const constraints = mergeConstraints(profile, overrides);
  const workflow = createKitchenWorkflow({
    type,
    userId: ownerId,
    goal,
    constraints,
    slots: slotResult.slots,
    usePantry: body.usePantry === true,
    pantryIngredients: Array.isArray(body.pantryIngredients) ? body.pantryIngredients.slice(0, 50) : []
  });

  // Persist the running shell before doing model work. A request timeout can
  // therefore be recovered as a visible in-progress workflow on the next call.
  try {
    await saveWorkflow(env, workflow);
  } catch {
    return invalid('Workflow storage is unavailable', corsHeaders, 503, 'STORAGE_ERROR');
  }
  workflow.state.node = 'retrieve_pantry';
  addCheckpoint(workflow, 'retrieve_pantry', {
    pantryItemCount: workflow.state.pantryIngredients.length
  });
  appendAudit(workflow, 'pantry_retrieved', 'retrieve_pantry', {
    pantryItemCount: workflow.state.pantryIngredients.length
  });
  workflow.state.node = 'draft_plan';

  const planResult = await runPlanDraft(workflow, env, corsHeaders);
  if (planResult.ok) {
    setPlanProposal(workflow, planResult);
  } else {
    setRepairInterrupt(workflow, planResult, 1);
  }
  return persistAndRespond(env, workflow, corsHeaders);
}

/** GET /agent/workflow/:id */
export async function handleKitchenWorkflowGet(request, env, corsHeaders, workflowId) {
  if (!featureEnabled(env)) return featureDisabled(corsHeaders);
  if (!validWorkflowId(workflowId)) return invalid('Invalid workflowId', corsHeaders, 400, 'INVALID_WORKFLOW_ID');
  const url = new URL(request.url);
  const ownerId = readOwnerId(request, null, url);
  if (!ownerId) return invalid('userId must be a short, valid account identifier', corsHeaders);
  try {
    const workflow = await loadWorkflow(env, ownerId, workflowId);
    if (!workflow) return invalid('Workflow not found', corsHeaders, 404, 'WORKFLOW_NOT_FOUND');
    return workflowResponse(workflow, corsHeaders);
  } catch {
    return invalid('Workflow storage is unavailable', corsHeaders, 503, 'STORAGE_ERROR');
  }
}

/** POST /agent/workflow/:id/resume */
export async function handleKitchenWorkflowResume(request, env, corsHeaders, workflowId) {
  if (!featureEnabled(env)) return featureDisabled(corsHeaders);
  if (!validWorkflowId(workflowId)) return invalid('Invalid workflowId', corsHeaders, 400, 'INVALID_WORKFLOW_ID');
  const parsed = await parseBody(request, corsHeaders);
  if (parsed.error) return parsed.error;
  const body = parsed.body || {};
  const url = new URL(request.url);
  const ownerId = readOwnerId(request, body, url);
  if (!ownerId) return invalid('userId must be a short, valid account identifier', corsHeaders);
  const action = actionName(body);
  if (!action) return invalid('action is required', corsHeaders);

  let workflow;
  try {
    workflow = await loadWorkflow(env, ownerId, workflowId);
  } catch {
    return invalid('Workflow storage is unavailable', corsHeaders, 503, 'STORAGE_ERROR');
  }
  if (!workflow) return invalid('Workflow not found', corsHeaders, 404, 'WORKFLOW_NOT_FOUND');
  const conflict = versionConflict(workflow, body, corsHeaders);
  if (conflict) return conflict;
  if (action === 'cancel') {
    markWorkflowCancelled(workflow, body.reason || 'cancelled_by_user');
    return persistAndRespond(env, workflow, corsHeaders);
  }
  if (workflow.status !== 'awaiting_user' || !workflow.pendingInterrupt) {
    return invalid('Workflow is not waiting for a user decision', corsHeaders, 409, 'WORKFLOW_NOT_AWAITING_USER');
  }

  if (workflow.pendingInterrupt.type === 'repair_plan' && action === 'retry_plan') {
    const attempts = workflow.state.repair?.attempts || 1;
    if (attempts >= MAX_REPAIR_ATTEMPTS) {
      markWorkflowFailed(workflow, 'REPAIR_EXHAUSTED', 'The plan could not be repaired after the allowed retries.', 'validate_safety');
      return persistAndRespond(env, workflow, corsHeaders);
    }
    workflow.status = 'running';
    clearPendingInterruptForRun(workflow);
    workflow.state.node = 'draft_plan';
    appendAudit(workflow, 'plan_retried', 'draft_plan', { attempt: attempts + 1 });
    const planResult = await runPlanDraft(workflow, env, corsHeaders, 'Repair the previous plan failure while preserving every hard allergen constraint.');
    if (planResult.ok) setPlanProposal(workflow, planResult, 'plan_repaired');
    else setRepairInterrupt(workflow, planResult, attempts + 1);
    return persistAndRespond(env, workflow, corsHeaders);
  }

  if (workflow.pendingInterrupt.type === 'approve_plan' && (action === 'edit_plan' || action === 'edit')) {
    const overrides = body.overrides || body.constraints;
    if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) {
      return invalid('Edit requires a constraints or overrides object', corsHeaders);
    }
    workflow.state.constraints = mergeConstraints({}, overrides, workflow.state.constraints);
    workflow.status = 'running';
    clearPendingInterruptForRun(workflow);
    workflow.state.node = 'draft_plan';
    appendAudit(workflow, 'plan_edit_requested', 'draft_plan', { fields: Object.keys(overrides).slice(0, 20) });
    const planResult = await runPlanDraft(workflow, env, corsHeaders);
    if (planResult.ok) setPlanProposal(workflow, planResult, 'plan_redrafted');
    else setRepairInterrupt(workflow, planResult, 1);
    return persistAndRespond(env, workflow, corsHeaders);
  }

  if (workflow.pendingInterrupt.type === 'approve_plan' && ['approve_plan', 'approve', 'confirm'].includes(action)) {
    // This audit event is the explicit confirmation boundary. Nothing that
    // writes a planner or grocery account is called before this event exists.
    appendAudit(workflow, 'plan_approved', 'build_grocery', {
      interruptId: workflow.pendingInterrupt.id,
      acknowledgedBy: ownerId
    });
    workflow.status = 'running';
    clearPendingInterruptForRun(workflow);
    workflow.state.node = 'build_grocery';
    const groceryResult = await runGroceryDraft(workflow, env, corsHeaders);
    if (!groceryResult.ok) {
      markWorkflowFailed(workflow, groceryResult.code, groceryResult.message, 'build_grocery');
    } else {
      setGroceryCheckpoint(workflow, groceryResult);
    }
    return persistAndRespond(env, workflow, corsHeaders);
  }

  if (workflow.pendingInterrupt.type === 'grocery_done' && ['grocery_done', 'shopping_complete', 'shop_complete'].includes(action)) {
    appendAudit(workflow, 'shopping_completed', 'optional_prep', { acknowledgedBy: ownerId });
    workflow.state.node = 'optional_prep';
    addCheckpoint(workflow, 'optional_prep', { shoppingCompleted: true });
    setPendingInterrupt(
      workflow,
      'prep_done',
      'Shopping is marked complete. Resume after optional batch prep, or skip prep to enter cooking.',
      [
        { action: 'prep_done', label: 'Prep complete' },
        { action: 'skip_prep', label: 'Skip prep' },
        { action: 'cancel', label: 'Cancel workflow' }
      ]
    );
    appendAudit(workflow, 'awaiting_prep', 'optional_prep');
    return persistAndRespond(env, workflow, corsHeaders);
  }

  if (workflow.pendingInterrupt.type === 'prep_done' && ['prep_done', 'skip_prep'].includes(action)) {
    appendAudit(workflow, action === 'skip_prep' ? 'prep_skipped' : 'prep_completed', 'ready_to_cook', {
      acknowledgedBy: ownerId
    });
    workflow.state.node = 'ready_to_cook';
    addCheckpoint(workflow, 'ready_to_cook', { prepSkipped: action === 'skip_prep' });
    setPendingInterrupt(
      workflow,
      'ready_to_cook',
      'The workflow is ready to cook. Start the linked cook session when you are ready.',
      [
        { action: 'start_cooking', label: 'Start cooking' },
        { action: 'cancel', label: 'Cancel workflow' }
      ]
    );
    return persistAndRespond(env, workflow, corsHeaders);
  }

  if (workflow.pendingInterrupt.type === 'ready_to_cook' && ['start_cooking', 'ready_to_cook', 'complete'].includes(action)) {
    appendAudit(workflow, 'cook_session_started', 'complete', { acknowledgedBy: ownerId });
    markWorkflowCompleted(workflow, 'complete', { cookSessionReady: true });
    return persistAndRespond(env, workflow, corsHeaders);
  }

  return invalid(`Action "${action}" is not valid for the ${workflow.pendingInterrupt.type} interrupt`, corsHeaders, 409, 'INVALID_WORKFLOW_ACTION');
}

function clearPendingInterruptForRun(workflow) {
  workflow.pendingInterrupt = null;
  workflow.updatedAt = new Date().toISOString();
}

/** POST /agent/workflow/:id/cancel */
export async function handleKitchenWorkflowCancel(request, env, corsHeaders, workflowId) {
  if (!featureEnabled(env)) return featureDisabled(corsHeaders);
  if (!validWorkflowId(workflowId)) return invalid('Invalid workflowId', corsHeaders, 400, 'INVALID_WORKFLOW_ID');
  const parsed = await parseBody(request, corsHeaders);
  if (parsed.error) return parsed.error;
  const body = parsed.body || {};
  const url = new URL(request.url);
  const ownerId = readOwnerId(request, body, url);
  if (!ownerId) return invalid('userId must be a short, valid account identifier', corsHeaders);
  let workflow;
  try {
    workflow = await loadWorkflow(env, ownerId, workflowId);
  } catch {
    return invalid('Workflow storage is unavailable', corsHeaders, 503, 'STORAGE_ERROR');
  }
  if (!workflow) return invalid('Workflow not found', corsHeaders, 404, 'WORKFLOW_NOT_FOUND');
  markWorkflowCancelled(workflow, body.reason || 'cancelled_by_user');
  appendAudit(workflow, 'cancel_requested', 'complete', { acknowledgedBy: ownerId });
  return persistAndRespond(env, workflow, corsHeaders);
}

export { featureEnabled, loadWorkflow, normalizeSlots, readOwnerId, runGroceryDraft, runPlanDraft };
