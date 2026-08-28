import { normalizeApiResponse } from '../MealPlannerDrawer.jsx'

describe('normalizeApiResponse pantry gap filling', () => {
  it('keeps legacy responses unchanged when pantry matching is disabled', () => {
    const [item] = normalizeApiResponse(
      [{ category: 'Pantry Staples', items: [{ name: 'lemons', quantity: '1' }] }],
      [{ id: 'pantry-1', name: 'lemon', quantity: 1, unit: 'piece' }],
      false,
    )

    expect(item.inventoryStatus).toBeUndefined()
    expect(item.quantity).toBe('1')
  })

  it('reclassifies a server-returned partial gap from the original quantity', () => {
    const [item] = normalizeApiResponse(
      [{
        category: 'Produce',
        items: [{
          name: 'lemons',
          quantity: '1',
          unit: 'piece',
          inventoryStatus: 'buy',
          pantryItemIds: ['pantry-1'],
          pantryQuantity: '1 piece',
          missingQuantity: '1 piece',
          requestedQuantity: '2',
        }],
      }],
      [{ id: 'pantry-1', name: 'lemon', quantity: 1, unit: 'piece' }],
      true,
    )

    expect(item.inventoryStatus).toBe('buy')
    expect(item.quantity).toBe('1 piece')
    expect(item.missingQuantity).toBe('1 piece')
    expect(item.requestedQuantity).toBe('2')
  })

  it('uses the current pantry snapshot when it changes after the server response', () => {
    const [item] = normalizeApiResponse(
      [{
        category: 'Produce',
        items: [{
          name: 'lemons',
          quantity: '1',
          unit: 'piece',
          inventoryStatus: 'buy',
          requestedQuantity: '2',
        }],
      }],
      [{ id: 'pantry-1', name: 'lemon', quantity: 2, unit: 'piece' }],
      true,
    )

    expect(item.inventoryStatus).toBe('owned')
    expect(item.quantity).toBe('2')
    expect(item.missingQuantity).toBeUndefined()
  })
})
