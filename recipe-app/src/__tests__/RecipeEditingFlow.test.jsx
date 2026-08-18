/**
 * Integration test for editing a recipe end to end:
 *   options menu → RecipeEditor → PUT /recipe/update → the open card updates.
 *
 * The card works in the display shape (name/image/prep_time) while the save
 * worker stores the camelCase schema (title/imageUrl/prepTime), so the
 * translation in App.doUpdate is what this pins down.
 */
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '../App'
import { MealPlanProvider } from '../MealPlanContext.jsx'

jest.mock('../flaggly.js', () => ({
  useFlag: (key) => ['meal-planner', 'recipe-editing', 'recipe-notes'].includes(key),
  flaggly: {},
  syncFlagglyUser: jest.fn(),
}))

jest.mock('../useAuth', () => ({
  useAuth: () => ({
    user: { id: 'test-user', email: 'test@example.com' },
    token: 'token-a',
    loading: false,
    isAuthenticated: true,
    requestOTP: jest.fn(),
    verifyOTP: jest.fn(),
    signOut: jest.fn(),
  }),
}))

jest.mock('@hello-pangea/dnd', () => ({
  DragDropContext: ({ children }) => <>{children}</>,
  Droppable: ({ children }) => children({ innerRef: () => {}, droppableProps: {}, placeholder: null }, { isDraggingOver: false }),
  Draggable: ({ children }) => children({ innerRef: () => {}, draggableProps: {}, dragHandleProps: {} }, { isDragging: false }),
}))

const PLAN_RECIPE = {
  id: 'plan-recipe-001',
  name: 'Spaghetti Carbonara',
  description: 'A classic Italian pasta dish.',
  image: 'https://example.test/carbonara.jpg',
  prep_time: 'PT10M',
  cook_time: 'PT20M',
  recipe_yield: '4',
  ingredients: ['400g spaghetti', '3 eggs'],
  instructions: ['Boil pasta.', 'Mix with eggs.'],
  source_url: '',
}

function seedMealPlan() {
  const today = new Date().toISOString().split('T')[0]
  localStorage.setItem('seasoned_meal_plan', JSON.stringify({ [today]: [PLAN_RECIPE] }))
}

function openRecipe() {
  render(<MealPlanProvider><App /></MealPlanProvider>)
  fireEvent.click(screen.getByRole('button', { name: /open meal planner/i }))
  fireEvent.click(screen.getByRole('button', { name: /View Spaghetti Carbonara/i }))
}

function openEditor() {
  fireEvent.click(screen.getByRole('button', { name: 'More recipe options' }))
  fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }))
}

function updateCalls() {
  return global.fetch.mock.calls.filter(([url, options]) => options?.method === 'PUT' && String(url).endsWith('/recipe/update'))
}

describe('recipe editing flow', () => {
  beforeEach(() => {
    seedMealPlan()
    global.fetch.mockImplementation(() => Promise.resolve({
      ok: true, status: 200, json: () => Promise.resolve({ success: true, data: [] }),
    }))
  })
  afterEach(() => localStorage.clear())

  test('sends the edit as the stored camelCase schema and updates the open card', async () => {
    const user = userEvent.setup()
    openRecipe()
    openEditor()

    await user.clear(screen.getByLabelText('Title'))
    await user.type(screen.getByLabelText('Title'), 'Carbonara, fixed')
    await user.clear(screen.getByLabelText('Serves'))
    await user.type(screen.getByLabelText('Serves'), '6')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(updateCalls()).toHaveLength(1))
    const [, options] = updateCalls()[0]
    expect(JSON.parse(options.body)).toEqual({
      recipeId: 'plan-recipe-001',
      updates: {
        title: 'Carbonara, fixed',
        description: 'A classic Italian pasta dish.',
        imageUrl: 'https://example.test/carbonara.jpg',
        prepTime: 'PT10M',
        cookTime: 'PT20M',
        servings: '6',
        ingredients: ['400g spaghetti', '3 eggs'],
        instructions: ['Boil pasta.', 'Mix with eggs.'],
      },
    })

    // The editor closes and the card shows the new title without a refetch.
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Edit recipe' })).not.toBeInTheDocument())
    expect(screen.getByRole('heading', { name: 'Carbonara, fixed' })).toBeInTheDocument()
  })

  test('keeps the editor open and reports the failure when the save is rejected', async () => {
    const user = userEvent.setup()
    global.fetch.mockImplementation((url, options = {}) => {
      if (options.method === 'PUT') {
        return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({ error: 'Recipe not found' }) })
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ success: true, data: [] }) })
    })

    openRecipe()
    openEditor()
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Recipe not found')
    expect(screen.getByRole('dialog', { name: 'Edit recipe' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Spaghetti Carbonara' })).toBeInTheDocument()
  })

  test('closes an open sheet when a different recipe is selected', async () => {
    const today = new Date().toISOString().split('T')[0]
    localStorage.setItem('seasoned_meal_plan', JSON.stringify({
      [today]: [PLAN_RECIPE, { ...PLAN_RECIPE, id: 'plan-recipe-002', name: 'Miso Soup' }],
    }))

    openRecipe()
    openEditor()
    expect(screen.getByRole('dialog', { name: 'Edit recipe' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /open meal planner/i }))
    fireEvent.click(screen.getByRole('button', { name: /View Miso Soup/i }))

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Edit recipe' })).not.toBeInTheDocument())
    expect(screen.getByRole('heading', { name: 'Miso Soup' })).toBeInTheDocument()
  })

  test('opens the private notes sheet for the active recipe', async () => {
    openRecipe()
    fireEvent.click(screen.getByRole('button', { name: 'More recipe options' }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Notes/ }))

    // The sheet is scoped to the open recipe; the request the hook makes for it
    // is covered in useRecipeNotes.test.jsx.
    const dialog = await screen.findByRole('dialog', { name: 'My notes' })
    expect(dialog).toHaveTextContent('Spaghetti Carbonara')
    expect(screen.getByLabelText('Add a note')).toBeInTheDocument()
  })
})
