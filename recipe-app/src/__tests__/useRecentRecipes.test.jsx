import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { useRecentRecipes } from '../useRecentRecipes'

function TestHarness() {
  const [recents, add, clear] = useRecentRecipes()
  return (
    <div>
      <span data-testid="count">{recents.length}</span>
      <button data-testid="add" onClick={() => add({ id: 'r1', name: 'Recipe 1' })}>Add</button>
      <button data-testid="clear" onClick={clear}>Clear</button>
    </div>
  )
}

describe('useRecentRecipes', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  test('starts with empty recents', () => {
    render(<TestHarness />)
    expect(screen.getByTestId('count')).toHaveTextContent('0')
  })

  test('add adds recipe to recents', () => {
    render(<TestHarness />)
    fireEvent.click(screen.getByTestId('add'))
    expect(screen.getByTestId('count')).toHaveTextContent('1')
  })

  test('clear removes all recents', () => {
    render(<TestHarness />)
    fireEvent.click(screen.getByTestId('add'))
    fireEvent.click(screen.getByTestId('clear'))
    expect(screen.getByTestId('count')).toHaveTextContent('0')
  })

  test('handles corrupted localStorage gracefully', () => {
    localStorage.setItem('seasoned_recent_recipes', 'invalid json {{{')
    render(<TestHarness />)
    expect(screen.getByTestId('count')).toHaveTextContent('0')
  })
})
