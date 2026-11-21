import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import MultiHomeCustodyModal from '../MultiHomeCustodyModal.jsx'

jest.mock('../flaggly.js', () => ({
  useFlag: (key) => key === 'multi-home-custody',
}))

describe('MultiHomeCustodyModal', () => {
  test('renders multi-home custody modal and allows switching the active kitchen locus', () => {
    const onSelect = jest.fn()
    render(
      <MultiHomeCustodyModal
        isOpen={true}
        onClose={jest.fn()}
        activeHomeId="home-primary"
        onSelectHome={onSelect}
      />
    )

    expect(screen.getByText('Active Household Locus')).toBeInTheDocument()
    expect(screen.getByText("Mom's / Primary Home")).toBeInTheDocument()
    expect(screen.getByText("Dad's / Second Home")).toBeInTheDocument()

    const secondaryRadio = screen.getByRole('radio', { name: /Dad's \/ Second Home/i })
    fireEvent.click(secondaryRadio)

    fireEvent.click(screen.getByRole('button', { name: /Switch Active Kitchen/i }))

    expect(onSelect).toHaveBeenCalledWith('home-secondary')
  })
})
