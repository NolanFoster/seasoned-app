import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import RecipeCardDisplay, { parseDuration } from '../RecipeCardDisplay'

describe('parseDuration', () => {
  test('returns null for empty/falsy values', () => {
    expect(parseDuration(null)).toBeNull()
    expect(parseDuration(undefined)).toBeNull()
    expect(parseDuration('')).toBeNull()
  })

  test('formats number as minutes', () => {
    expect(parseDuration(30)).toBe('30 min')
  })

  test('parses ISO 8601 PT format - minutes only', () => {
    expect(parseDuration('PT30M')).toBe('30 min')
    expect(parseDuration('pt15m')).toBe('15 min')
  })

  test('parses ISO 8601 PT format - hours only', () => {
    expect(parseDuration('PT1H')).toBe('1 hr')
    expect(parseDuration('PT2H')).toBe('2 hr')
  })

  test('parses ISO 8601 PT format - hours and minutes', () => {
    expect(parseDuration('PT1H30M')).toBe('1 hr 30 min')
    expect(parseDuration('PT2H15M')).toBe('2 hr 15 min')
  })

  test('returns value as-is for non-ISO strings', () => {
    expect(parseDuration('20 minutes')).toBe('20 minutes')
    expect(parseDuration('about 1 hour')).toBe('about 1 hour')
  })
})

describe('RecipeCardDisplay', () => {
  const baseRecipe = {
    name: 'Test Recipe',
    description: 'A test',
    image: 'https://example.com/img.jpg',
    prep_time: 'PT15M',
    cook_time: 'PT1H30M',
    recipe_yield: '4',
    ingredients: ['2 eggs', '1 cup flour'],
    instructions: ['Mix ingredients.', 'Bake.'],
    source_url: 'https://example.com/recipe',
    source: 'clipped',
  }

  test('renders recipe with ISO duration formatting', () => {
    render(<RecipeCardDisplay recipe={baseRecipe} />)
    expect(screen.getByText(/15 min/)).toBeInTheDocument()
    expect(screen.getByText(/1 hr 30 min/)).toBeInTheDocument()
  })

  test('calls onCookClick when Cook button is clicked', () => {
    const onCookClick = jest.fn()
    render(<RecipeCardDisplay recipe={baseRecipe} onCookClick={onCookClick} />)
    fireEvent.click(screen.getByTitle('Step-by-step cooking mode'))
    expect(onCookClick).toHaveBeenCalledTimes(1)
  })

  test('applies cookBtnId to Cook button', () => {
    render(<RecipeCardDisplay recipe={baseRecipe} onCookClick={jest.fn()} cookBtnId="cook-btn" />)
    expect(screen.getByTitle('Step-by-step cooking mode')).toHaveAttribute('id', 'cook-btn')
  })

  test('handles object ingredients', () => {
    render(<RecipeCardDisplay recipe={{ ...baseRecipe, ingredients: [{ name: '2 eggs' }] }} />)
    expect(screen.getByText('2 eggs')).toBeInTheDocument()
  })
})
