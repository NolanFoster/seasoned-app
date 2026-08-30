import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import MealAtomComposerModal from '../MealAtomComposerModal.jsx'

jest.mock('../flaggly.js', () => ({
  useFlag: (key) => key === 'meal-atom',
}))

describe('MealAtomComposerModal', () => {
  test('renders meal composer and saves multi-component hybrid plate', () => {
    const onSave = jest.fn()
    render(
      <MealAtomComposerModal
        isOpen={true}
        onClose={jest.fn()}
        initialMeal={null}
        onSaveMeal={onSave}
      />
    )

    expect(screen.getByText('Hybrid Meal Composer')).toBeInTheDocument()
    expect(screen.getByText(/Corn Tortillas & Fresh Salsa/i)).toBeInTheDocument()
    expect(screen.getByText(/Seasoned Ground Beef/i)).toBeInTheDocument()
    expect(screen.getByText(/Black Beans & Roasted Mushrooms/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Save Hybrid Meal Plate/i }))

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Taco Night Hybrid Plate',
        components: expect.arrayContaining([
          expect.objectContaining({ name: expect.stringContaining('Corn Tortillas') }),
        ]),
      })
    )
  })
})
