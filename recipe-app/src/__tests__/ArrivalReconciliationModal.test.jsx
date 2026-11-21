import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import ArrivalReconciliationModal from '../ArrivalReconciliationModal.jsx'

jest.mock('../flaggly.js', () => ({
  useFlag: (key) => key === 'arrival-reconciliation',
}))

describe('ArrivalReconciliationModal', () => {
  const sampleOrdered = [
    { name: 'Oat Milk' },
    { name: 'Roma Tomatoes' },
    { name: 'Fresh Cilantro' },
  ]

  test('reconciles ordered vs arrived text and displays substitution cards', () => {
    render(
      <ArrivalReconciliationModal
        isOpen={true}
        onClose={jest.fn()}
        orderedItems={sampleOrdered}
        onCommitArrival={jest.fn()}
      />
    )

    expect(screen.getByText('Reconcile Grocery Order')).toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText(/Paste arrived items here.../i), {
      target: { value: 'Oat Milk\nHeirloom Tomatoes' },
    })

    fireEvent.click(screen.getByRole('button', { name: /Check Order & Substitutions/i }))

    expect(screen.getByText('Oat Milk')).toBeInTheDocument()
    expect(screen.getByText('Roma Tomatoes')).toBeInTheDocument()
    expect(screen.getByText('Heirloom Tomatoes')).toBeInTheDocument()
    expect(screen.getByText('Fresh Cilantro')).toBeInTheDocument()
  })

  test('blocks confirmation and displays alert banner when allergen conflict is present', () => {
    render(
      <ArrivalReconciliationModal
        isOpen={true}
        onClose={jest.fn()}
        orderedItems={[{ name: 'Oat Milk' }]}
        hardAllergens={['almond']}
        onCommitArrival={jest.fn()}
      />
    )

    fireEvent.change(screen.getByPlaceholderText(/Paste arrived items here.../i), {
      target: { value: 'Almond Milk' },
    })

    fireEvent.click(screen.getByRole('button', { name: /Check Order & Substitutions/i }))

    expect(screen.getByRole('alert')).toHaveTextContent(/Allergen Conflict Detected/i)
    expect(screen.getByRole('button', { name: /Resolve Allergen First/i })).toBeDisabled()
  })
})
