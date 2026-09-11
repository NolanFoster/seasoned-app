import { describe, expect, it } from 'vitest'
import {
  buildPantryDebitProposal,
  buildPantryLedgerLines,
  buildPantryWasteEvent,
} from '../pantry-ledger.js'
import { buildPantryDepletionPlan, isPantryLedgerStaple } from '../pantry-planning.js'

describe('pantry ledger wire helpers', () => {
  it('normalizes confirmed cook operations into auditable lines', () => {
    expect(buildPantryLedgerLines([
      {
        pantryItemId: 4,
        ingredient: '  Chickpeas  ',
        action: 'update',
        amount: 1,
        unit: 'can',
        expectedQuantity: 3,
        remainingQuantity: 2,
      },
      { pantryItemId: 5, ingredient: 'salt', action: 'skip' },
    ])).toEqual([{
      pantryItemId: 4,
      nameNorm: 'chickpea',
      qty: 1,
      unit: 'can',
      confidence: 1,
      action: 'update',
      remainingQuantity: 2,
      expectedQuantity: 3,
    }])
  })

  it('keeps the cook session and source in the proposal envelope', () => {
    expect(buildPantryDebitProposal({
      recipeId: 'recipe-1',
      cookSessionId: 'cook-1',
      source: 'navigator',
      operations: [{ pantryItemId: 9, ingredient: 'rice', action: 'remove', amount: null }],
    })).toMatchObject({
      type: 'debit_cook',
      recipeId: 'recipe-1',
      cookSessionId: 'cook-1',
      source: 'navigator',
      lines: [{ pantryItemId: 9, nameNorm: 'rice', qty: null, action: 'remove' }],
    })
  })

  it('filters malformed operation references and applies safe defaults', () => {
    expect(buildPantryLedgerLines([
      null,
      { pantryItemId: 'not-an-id', ingredient: 'rice', action: 'remove' },
      {
        pantryItemId: 8,
        ingredient: 'rice',
        action: 'unexpected',
        amount: 'not-a-number',
        unit: 4,
        confidence: 'unknown',
        remainingQuantity: 'unknown',
        expectedQuantity: 'unknown',
      },
    ])).toEqual([expect.objectContaining({
      pantryItemId: 8,
      nameNorm: 'rice',
      qty: null,
      confidence: 1,
      action: 'update',
      remainingQuantity: null,
      expectedQuantity: 'unknown',
    })])
    expect(buildPantryDebitProposal({ source: 'unsupported', operations: [] }).source).toBe('navigator')
    expect(buildPantryWasteEvent({ source: 'unsupported', lines: [] }).source).toBe('pantry')
  })

  it('builds an explicit waste event without changing the event type client-side', () => {
    expect(buildPantryWasteEvent({
      cookSessionId: 'waste-1',
      lines: [{ pantryItemId: 2, ingredient: 'spinach', action: 'remove' }],
    })).toMatchObject({ type: 'debit_waste', source: 'pantry', cookSessionId: 'waste-1' })
  })
})

describe('pantry ledger staple policy', () => {
  it('skips unmeasured kitchen staples unless explicitly tracked', () => {
    expect(isPantryLedgerStaple('salt')).toBe(true)
    expect(isPantryLedgerStaple('salt', { trackedStaples: ['salt'] })).toBe(false)

    const plan = buildPantryDepletionPlan(
      { ingredients: ['1 tsp salt', '2 cups rice'] },
      [{ id: 1, name: 'salt', quantity: 100, unit: 'g' }, { id: 2, name: 'rice', quantity: 4, unit: 'cup' }],
    )
    expect(plan.map((operation) => operation.pantryItemId)).toEqual([2])
  })

  it('scales measured requirements when the cook makes fewer servings', () => {
    const plan = buildPantryDepletionPlan(
      { servings: 4, ingredients: ['4 cups rice'] },
      [{ id: 2, name: 'rice', quantity: 4, unit: 'cup' }],
      { servingsCooked: 2 },
    )
    expect(plan[0]).toMatchObject({ amount: 2, remainingQuantity: 2, expectedQuantity: 4 })
  })
})
