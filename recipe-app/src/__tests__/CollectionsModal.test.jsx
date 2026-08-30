import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import CollectionsModal from '../CollectionsModal.jsx'

jest.mock('../flaggly.js', () => ({
  useFlag: (key) => key === 'recipe-collections',
}))

describe('CollectionsModal', () => {
  const sampleRecipes = [
    { id: 'rec-1', name: 'Avocado Toast' },
    { id: 'rec-2', name: 'Garlic Butter Salmon' },
  ]

  const sampleCollections = [
    {
      id: 'col-1',
      title: 'Weeknight Faves',
      description: 'Quick dinners',
      recipeIds: ['rec-1'],
      source: 'manual',
    },
  ]

  test('renders modal and existing collections list', () => {
    render(
      <CollectionsModal
        isOpen={true}
        onClose={jest.fn()}
        collections={sampleCollections}
        recipes={sampleRecipes}
        onCreateCollection={jest.fn()}
        onUpdateCollection={jest.fn()}
      />
    )

    expect(screen.getByText('📚 Recipe Collections & Cookbooks')).toBeInTheDocument()
    expect(screen.getByText('Weeknight Faves')).toBeInTheDocument()
  })

  test('creates a new collection via form submission', () => {
    const onCreate = jest.fn()
    render(
      <CollectionsModal
        isOpen={true}
        onClose={jest.fn()}
        collections={sampleCollections}
        recipes={sampleRecipes}
        onCreateCollection={onCreate}
        onUpdateCollection={jest.fn()}
      />
    )

    fireEvent.click(screen.getByText('+ New'))
    expect(screen.getByText('Create New Collection')).toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText(/e.g. Quick Weeknight Dinners/i), {
      target: { value: 'Healthy Lunches' },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Save Collection' }))

    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Healthy Lunches',
        source: 'manual',
      })
    )
  })

  test('toggles recipe membership in collection', () => {
    const onUpdate = jest.fn()
    render(
      <CollectionsModal
        isOpen={true}
        onClose={jest.fn()}
        collections={sampleCollections}
        recipes={sampleRecipes}
        onCreateCollection={jest.fn()}
        onUpdateCollection={onUpdate}
      />
    )

    // Select the collection
    fireEvent.click(screen.getByText('Weeknight Faves'))

    expect(screen.getByText('Add / Remove Recipes')).toBeInTheDocument()
    const salmonCheckbox = screen.getByLabelText('Garlic Butter Salmon')
    expect(salmonCheckbox).not.toBeChecked()

    fireEvent.click(salmonCheckbox)
    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'col-1',
        recipeIds: ['rec-1', 'rec-2'],
      })
    )
  })
})
