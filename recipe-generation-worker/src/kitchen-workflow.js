/**
 * Pure state model for the Kitchen Workflow V1 agent.
 *
 * The worker handler owns persistence and tool execution; this module keeps the
 * workflow contract and transitions deterministic so they can be tested without
 * Cloudflare bindings or an AI model.
 */

export const KITCHEN_WORKFLOW_SCHEMA_VERSION = 1;
export const KITCHEN_WORKFLOW_TTL_SECONDS = 30 * 24 * 60 * 60;

export const WORKFLOW_TYPES = Object.freeze([
  'week_plan',
  'dinner_tonight',
  'prep_batch',
  'inspire_to_table'
]);

export const WORKFLOW_STATUSES = Object.freeze([
  'running',
  'awaiting_user',
  'failed',
  'completed',
  'cancelled'
]);

export const WORKFLOW_NODES = Object.freeze([
  'clarify_goal',
  'retrieve_pantry',
  'draft_plan',
  'validate_safety',
  'propose_plan',
  'build_grocery',
  'await_shop',
  'optional_prep',
  'ready_to_cook',
  'complete'
]);

const MAX_AUDIT_EVENTS = 100;
const MAX_CHECKPOINTS = 30;

function nowIso() {
  return new Date().toISOString();
}

function copyJson(value, fallback) {
  if (value === undefined) return fallback;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return fallback;
  }
}

function makeId(prefix) {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `${prefix}_${uuid}`;
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * @param {object} input
 * @returns {object}
 */
export function createKitchenWorkflow(input) {
  const createdAt = nowIso();
  const workflowId = input.workflowId || makeId('kwf');
  const traceId = input.traceId || makeId('trace');
  const userId = typeof input.userId === 'string' && input.userId.trim()
    ? input.userId.trim()
    : 'anonymous';

  const workflow = {
    schemaVersion: KITCHEN_WORKFLOW_SCHEMA_VERSION,
    workflowId,
    type: WORKFLOW_TYPES.includes(input.type) ? input.type : 'week_plan',
    userId,
    status: 'running',
    createdAt,
    updatedAt: createdAt,
    expiresAt: new Date(Date.parse(createdAt) + KITCHEN_WORKFLOW_TTL_SECONDS * 1000).toISOString(),
    version: 1,
    traceId,
    state: {
      node: 'clarify_goal',
      goal: copyJson(input.goal, {}),
      constraints: copyJson(input.constraints, {}),
      usePantry: input.usePantry === true,
      pantryIngredients: copyJson(input.pantryIngredients, []),
      slots: copyJson(input.slots, []),
      planDraft: null,
      groceryDraft: null,
      repair: null,
      checkpoints: []
    },
    pendingInterrupt: null,
    audit: []
  };

  appendAudit(workflow, 'workflow_started', 'clarify_goal', {
    type: workflow.type,
    hasPantry: workflow.state.usePantry,
    slotCount: workflow.state.slots.length
  });
  return workflow;
}

/**
 * Append a bounded, user-visible audit event. Audit records deliberately store
 * summaries rather than raw prompts or recipe text so a workflow can be
 * inspected without turning the log into an unbounded data sink.
 */
export function appendAudit(workflow, event, node, details = {}) {
  const entry = {
    id: makeId('audit'),
    event,
    node,
    at: nowIso(),
    details: copyJson(details, {})
  };
  workflow.audit = [...(Array.isArray(workflow.audit) ? workflow.audit : []), entry].slice(-MAX_AUDIT_EVENTS);
  workflow.updatedAt = entry.at;
  return entry;
}

export function addCheckpoint(workflow, node, summary = {}) {
  const checkpoint = {
    id: makeId('checkpoint'),
    node,
    at: nowIso(),
    summary: copyJson(summary, {})
  };
  workflow.state.checkpoints = [
    ...(Array.isArray(workflow.state.checkpoints) ? workflow.state.checkpoints : []),
    checkpoint
  ].slice(-MAX_CHECKPOINTS);
  workflow.updatedAt = checkpoint.at;
  return checkpoint;
}

export function setPendingInterrupt(workflow, type, message, options = []) {
  const createdAt = nowIso();
  workflow.status = 'awaiting_user';
  workflow.pendingInterrupt = {
    id: makeId('interrupt'),
    type,
    message,
    options: copyJson(options, []),
    createdAt
  };
  workflow.updatedAt = createdAt;
}

export function clearPendingInterrupt(workflow) {
  workflow.pendingInterrupt = null;
}

export function markWorkflowFailed(workflow, code, message, node) {
  workflow.status = 'failed';
  workflow.state.node = node;
  workflow.state.repair = { code, message, at: nowIso() };
  clearPendingInterrupt(workflow);
  appendAudit(workflow, 'workflow_failed', node, { code, message });
}

export function markWorkflowCompleted(workflow, node = 'complete', details = {}) {
  workflow.status = 'completed';
  workflow.state.node = node;
  workflow.state.repair = null;
  clearPendingInterrupt(workflow);
  addCheckpoint(workflow, node, details);
  appendAudit(workflow, 'workflow_completed', node, details);
}

export function markWorkflowCancelled(workflow, reason = 'cancelled_by_user') {
  if (workflowIsTerminal(workflow)) return workflow;
  workflow.status = 'cancelled';
  workflow.state.node = 'complete';
  clearPendingInterrupt(workflow);
  appendAudit(workflow, 'workflow_cancelled', 'complete', { reason });
  return workflow;
}

/**
 * Validates the persisted shape at the trust boundary. Unknown fields are
 * tolerated for forwards compatibility, but required state is reconstructed.
 */
export function normalizeKitchenWorkflow(value) {
  if (!value || typeof value !== 'object') return null;
  if (typeof value.workflowId !== 'string' || !value.workflowId) return null;
  if (!WORKFLOW_STATUSES.includes(value.status)) return null;

  const state = value.state && typeof value.state === 'object' ? value.state : {};
  return {
    ...value,
    expiresAt: typeof value.expiresAt === 'string' ? value.expiresAt : new Date(Date.now() + KITCHEN_WORKFLOW_TTL_SECONDS * 1000).toISOString(),
    schemaVersion: Number(value.schemaVersion) || KITCHEN_WORKFLOW_SCHEMA_VERSION,
    type: WORKFLOW_TYPES.includes(value.type) ? value.type : 'week_plan',
    userId: typeof value.userId === 'string' && value.userId ? value.userId : 'anonymous',
    version: Number.isInteger(value.version) && value.version > 0 ? value.version : 1,
    state: {
      node: WORKFLOW_NODES.includes(state.node) ? state.node : 'clarify_goal',
      goal: copyJson(state.goal, {}),
      constraints: copyJson(state.constraints, {}),
      usePantry: state.usePantry === true,
      pantryIngredients: copyJson(state.pantryIngredients, []),
      slots: copyJson(state.slots, []),
      planDraft: copyJson(state.planDraft, null),
      groceryDraft: copyJson(state.groceryDraft, null),
      repair: copyJson(state.repair, null),
      checkpoints: Array.isArray(state.checkpoints) ? state.checkpoints.slice(-MAX_CHECKPOINTS) : []
    },
    pendingInterrupt: value.pendingInterrupt && typeof value.pendingInterrupt === 'object'
      ? copyJson(value.pendingInterrupt, null)
      : null,
    audit: Array.isArray(value.audit) ? value.audit.slice(-MAX_AUDIT_EVENTS) : []
  };
}

export function workflowIsTerminal(workflow) {
  return workflow.status === 'completed'
    || workflow.status === 'cancelled'
    || workflow.status === 'failed';
}
