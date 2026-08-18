import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import RecipeCard from '../RecipeCard'

const flagOverrides = {}
jest.mock('../flaggly.js', () => ({
  useFlag: (key) => flagOverrides[key] ?? true,
  flaggly: {},
}))

const baseRecipe = {
  id: 'r1',
  source: 'clipped',
  name: 'Spaghetti Carbonara',
  ingredients: ['200g spaghetti'],
  instructions: ['Boil pasta.'],
}

function renderCard(props = {}, recipeOverrides = {}) {
  const onEdit = jest.fn()
  const onOpenNotes = jest.fn()
  render(
    <RecipeCard
      recipe={{ ...baseRecipe, ...recipeOverrides }}
      onClose={jest.fn()}
      onElevate={jest.fn()}
      isElevating={false}
      onSave={jest.fn()}
      onEdit={onEdit}
      onOpenNotes={onOpenNotes}
      {...props}
    />,
  )
  return { onEdit, onOpenNotes }
}

function openOptionsMenu() {
  fireEvent.click(screen.getByRole('button', { name: 'More recipe options' }))
}

describe('RecipeCard — edit and notes actions', () => {
  beforeEach(() => {
    for (const key of Object.keys(flagOverrides)) delete flagOverrides[key]
  })

  test('opens the editor from the options menu', () => {
    const { onEdit } = renderCard()
    openOptionsMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }))
    expect(onEdit).toHaveBeenCalledTimes(1)
  })

  test('opens the notes sheet from the options menu', () => {
    const { onOpenNotes } = renderCard()
    openOptionsMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: /Notes/ }))
    expect(onOpenNotes).toHaveBeenCalledTimes(1)
  })

  test('shows the note count beside the Notes action', () => {
    renderCard({ noteCount: 3 })
    openOptionsMenu()
    expect(screen.getByRole('menuitem', { name: /Notes/ })).toHaveTextContent('3')
  })

  test('omits the count when there are no notes', () => {
    renderCard({ noteCount: 0 })
    openOptionsMenu()
    expect(screen.getByRole('menuitem', { name: /Notes/ })).toHaveTextContent(/^Notes$/)
  })

  test('disables both actions for a recipe that is not stored yet', () => {
    renderCard({}, { id: undefined })
    openOptionsMenu()
    expect(screen.getByRole('menuitem', { name: 'Edit' })).toBeDisabled()
    expect(screen.getByRole('menuitem', { name: /Notes/ })).toBeDisabled()
    expect(screen.getByRole('menuitem', { name: 'Edit' }))
      .toHaveAttribute('title', 'Save this recipe before editing it')
  })

  test('disables both actions while a save is still in flight', () => {
    renderCard({ saveState: 'saving' })
    openOptionsMenu()
    expect(screen.getByRole('menuitem', { name: 'Edit' })).toBeDisabled()
    expect(screen.getByRole('menuitem', { name: /Notes/ })).toBeDisabled()
  })

  test('hides each action when its feature flag is off', () => {
    flagOverrides['recipe-editing'] = false
    flagOverrides['recipe-notes'] = false
    renderCard()
    openOptionsMenu()
    expect(screen.queryByRole('menuitem', { name: 'Edit' })).not.toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: /Notes/ })).not.toBeInTheDocument()
  })

  test('hides each action when the host provides no handler', () => {
    render(
      <RecipeCard
        recipe={baseRecipe}
        onClose={jest.fn()}
        onElevate={jest.fn()}
        isElevating={false}
        onSave={jest.fn()}
      />,
    )
    openOptionsMenu()
    expect(screen.queryByRole('menuitem', { name: 'Edit' })).not.toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: /Notes/ })).not.toBeInTheDocument()
  })

  test('closes the menu after choosing an action', () => {
    renderCard()
    openOptionsMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }))
    expect(screen.queryByRole('menu', { name: 'Recipe actions' })).not.toBeInTheDocument()
  })
})
