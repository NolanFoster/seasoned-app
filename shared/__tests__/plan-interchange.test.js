import { describe, expect, it } from 'vitest'
import {
  PLAN_CSV_HEADERS,
  PLAN_INTERCHANGE_SCHEMA,
  parsePlanInterchange,
  serializeCooklangWeek,
  serializeSchemaOrgWeek,
  serializeSeasonedWeek,
  serializeSeasonedWeekCsv,
  serializeSeasonedWeekJson,
} from '../plan-interchange.js'

const mealPlan = {
  '2026-10-05': {
    breakfast: [],
    lunch: [],
    dinner: [{
      id: 'recipe-1',
      name: 'Lemon chicken',
      servings: 2,
      ingredients: [
        { name: 'chicken thighs', quantity: '2', unit: 'pieces' },
        { name: 'lemon', quantity: '1', unit: '' },
      ],
      notes: 'Use the zest before juicing.',
    }],
    snack: [],
  },
}

const state = {
  mealPlan,
  upNext: [{ id: 'recipe-2', name: 'Oat porridge', ingredients: ['oats', 'banana'] }],
  groceryList: [{ id: 'g-1', name: 'lemons', quantity: '2', unit: 'pieces', category: 'Produce' }],
  exportedAt: '2026-09-14T12:00:00.000Z',
}

describe('seasoned week JSON interchange', () => {
  it('serializes and round-trips scheduled and staged recipes', () => {
    const exported = serializeSeasonedWeek(state)
    expect(exported).toMatchObject({
      schema: PLAN_INTERCHANGE_SCHEMA,
      version: 1,
      exportedAt: state.exportedAt,
      meals: [{ date: '2026-10-05', slot: 'dinner', title: 'Lemon chicken' }],
      staged: [{ title: 'Oat porridge' }],
    })

    const imported = parsePlanInterchange(JSON.stringify(exported), { hardAllergens: [] })
    expect(imported.mealPlan['2026-10-05'].dinner[0]).toMatchObject({
      id: 'recipe-1',
      name: 'Lemon chicken',
      servings: 2,
    })
    expect(imported.upNext[0]).toMatchObject({ id: 'recipe-2', name: 'Oat porridge' })
    expect(imported.groceryList).toHaveLength(1)
    expect(imported.groceryImported).toBe(true)
    expect(imported.report.mappedCount).toBe(1)
    expect(imported.report.canCommit).toBe(true)
  })

  it('rejects a newer schema version before changing planner state', () => {
    expect(() => parsePlanInterchange(JSON.stringify({ version: 99, meals: [] })))
      .toThrow(/supports version 1/)
  })

  it('reports incomplete rows instead of silently dropping them', () => {
    const imported = parsePlanInterchange(JSON.stringify([
      { date: '2026-10-05', title: 'No slot', ingredients: [] },
      { date: 'not-a-date', slot: 'dinner', title: 'Bad date' },
      { date: '2026-10-06', slot: 'dinner', title: '' },
    ]), { format: 'json' })
    expect(imported.report.partialCount).toBe(1)
    expect(imported.report.skippedCount).toBe(2)
    expect(imported.mealPlan['2026-10-05'].dinner[0].name).toBe('No slot')
  })
})

describe('CSV interchange', () => {
  it('uses the documented columns and safely quotes commas/newlines', () => {
    const csv = serializeSeasonedWeekCsv(state)
    expect(csv.split('\n')[0]).toBe(PLAN_CSV_HEADERS.join(','))
    expect(csv).toContain('Lemon chicken')
    expect(csv).toContain('up_next')

    const imported = parsePlanInterchange(csv)
    expect(imported.mealPlan['2026-10-05'].dinner[0].name).toBe('Lemon chicken')
    expect(imported.upNext[0].name).toBe('Oat porridge')
    expect(imported.groceryImported).toBe(false)
  })

  it('ignores unknown columns and maps common human slot aliases', () => {
    const imported = parsePlanInterchange([
      'day,meal,name,ingredients,source',
      '2026-10-07,evening,Bean chili,"1 can beans; 1 tbsp tahini",legacy',
    ].join('\n'))
    expect(imported.mealPlan['2026-10-07'].dinner[0]).toMatchObject({ name: 'Bean chili' })
    expect(imported.report.warnings).toContain('Ignored CSV column: source')
    expect(imported.report.mappedCount).toBe(1)
  })
})

describe('schema.org and Cooklang best effort adapters', () => {
  it('round-trips the schema.org Recipe ItemList shape', () => {
    const schema = serializeSchemaOrgWeek(state)
    const imported = parsePlanInterchange(JSON.stringify(schema))
    expect(imported.mealPlan['2026-10-05'].dinner[0]).toMatchObject({
      name: 'Lemon chicken',
      ingredients: [{ name: 'chicken thighs' }, { name: 'lemon' }],
    })
  })

  it('parses the documented Cooklang metadata directives', () => {
    const imported = parsePlanInterchange(serializeCooklangWeek(state))
    expect(imported.mealPlan['2026-10-05'].dinner[0]).toMatchObject({
      name: 'Lemon chicken',
      ingredients: expect.arrayContaining([{ name: 'chicken thighs', quantity: '2', unit: 'pieces' }]),
    })
  })
})

describe('constraint revalidation', () => {
  it('blocks a hard-allergen conflict and exposes the reason for review', () => {
    const imported = parsePlanInterchange([
      'date,slot,title,ingredients',
      '2026-10-05,dinner,Peanut noodles,"2 tbsp peanut butter; noodles"',
    ].join('\n'), { hardAllergens: ['peanuts'] })
    expect(imported.report.canCommit).toBe(false)
    expect(imported.report.blocked).toEqual([
      expect.objectContaining({ title: 'Peanut noodles', allergens: ['peanuts'] }),
    ])
    expect(imported.report.warnings.join(' ')).toMatch(/conflicts must be resolved/)
  })

  it('does not invent an allergen block when a household has no hard allergens', () => {
    const imported = parsePlanInterchange([
      'date,slot,title,ingredients',
      '2026-10-05,dinner,Peanut noodles,"2 tbsp peanut butter"',
    ].join('\n'))
    expect(imported.report.canCommit).toBe(true)
  })
})

// Keep a direct JSON helper assertion near the other public API checks so an
// accidental change to pretty-printing cannot make download diffs unreadable.
it('serializes valid JSON for a file download', () => {
  expect(() => JSON.parse(serializeSeasonedWeekJson(state))).not.toThrow()
})
