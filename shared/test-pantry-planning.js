import assert from 'node:assert/strict'
import {
  buildPantryDepletionPlan,
  classifyGroceryItems,
  getExpiringPantryItems,
  isPantryItemExpired,
  normalizeIngredientName,
  pantryNamesMatch,
  parsePantryIngredient,
} from './pantry-planning.js'

assert.equal(normalizeIngredientName('1 1/2 cups green onions'), 'green onion')
assert.equal(parsePantryIngredient('1 1/2 cups chickpeas').amount, 1.5)
assert.deepEqual(parsePantryIngredient({ name: '2 eggs' }), { raw: '2 eggs', name: 'egg', amount: 2, unit: null })
assert.equal(pantryNamesMatch('scallions', 'green onion'), true)
assert.equal(pantryNamesMatch('coconut milk', 'milk'), true)
assert.equal(pantryNamesMatch('coconut milk', 'coconut oil'), false)

const now = new Date('2026-01-10T12:00:00Z')
const classified = classifyGroceryItems([
  { id: 'milk-line', name: 'whole milk', quantity: '2 cups', category: 'Dairy' },
  { id: 'onion-line', name: 'scallions', quantity: '2', category: 'Produce' },
  { id: 'flour-line', name: 'flour', quantity: '1 cup', category: 'Pantry Staples', isStaple: true },
], [
  { id: 1, name: 'milk', quantity: 1, unit: 'cup' },
  { id: 2, name: 'green onions', quantity: null, unit: null },
  { id: 3, name: 'milk', quantity: 5, unit: 'cup', expiresOn: '2026-01-01' },
], { now })
assert.equal(classified[0].inventoryStatus, 'buy')
assert.equal(classified[0].missingQuantity, '1 cup')
assert.equal(classified[0].pantryQuantity, '1 cup')
assert.equal(classified[1].inventoryStatus, 'owned')
assert.equal(classified[2].inventoryStatus, 'optional_staple')
assert.equal(classifyGroceryItems([{ name: 'milk', quantity: '1 cup' }], [{ name: 'milk', quantity: 1, unit: 'l' }])[0].inventoryStatus, 'owned')
assert.equal(classifyGroceryItems([{ name: 'milk', quantity: '1 cup' }], [{ name: 'milk', quantity: 1 }])[0].inventoryStatus, 'buy')

const expiring = getExpiringPantryItems([
  { id: 1, name: 'tomato', expiresOn: '2026-01-10' },
  { id: 2, name: 'rice', expiresOn: '2026-01-17' },
  { id: 3, name: 'beans', expiresOn: '2026-01-19' },
], 7, { now })
assert.deepEqual(expiring.map((item) => item.id), [1, 2])
assert.equal(isPantryItemExpired({ expiresOn: '2026-01-01' }, { now }), true)
assert.equal(isPantryItemExpired({ expiresOn: '2026-01-11' }, { now }), false)
const expiryDay = new Date(2026, 0, 10, 23, 59, 59, 998)
assert.equal(isPantryItemExpired({ expiresOn: '2026-01-10' }, { now: expiryDay }), false)
assert.equal(isPantryItemExpired({ expiresOn: '2026-01-10' }, { now: new Date(2026, 0, 11, 0, 0, 0) }), true)

const depletion = buildPantryDepletionPlan(
  { ingredients: ['1 cup milk', '2 green onions'] },
  [{ id: 1, name: 'milk', quantity: 2, unit: 'cup' }, { id: 2, name: 'scallion', quantity: null }],
  { now },
)
assert.deepEqual(depletion, [
  { pantryItemId: 1, ingredient: 'milk', action: 'update', amount: 1, unit: 'cup', remainingQuantity: 1 },
  { pantryItemId: 2, ingredient: 'green onion', action: 'remove', amount: null, unit: null },
])

const repeated = buildPantryDepletionPlan(
  { ingredients: ['1 cup milk', '1 cup milk'] },
  [{ id: 4, name: 'milk', quantity: 1, unit: 'cup' }, { id: 5, name: 'milk', quantity: 1, unit: 'cup' }],
  { now },
)
assert.deepEqual(repeated.map(({ pantryItemId, action }) => ({ pantryItemId, action })), [
  { pantryItemId: 4, action: 'remove' },
  { pantryItemId: 5, action: 'remove' },
])

const coalesced = buildPantryDepletionPlan(
  { ingredients: ['1 cup milk', '1 cup coconut milk'] },
  [{ id: 9, name: 'coconut milk', quantity: 3, unit: 'cup' }],
  { now },
)
assert.deepEqual(coalesced, [
  {
    pantryItemId: 9,
    ingredient: 'milk / coconut milk',
    action: 'update',
    amount: 2,
    unit: 'cup',
    remainingQuantity: 1,
  },
])

console.log('pantry-planning tests passed')
