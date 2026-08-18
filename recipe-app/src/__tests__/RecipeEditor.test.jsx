import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import RecipeEditor, { formToRecipePatch, recipeToForm, toEditableLines } from '../RecipeEditor.jsx'

const baseRecipe = {
  id: 'recipe-1',
  name: 'Miso Soup',
  description: 'Warming and quick.',
  image: 'https://example.test/soup.jpg',
  prep_time: 'PT10M',
  cook_time: 'PT15M',
  recipe_yield: '2',
  ingredients: ['4 cups dashi', '3 tbsp miso'],
  instructions: ['Heat the dashi.', 'Whisk in the miso.'],
}

function renderEditor(overrides = {}, props = {}) {
  const onSave = jest.fn().mockResolvedValue(undefined)
  const onClose = jest.fn()
  render(<RecipeEditor recipe={{ ...baseRecipe, ...overrides }} onSave={onSave} onClose={onClose} {...props} />)
  return { onSave, onClose }
}

describe('recipe form conversion', () => {
  it('flattens object ingredients and instructions to editable strings', () => {
    expect(toEditableLines(['plain', { text: 'step text' }, { name: 'named' }, 7, null]))
      .toEqual(['plain', 'step text', 'named', '7', ''])
  })

  it('seeds an empty row so a recipe with no ingredients is still editable', () => {
    const form = recipeToForm({ name: 'Bare' })
    expect(form.ingredients).toEqual([''])
    expect(form.instructions).toEqual([''])
    expect(form.description).toBe('')
  })

  it('tolerates being called with no recipe at all', () => {
    expect(recipeToForm().name).toBe('')
  })

  it('trims fields and drops blank rows on the way out', () => {
    expect(formToRecipePatch({
      name: '  Soup  ',
      description: ' tasty ',
      image: ' https://x.test/a.jpg ',
      prep_time: ' PT10M ',
      cook_time: ' PT15M ',
      recipe_yield: ' 2 ',
      ingredients: ['  miso ', '   ', 'dashi'],
      instructions: ['Heat.', ''],
    })).toEqual({
      name: 'Soup',
      description: 'tasty',
      image: 'https://x.test/a.jpg',
      prep_time: 'PT10M',
      cook_time: 'PT15M',
      recipe_yield: '2',
      ingredients: ['miso', 'dashi'],
      instructions: ['Heat.'],
    })
  })
})

describe('RecipeEditor', () => {
  it('prefills every field from the open recipe', () => {
    renderEditor()
    expect(screen.getByLabelText('Title')).toHaveValue('Miso Soup')
    expect(screen.getByLabelText('Description')).toHaveValue('Warming and quick.')
    expect(screen.getByLabelText('Prep time')).toHaveValue('PT10M')
    expect(screen.getByLabelText('Cook time')).toHaveValue('PT15M')
    expect(screen.getByLabelText('Serves')).toHaveValue('2')
    expect(screen.getByLabelText('Image URL')).toHaveValue('https://example.test/soup.jpg')
    expect(screen.getByLabelText('Ingredient 1')).toHaveValue('4 cups dashi')
    expect(screen.getByLabelText('Step 2')).toHaveValue('Whisk in the miso.')
  })

  it('saves the edited values as a patch', async () => {
    const user = userEvent.setup()
    const { onSave } = renderEditor()
    await user.clear(screen.getByLabelText('Title'))
    await user.type(screen.getByLabelText('Title'), 'Better Miso Soup')
    await user.clear(screen.getByLabelText('Ingredient 2'))
    await user.type(screen.getByLabelText('Ingredient 2'), '4 tbsp miso')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Better Miso Soup',
      ingredients: ['4 cups dashi', '4 tbsp miso'],
      instructions: ['Heat the dashi.', 'Whisk in the miso.'],
    }))
  })

  it('carries edits to every metadata field and to an instruction step', async () => {
    const user = userEvent.setup()
    const { onSave } = renderEditor()

    await user.clear(screen.getByLabelText('Description'))
    await user.type(screen.getByLabelText('Description'), 'Weeknight quick.')
    await user.clear(screen.getByLabelText('Prep time'))
    await user.type(screen.getByLabelText('Prep time'), 'PT5M')
    await user.clear(screen.getByLabelText('Cook time'))
    await user.type(screen.getByLabelText('Cook time'), 'PT12M')
    await user.clear(screen.getByLabelText('Serves'))
    await user.type(screen.getByLabelText('Serves'), '4')
    await user.clear(screen.getByLabelText('Image URL'))
    await user.type(screen.getByLabelText('Image URL'), 'https://example.test/new.jpg')
    await user.clear(screen.getByLabelText('Step 1'))
    await user.type(screen.getByLabelText('Step 1'), 'Bring the dashi to a bare simmer.')

    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(onSave).toHaveBeenCalled())
    expect(onSave.mock.calls[0][0]).toEqual({
      name: 'Miso Soup',
      description: 'Weeknight quick.',
      image: 'https://example.test/new.jpg',
      prep_time: 'PT5M',
      cook_time: 'PT12M',
      recipe_yield: '4',
      ingredients: ['4 cups dashi', '3 tbsp miso'],
      instructions: ['Bring the dashi to a bare simmer.', 'Whisk in the miso.'],
    })
  })

  it('refuses to save a recipe with no title', async () => {
    const user = userEvent.setup()
    const { onSave } = renderEditor()
    await user.clear(screen.getByLabelText('Title'))
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('A recipe needs a title.')
    expect(onSave).not.toHaveBeenCalled()
  })

  it('surfaces a failed save instead of closing silently', async () => {
    const user = userEvent.setup()
    const onSave = jest.fn().mockRejectedValue(new Error('Could not save your changes: 500'))
    render(<RecipeEditor recipe={baseRecipe} onSave={onSave} onClose={jest.fn()} />)
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save your changes: 500')
  })

  it('adds, removes and reorders ingredient rows', async () => {
    const user = userEvent.setup()
    const { onSave } = renderEditor()

    await user.click(screen.getByRole('button', { name: 'Add ingredient' }))
    await user.type(screen.getByLabelText('Ingredient 3'), 'scallions')
    await user.click(screen.getByRole('button', { name: 'Move ingredient 3 up' }))
    await user.click(screen.getByRole('button', { name: 'Remove ingredient 3' }))
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(onSave).toHaveBeenCalled())
    expect(onSave.mock.calls[0][0].ingredients).toEqual(['4 cups dashi', 'scallions'])
  })

  it('moves an instruction step down', async () => {
    const user = userEvent.setup()
    const { onSave } = renderEditor()
    await user.click(screen.getByRole('button', { name: 'Move step 1 down' }))
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(onSave).toHaveBeenCalled())
    expect(onSave.mock.calls[0][0].instructions).toEqual(['Whisk in the miso.', 'Heat the dashi.'])
  })

  it('keeps one blank row rather than emptying the list entirely', async () => {
    const user = userEvent.setup()
    renderEditor({ ingredients: ['only one'] })
    await user.click(screen.getByRole('button', { name: 'Remove ingredient 1' }))
    expect(screen.getByLabelText('Ingredient 1')).toHaveValue('')
  })

  it('disables the move buttons at the ends of a list', () => {
    renderEditor()
    expect(screen.getByRole('button', { name: 'Move ingredient 1 up' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Move ingredient 2 down' })).toBeDisabled()
  })

  it('closes from the cancel button, the × and a backdrop click', async () => {
    const user = userEvent.setup()
    const { onClose } = renderEditor()

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await user.click(screen.getByRole('button', { name: 'Close editor' }))
    expect(onClose).toHaveBeenCalledTimes(2)

    await user.click(screen.getByRole('dialog').parentElement)
    expect(onClose).toHaveBeenCalledTimes(3)
  })

  it('does not close when the click starts inside the sheet', async () => {
    const user = userEvent.setup()
    const { onClose } = renderEditor()
    await user.click(screen.getByRole('dialog'))
    expect(onClose).not.toHaveBeenCalled()
  })
})
