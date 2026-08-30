import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import ProduceBoxIntakeModal from '../ProduceBoxIntakeModal.jsx'

jest.mock('../flaggly.js', () => ({
  useFlag: (key) => key === 'csa-produce-intake',
}))

describe('ProduceBoxIntakeModal', () => {
  test('parses pasted produce text and shows review cards with storage hints', () => {
    const onImport = jest.fn()
    render(
      <ProduceBoxIntakeModal
        isOpen={true}
        onClose={jest.fn()}
        onImportToPantry={onImport}
      />
    )

    expect(screen.getByText('Produce Box Intake')).toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText(/1 bunch Garlic Scapes/i), {
      target: { value: 'Garlic Scapes\nBok Choy\nHeirloom Tomatoes' },
    })

    fireEvent.click(screen.getByRole('button', { name: /Parse Produce Haul/i }))

    expect(screen.getByText('Identified Produce (3)')).toBeInTheDocument()
    expect(screen.getByText('Garlic Scapes')).toBeInTheDocument()
    expect(screen.getByText('Bok Choy')).toBeInTheDocument()
    expect(screen.getByText(/~10 days shelf-life/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Add to Pantry & Plan/i }))
    expect(onImport).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Garlic Scapes' }),
        expect.objectContaining({ name: 'Bok Choy' }),
      ])
    )
  })
})
