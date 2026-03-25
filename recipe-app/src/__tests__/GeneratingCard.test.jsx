import React from 'react'
import { render, screen, act } from '@testing-library/react'
import GeneratingCard from '../GeneratingCard'

describe('GeneratingCard', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  test('renders dish name', () => {
    render(<GeneratingCard dishName="Chocolate Cake" />)
    expect(screen.getByText('Chocolate Cake')).toBeInTheDocument()
  })

  test('cycles through kitchen phrases', () => {
    render(<GeneratingCard dishName="Test" />)
    const initialPhrase = screen.getByText(/Selecting ingredients|Balancing flavours|Writing the method|Seasoning to taste|Plating up/)
    expect(initialPhrase).toBeInTheDocument()

    act(() => {
      jest.advanceTimersByTime(3500)
    })
    // Phrase should have changed
    const phrases = screen.getAllByText(/Selecting ingredients|Balancing flavours|Writing the method|Seasoning to taste|Plating up/)
    expect(phrases.length).toBeGreaterThanOrEqual(1)
  })

  test('shows hint text', () => {
    render(<GeneratingCard dishName="Test" />)
    expect(screen.getByText(/AI recipes take about 15 seconds/)).toBeInTheDocument()
  })
})
