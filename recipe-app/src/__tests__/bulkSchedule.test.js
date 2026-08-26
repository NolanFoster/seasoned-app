import {
  buildScheduleAssignments,
  countOpenSlots,
  isSlotEmpty,
} from '../utils/bulkSchedule.js'

const DATES = ['2026-08-27', '2026-08-28', '2026-08-29']

function recipe(id, name = `Recipe ${id}`) {
  return { id, name }
}

describe('isSlotEmpty', () => {
  test('treats missing days and empty arrays as empty', () => {
    expect(isSlotEmpty({}, '2026-08-27', 'dinner')).toBe(true)
    expect(isSlotEmpty({ '2026-08-27': { dinner: [] } }, '2026-08-27', 'dinner')).toBe(true)
  })

  test('treats a populated slot as occupied', () => {
    const plan = { '2026-08-27': { dinner: [recipe('a')] } }
    expect(isSlotEmpty(plan, '2026-08-27', 'dinner')).toBe(false)
  })
})

describe('buildScheduleAssignments', () => {
  test('places every recipe when there is room', () => {
    const { assignments, unassigned } = buildScheduleAssignments({
      recipes: [recipe('1'), recipe('2')],
      mealPlan: {},
      dates: DATES,
      mealTypes: ['dinner'],
    })

    expect(assignments).toEqual([
      { date: '2026-08-27', mealType: 'dinner', recipe: recipe('1') },
      { date: '2026-08-28', mealType: 'dinner', recipe: recipe('2') },
    ])
    expect(unassigned).toEqual([])
  })

  test('skips occupied slots instead of overwriting them', () => {
    const plan = { '2026-08-27': { dinner: [recipe('taken')] } }
    const { assignments } = buildScheduleAssignments({
      recipes: [recipe('1')],
      mealPlan: plan,
      dates: DATES,
      mealTypes: ['dinner'],
    })

    expect(assignments).toEqual([
      { date: '2026-08-28', mealType: 'dinner', recipe: recipe('1') },
    ])
  })

  test('reports recipes that do not fit as unassigned', () => {
    const { assignments, unassigned } = buildScheduleAssignments({
      recipes: [recipe('1'), recipe('2'), recipe('3'), recipe('4')],
      mealPlan: {},
      dates: DATES,
      mealTypes: ['dinner'],
    })

    expect(assignments).toHaveLength(3)
    expect(unassigned).toEqual([recipe('4')])
  })

  test('fills multiple meal types in canonical order regardless of selection order', () => {
    const { assignments } = buildScheduleAssignments({
      recipes: [recipe('1'), recipe('2'), recipe('3')],
      mealPlan: {},
      dates: DATES,
      mealTypes: ['dinner', 'breakfast'],
    })

    expect(assignments.map((a) => `${a.date}::${a.mealType}`)).toEqual([
      '2026-08-27::breakfast',
      '2026-08-27::dinner',
      '2026-08-28::breakfast',
    ])
  })

  test('ignores recipes missing an id or name', () => {
    const { assignments, unassigned } = buildScheduleAssignments({
      recipes: [{ name: 'no id' }, { id: 'no-name' }, recipe('1')],
      mealPlan: {},
      dates: DATES,
      mealTypes: ['dinner'],
    })

    expect(assignments).toEqual([
      { date: '2026-08-27', mealType: 'dinner', recipe: recipe('1') },
    ])
    expect(unassigned).toEqual([])
  })

  test('returns nothing when no meal type is selected', () => {
    const { assignments, unassigned } = buildScheduleAssignments({
      recipes: [recipe('1')],
      mealPlan: {},
      dates: DATES,
      mealTypes: [],
    })

    expect(assignments).toEqual([])
    expect(unassigned).toEqual([recipe('1')])
  })

  test('tolerates missing arguments', () => {
    expect(buildScheduleAssignments({})).toEqual({ assignments: [], unassigned: [] })
  })
})

describe('countOpenSlots', () => {
  test('counts only the selected meal types and skips occupied slots', () => {
    const plan = { '2026-08-27': { dinner: [recipe('taken')], breakfast: [] } }
    expect(countOpenSlots(plan, DATES, ['dinner'])).toBe(2)
    expect(countOpenSlots(plan, DATES, ['dinner', 'breakfast'])).toBe(5)
    expect(countOpenSlots(plan, [], ['dinner'])).toBe(0)
  })
})
