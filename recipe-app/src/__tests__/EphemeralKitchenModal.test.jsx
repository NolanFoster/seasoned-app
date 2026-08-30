import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import EphemeralKitchenModal from '../EphemeralKitchenModal.jsx'

jest.mock('../flaggly.js', () => ({
  useFlag: (key) => key === 'ephemeral-kitchen-mode',
}))

describe('EphemeralKitchenModal', () => {
  test('renders travel kitchen overlay modal and allows toggling appliances and host allergens', () => {
    const onSave = jest.fn()
    render(
      <EphemeralKitchenModal
        isOpen={true}
        onClose={jest.fn()}
        activeOverlay={null}
        onSaveOverlay={onSave}
        onClearOverlay={jest.fn()}
      />
    )

    expect(screen.getByText('Temporary Kitchen Overlay')).toBeInTheDocument()

    // Toggle equipment
    const instantPotBtn = screen.getByRole('button', { name: 'instant pot' })
    fireEvent.click(instantPotBtn)

    // Toggle host allergen
    const peanutsBtn = screen.getByRole('button', { name: 'peanuts' })
    fireEvent.click(peanutsBtn)

    fireEvent.click(screen.getByRole('button', { name: /Activate Travel Overlay/i }))

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        active: true,
        equipment: expect.arrayContaining(['instant_pot']),
        hostAllergens: expect.arrayContaining(['peanuts']),
      })
    )
  })
})
