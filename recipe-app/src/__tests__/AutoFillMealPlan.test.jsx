import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import AutoFillMealPlan from '../AutoFillMealPlan.jsx'

const mockAddMeal = jest.fn()
let mockMealPlan = {}

jest.mock('../MealPlanContext.jsx', () => ({
  useMealPlan: () => ({
    mealPlan: mockMealPlan,
    addMeal: mockAddMeal,
  }),
}))

function renderModal(props = {}) {
  return render(
    <AutoFillMealPlan
      open={true}
      onClose={() => {}}
      profile={null}
      usePantry={false}
      {...props}
    />
  )
}

describe('AutoFillMealPlan', () => {
  beforeEach(() => {
    mockAddMeal.mockClear()
    mockMealPlan = {}
    global.fetch.mockClear()
  })

  test('shows the number of empty slots for the week', () => {
    renderModal()
    expect(screen.getByText(/28 empty slots selected/i)).toBeInTheDocument()
  })

  test('preview fetches and shows proposed meals', async () => {
    global.fetch.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            success: true,
            meals: [
              {
                date: '2026-08-17',
                mealType: 'dinner',
                recipe: { name: 'Auto Dinner', ingredients: ['x'], instructions: ['y'] },
              },
            ],
            warnings: [],
          }),
      })
    )

    renderModal()
    fireEvent.click(screen.getByText('Preview my week'))

    await waitFor(() => expect(screen.getByText('Auto Dinner')).toBeInTheDocument())
    expect(screen.getByText(/Fill 1 slot/i)).toBeInTheDocument()
  })

  test('confirm writes meals via addMeal', async () => {
    global.fetch.mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            success: true,
            meals: [
              {
                date: '2026-08-17',
                mealType: 'dinner',
                recipe: { name: 'Auto Dinner', ingredients: ['x'], instructions: ['y'] },
              },
            ],
            warnings: [],
          }),
      })
    )

    const onClose = jest.fn()
    renderModal({ onClose })
    fireEvent.click(screen.getByText('Preview my week'))
    await waitFor(() => expect(screen.getByText('Auto Dinner')).toBeInTheDocument())
    fireEvent.click(screen.getByText(/Fill 1 slot/i))

    expect(mockAddMeal).toHaveBeenCalledTimes(1)
    expect(mockAddMeal).toHaveBeenCalledWith(
      '2026-08-17',
      'dinner',
      expect.objectContaining({ name: 'Auto Dinner' })
    )
    expect(onClose).toHaveBeenCalled()
  })

  test('deselecting a day reduces the empty slot count', () => {
    renderModal()
    // Days render first (7 chips), then meal types (4 chips).
    const checkboxes = screen.getAllByRole('checkbox')
    fireEvent.click(checkboxes[0])
    // 28 - 4 = 24
    expect(screen.getByText(/24 empty slots selected/i)).toBeInTheDocument()
  })

  test('deselecting a meal type reduces the empty slot count', () => {
    renderModal()
    const checkboxes = screen.getAllByRole('checkbox')
    // Index 7 is the first meal-type chip ("Breakfast")
    fireEvent.click(checkboxes[7])
    // 28 - 7 = 21
    expect(screen.getByText(/21 empty slots selected/i)).toBeInTheDocument()
  })

  test('does not write when preview has no meals', () => {
    renderModal()
    expect(screen.queryByText(/Fill \d+ slot/i)).not.toBeInTheDocument()
    expect(mockAddMeal).not.toHaveBeenCalled()
  })

  test('disables preview when no empty slots remain', () => {
    const filled = {}
    const today = new Date()
    for (let i = 0; i < 7; i += 1) {
      const d = new Date(today)
      d.setDate(today.getDate() + i)
      filled[d.toISOString().split('T')[0]] = {
        breakfast: [{ id: 'a', name: 'A' }],
        lunch: [{ id: 'b', name: 'B' }],
        dinner: [{ id: 'c', name: 'C' }],
        snack: [{ id: 'd', name: 'D' }],
      }
    }
    mockMealPlan = filled

    renderModal()
    expect(screen.getByText(/0 empty slots selected/i)).toBeInTheDocument()
    expect(screen.getByText('Preview my week')).toBeDisabled()
  })

  test('shows fetch error from hook', async () => {
    global.fetch.mockImplementation(() =>
      Promise.resolve({
        ok: false,
        status: 502,
        json: () => Promise.resolve({ success: false, error: 'Could not fill any requested slots' }),
      })
    )

    renderModal()
    fireEvent.click(screen.getByText('Preview my week'))

    await waitFor(() => expect(screen.getByText(/Could not fill any requested slots/i)).toBeInTheDocument())
  })

  test('renders nothing when closed', () => {
    render(<AutoFillMealPlan open={false} onClose={() => {}} />)
    expect(screen.queryByText(/auto-fill your week/i)).not.toBeInTheDocument()
  })
})
