import { describe, it, expect } from 'vitest'
import { mergeDuplicateGroceryItems } from '../pantry-planning.js'

const summary = (items) => items.map(({ name, quantity, category }) => ({ name, quantity, category }))

describe('mergeDuplicateGroceryItems', () => {
  it('collapses the repeated and mirrored lines a grocery aggregator returns', () => {
    // Shape taken from a real generated list: butter and Parmesan appeared in
    // Dairy and then again, unchanged, under Pantry Staples.
    const merged = mergeDuplicateGroceryItems([
      { name: 'lemon zest', quantity: '0.25 teaspoon', category: 'Produce' },
      { name: 'unsalted butter', quantity: '3 tablespoons', category: 'Dairy' },
      { name: 'unsalted butter', quantity: '4 tablespoons', category: 'Dairy' },
      { name: 'Parmesan cheese', quantity: '2 tablespoons', category: 'Dairy' },
      { name: 'Parmesan cheese', quantity: '2 tablespoons', category: 'Pantry Staples' },
      { name: 'unsalted butter', quantity: '3 tablespoons', category: 'Pantry Staples' },
      { name: 'unsalted butter', quantity: '4 tbsp', category: 'Pantry Staples' },
    ])

    expect(summary(merged)).toEqual([
      { name: 'lemon zest', quantity: '0.25 teaspoon', category: 'Produce' },
      // Two different amounts in one aisle are separate recipe lines: summed.
      { name: 'unsalted butter', quantity: '7 tbsp', category: 'Dairy' },
      // The mirrored Pantry Staples copies are dropped, not added on top.
      { name: 'Parmesan cheese', quantity: '2 tablespoons', category: 'Dairy' },
    ])
  })

  it('keeps the first occurrence name, category and staple flag', () => {
    const [item] = mergeDuplicateGroceryItems([
      { name: 'unsalted butter', quantity: '1 tbsp', category: 'Dairy', isStaple: false },
      { name: 'Unsalted Butter', quantity: '2 tbsp', category: 'Pantry Staples', isStaple: true },
    ])

    expect(item).toMatchObject({
      name: 'unsalted butter',
      category: 'Dairy',
      isStaple: false,
      quantity: '3 tbsp',
    })
  })

  it('sums across compatible units and keeps unsummable amounts side by side', () => {
    expect(
      summary(mergeDuplicateGroceryItems([
        { name: 'milk', quantity: '1 cup', category: 'Dairy' },
        { name: 'milk', quantity: '8 tbsp', category: 'Dairy' },
        { name: 'black beans', quantity: '1 can', category: 'Pantry Staples' },
        { name: 'black beans', quantity: '2 cups', category: 'Pantry Staples' },
      ])),
    ).toEqual([
      { name: 'milk', quantity: '1.5 cup', category: 'Dairy' },
      { name: 'black beans', quantity: '1 can + 2 cups', category: 'Pantry Staples' },
    ])
  })

  it('merges plural forms and a unit carried in its own field', () => {
    expect(
      mergeDuplicateGroceryItems([
        { name: 'lemons', quantity: '2', unit: 'piece', category: 'Produce' },
        { name: 'lemon', quantity: '1', unit: 'piece', category: 'Produce' },
      ]),
    ).toEqual([{ name: 'lemons', quantity: '3 piece', unit: '', category: 'Produce' }])
  })

  it('does not fold a different ingredient that merely shares a word', () => {
    const merged = mergeDuplicateGroceryItems([
      { name: 'butter', quantity: '1 cup', category: 'Dairy' },
      { name: 'peanut butter', quantity: '2 tbsp', category: 'Pantry Staples' },
    ])

    expect(merged.map((item) => item.name)).toEqual(['butter', 'peanut butter'])
  })

  it('takes an amount from a later line when the first has none', () => {
    const [item] = mergeDuplicateGroceryItems([
      { name: 'garlic', quantity: '', category: 'Produce' },
      { name: 'garlic', quantity: '3 cloves', category: 'Produce' },
    ])

    expect(item.quantity).toBe('3 cloves')
  })

  it('leaves the amount alone when a duplicate adds nothing new', () => {
    const merged = mergeDuplicateGroceryItems([
      { name: 'garlic', quantity: '3 cloves', category: 'Produce' },
      { name: 'garlic', quantity: '', category: 'Produce' },
      { name: 'salt', quantity: 'to taste', category: 'Pantry Staples' },
      { name: 'salt', quantity: 'to taste', category: 'Pantry Staples' },
    ])

    expect(summary(merged)).toEqual([
      { name: 'garlic', quantity: '3 cloves', category: 'Produce' },
      { name: 'salt', quantity: 'to taste', category: 'Pantry Staples' },
    ])
  })

  it('passes through malformed entries and a non-array input', () => {
    expect(mergeDuplicateGroceryItems(null)).toEqual([])
    expect(mergeDuplicateGroceryItems([null, { quantity: '1 cup' }, 'lemon'])).toEqual([
      null,
      { quantity: '1 cup' },
      'lemon',
    ])
  })
})
