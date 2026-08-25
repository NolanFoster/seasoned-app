import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import {
  buildWeekDays,
  getEmptySlots,
  useFillMealPlan,
} from '../useFillMealPlan.js'

function FillHarness({ onFill }) {
  const { fillMealPlan, status, error } = useFillMealPlan()
  return (
    <div>
      <output data-testid="status">{status}</output>
      <output data-testid="error">{error || ''}</output>
      <button
        type="button"
        onClick={() => void fillMealPlan({ slots: ['2026-08-17::dinner'] }).then(onFill).catch(() => {})}
      >
        Fill
      </button>
    </div>
  )
}

describe('useFillMealPlan — pure helpers', () => {
  test('buildWeekDays returns 7 ISO dates starting from now', () => {
    const days = buildWeekDays(new Date('2026-08-17T12:00:00Z'))
    expect(days).toHaveLength(7)
    expect(days[0].dateString).toBe('2026-08-17')
    expect(days[6].dateString).toBe('2026-08-23')
  })

  test('getEmptySlots returns all 28 slots for an empty plan', () => {
    const slots = getEmptySlots({}, ['2026-08-17'])
    expect(slots).toHaveLength(4)
    expect(slots).toContain('2026-08-17::breakfast')
    expect(slots).toContain('2026-08-17::dinner')
  })

  test('getEmptySlots skips filled slots', () => {
    const plan = {
      '2026-08-17': { breakfast: [{ id: 'a', name: 'Oats' }], lunch: [], dinner: [], snack: [] },
    }
    const slots = getEmptySlots(plan, ['2026-08-17'])
    expect(slots).toHaveLength(3)
    expect(slots).not.toContain('2026-08-17::breakfast')
  })

  test('getEmptySlots defaults to the upcoming week when dates omitted', () => {
    const slots = getEmptySlots({})
    expect(slots).toHaveLength(28)
  })
})

describe('useFillMealPlan — hook behavior', () => {
  beforeEach(() => {
    localStorage.clear()
    global.fetch.mockClear()
  })

  test('fills slots and normalizes recipes', async () => {
    let captured
    global.fetch.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            success: true,
            meals: [
              {
                slot: '2026-08-17::dinner',
                date: '2026-08-17',
                mealType: 'dinner',
                recipe: {
                  name: 'Test Dinner',
                  description: 'desc',
                  image_url: 'https://example.com/img.png',
                  prepTime: '10 minutes',
                  cookTime: '20 minutes',
                  servings: '4 servings',
                  ingredients: ['x'],
                  instructions: ['y'],
                },
              },
            ],
            warnings: [],
          }),
      })
    )

    render(<FillHarness onFill={(r) => { captured = r }} />)
    fireEvent.click(screen.getByText('Fill'))

    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('success'))
    expect(captured.meals).toHaveLength(1)
    expect(captured.meals[0].recipe.name).toBe('Test Dinner')
    expect(captured.meals[0].recipe.image).toBe('https://example.com/img.png')
    expect(captured.meals[0].recipe.prep_time).toBe('10 minutes')
    expect(captured.meals[0].recipe.id).toMatch(/^ai-/)
  })

  test('surfaces error on failed response', async () => {
    global.fetch.mockImplementation(() =>
      Promise.resolve({
        ok: false,
        status: 502,
        json: () => Promise.resolve({ success: false, error: 'Could not fill any requested slots' }),
      })
    )

    render(<FillHarness onFill={() => {}} />)
    fireEvent.click(screen.getByText('Fill'))

    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('error'))
    expect(screen.getByTestId('error').textContent).toContain('Could not fill')
  })
})
