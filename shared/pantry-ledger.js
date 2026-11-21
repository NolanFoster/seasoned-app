/**
 * Shared wire helpers for the consent-based pantry ledger (#585).
 *
 * The browser creates a proposal from the same conservative depletion plan used
 * by grocery grounding. The worker validates ownership, quantity conflicts, and
 * idempotency before appending the event and materializing the pantry rows.
 */

import { normalizeIngredientName, parsePantryQuantity } from './pantry-planning.js'

export const PANTRY_LEDGER_EVENT_TYPES = Object.freeze(['debit_cook', 'debit_waste', 'adjust'])
export const PANTRY_LEDGER_SOURCES = Object.freeze(['navigator', 'workflow', 'meal_log', 'pantry'])

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null
}

function boundedString(value, max = 200) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

/** Convert depletion-plan operations into auditable ledger lines. */
export function buildPantryLedgerLines(operations) {
  return (Array.isArray(operations) ? operations : [])
    .filter((operation) => asRecord(operation) && operation.action !== 'skip')
    .map((operation) => {
      const pantryItemId = Number(operation.pantryItemId ?? operation.pantry_item_id)
      const action = operation.action === 'remove' ? 'remove' : 'update'
      const amount = operation.amount === null || operation.amount === undefined || operation.amount === ''
        ? null
        : Number(operation.amount)
      const remainingQuantity = operation.remainingQuantity === null || operation.remainingQuantity === undefined || operation.remainingQuantity === ''
        ? null
        : Number(operation.remainingQuantity)
      const parsedCurrent = parsePantryQuantity(operation.expectedQuantity, operation.unit)
      return {
        pantryItemId: Number.isSafeInteger(pantryItemId) && pantryItemId > 0 ? pantryItemId : null,
        nameNorm: normalizeIngredientName(operation.nameNorm || operation.ingredient || operation.name),
        qty: Number.isFinite(amount) && amount >= 0 ? amount : null,
        unit: boundedString(operation.unit, 40) || parsedCurrent.unit || null,
        confidence: Number.isFinite(Number(operation.confidence))
          ? Math.max(0, Math.min(1, Number(operation.confidence)))
          : 1,
        action,
        remainingQuantity: Number.isFinite(remainingQuantity) && remainingQuantity >= 0 ? remainingQuantity : null,
        ...(operation.expectedQuantity === undefined ? {} : { expectedQuantity: operation.expectedQuantity }),
      }
    })
    .filter((line) => line.pantryItemId !== null && line.nameNorm)
}

/** Build the request sent to the user-management worker for a proposed cook. */
export function buildPantryDebitProposal({ recipeId, cookSessionId, operations, source = 'navigator' } = {}) {
  return {
    type: 'debit_cook',
    recipeId: boundedString(recipeId),
    cookSessionId: boundedString(cookSessionId, 120) || null,
    source: PANTRY_LEDGER_SOURCES.includes(source) ? source : 'navigator',
    lines: buildPantryLedgerLines(operations),
  }
}

/** Build the request used by the explicit waste/deletion flow. */
export function buildPantryWasteEvent({ lines, source = 'pantry', cookSessionId = null } = {}) {
  return {
    type: 'debit_waste',
    cookSessionId: boundedString(cookSessionId, 120) || null,
    source: PANTRY_LEDGER_SOURCES.includes(source) ? source : 'pantry',
    lines: buildPantryLedgerLines(lines),
  }
}
