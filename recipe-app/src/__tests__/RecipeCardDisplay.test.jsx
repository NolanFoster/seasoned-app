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

  test('shows the allergen safety notice when a recipe has a hard-allergen check', () => {
    render(<RecipeCardDisplay recipe={{
      ...baseRecipe,
      appliedConstraints: { hardAllergens: ['peanuts'] },
      allergenSummary: { checked: true, blocked: [] },
    }} />)

    expect(screen.getByText(/AI can miss allergens and cross-contact/i)).toBeInTheDocument()
  })

  test('explains blocked allergens and uncertain ingredients', () => {
    render(<RecipeCardDisplay recipe={{
      ...baseRecipe,
      appliedConstraints: { hardAllergens: ['peanuts'] },
      allergenSummary: {
        checked: true,
        safe: false,
        blocked: ['peanuts'],
        contains: ['peanuts'],
        needs_review: true,
        may_contain_uncertain: ['1 cup seasoning blend'],
      },
    }} />)

    expect(screen.getByRole('alert')).toHaveTextContent('Allergen conflict detected')
    expect(screen.getByRole('alert')).toHaveTextContent('Peanuts')
    expect(screen.getByRole('alert')).toHaveTextContent('Review these ingredients')
    expect(screen.getByRole('alert')).toHaveTextContent('AI can miss allergens and cross-contact')
  })

  test('does not render an allergen notice without a check or saved allergens', () => {
    render(<RecipeCardDisplay recipe={baseRecipe} />)
    expect(screen.queryByText(/AI can miss allergens and cross-contact/i)).not.toBeInTheDocument()
  })

  test('handles object ingredients', () => {
    render(<RecipeCardDisplay recipe={{ ...baseRecipe, ingredients: [{ name: '2 eggs' }] }} />)
    expect(screen.getByText('2 eggs')).toBeInTheDocument()
  })
})

describe('Recipe provenance and quality bar', () => {
  test('shows transparent provenance for generated recipes', () => {
    render(<RecipeCardDisplay recipe={{
      name: 'AI rice bowl',
      source: 'ai_generated',
      generationMethod: 'llama-ai',
      ingredients: ['1 cup rice'],
      instructions: ['Cook the rice.'],
      qualityBar: { status: 'passed', score: 96, allergenCheck: 'passed' },
      provenance: {
        source: 'ai_generated',
        generationMethod: 'llama-ai',
        model: '@cf/meta/llama-4-scout-17b-16e-instruct',
        similarRecipeIds: ['recipe-1'],
        nutritionCoverage: 80,
        appliedConstraints: { dietary: ['vegetarian'] },
      },
    }} />)

    const provenance = screen.getByRole('region', { name: 'How this was made' })
    expect(provenance).toHaveTextContent('LLaMA generation')
    expect(provenance).toHaveTextContent('96/100')
    expect(provenance).toHaveTextContent('Checks passed')
    expect(provenance).toHaveTextContent('@cf/meta/llama-4-scout-17b-16e-instruct')
    expect(provenance).toHaveTextContent('1 similar recipe')
    expect(provenance).toHaveTextContent('80% ingredient coverage')
  })

  test('does not add AI provenance chrome to a plain clipped recipe', () => {
    render(<RecipeCardDisplay recipe={{
      name: 'Clipped recipe',
      source: 'clipped',
      ingredients: ['1 cup rice'],
      instructions: ['Cook the rice.'],
    }} />)
    expect(screen.queryByRole('region', { name: 'How this was made' })).not.toBeInTheDocument()
  })
})

describe('Process safety notice', () => {
  const blockedSummary = {
    checked: true,
    safe: false,
    status: 'blocked',
    tags: ['home_canning_low_acid'],
    blocked: ['home_canning_low_acid'],
    requires_template: [],
    warnings: [],
    policyActions: [{ tag: 'home_canning_low_acid', label: 'Home canning of low-acid food', policy: 'block' }],
    sources: [{ id: 'nchfp', label: 'USDA National Center for Home Food Preservation', url: 'https://nchfp.uga.edu/' }],
    cook_gate: 'block',
    disclaimer: 'Seasoned does not certify home preservation.',
  }

  test('announces a blocked technique with its authoritative sources', () => {
    render(<RecipeCardDisplay recipe={{
      name: 'Canned Green Beans',
      ingredients: ['green beans'],
      instructions: ['Follow a tested guide.'],
      processSafetySummary: blockedSummary,
    }} />)

    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('Unsafe technique blocked')
    expect(alert).toHaveTextContent('Home canning of low-acid food')
    expect(alert).toHaveTextContent('Seasoned does not certify home preservation.')
    expect(screen.getByRole('link', { name: /National Center for Home Food Preservation/i }))
      .toHaveAttribute('href', 'https://nchfp.uga.edu/')
  })

  test('explains a template redirect for a preserving recipe', () => {
    render(<RecipeCardDisplay recipe={{
      name: 'Strawberry Jam',
      ingredients: ['strawberries'],
      instructions: ['Follow a tested guide.'],
      processSafetySummary: {
        ...blockedSummary,
        status: 'template_required',
        tags: ['water_bath_preserve'],
        blocked: [],
        requires_template: ['water_bath_preserve'],
        policyActions: [{ tag: 'water_bath_preserve', label: 'Water-bath preserving', policy: 'force_template' }],
      },
    }} />)

    expect(screen.getByRole('alert')).toHaveTextContent('Use a tested process')
    expect(screen.getByRole('alert')).toHaveTextContent('Water-bath preserving')
  })

  test('shows a warning without an alert for a review-only hazard', () => {
    render(<RecipeCardDisplay recipe={{
      name: 'Kimchi',
      ingredients: ['cabbage'],
      instructions: ['Ferment for 5 days.'],
      processSafetySummary: {
        ...blockedSummary,
        safe: true,
        status: 'needs_review',
        tags: ['fermentation_anaerobic'],
        blocked: [],
        cook_gate: 'confirm',
        warnings: [{
          tag: 'fermentation_anaerobic',
          label: 'Anaerobic fermentation',
          reason: 'Salt and temperature ranges decide whether a ferment is safe.',
          guidance: 'Verify against a tested fermentation guide.',
        }],
      },
    }} />)

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByText(/Check this technique/i)).toBeInTheDocument()
    expect(screen.getByText(/Verify against a tested fermentation guide/i)).toBeInTheDocument()
  })

  test('renders nothing when the check found no hazard', () => {
    render(<RecipeCardDisplay recipe={{
      name: 'Roast Chicken',
      ingredients: ['1 chicken'],
      instructions: ['Roast until done.'],
      processSafetySummary: {
        checked: true, safe: true, status: 'passed', tags: [], blocked: [],
        requires_template: [], warnings: [], sources: [], cook_gate: 'allow',
      },
    }} />)

    expect(screen.queryByText(/technique/i)).not.toBeInTheDocument()
  })
})

describe('Uncertainty and abstention banner', () => {
  const summary = {
    checked: true,
    level: 'abstain',
    confidence: 0,
    abstained: true,
    dimensions: {
      nutrition: { level: 'abstain', reasons: ['nutrition_not_calculated'] },
      allergen_coverage: { level: 'abstain', reasons: ['opaque_or_precautionary_ingredient_terms'] },
      process_safety: { level: 'high', reasons: [] },
      authenticity: { level: 'medium', reasons: ['generated_content_not_independently_verified'] },
    },
  }

  test('explains knowledge gaps and separates abstention from a hard block', () => {
    render(<RecipeCardDisplay recipe={{
      name: 'AI blend bowl',
      source: 'ai_generated',
      generationMethod: 'llama-ai',
      ingredients: ['1 cup seasoning blend'],
      instructions: ['Stir in the seasoning blend.'],
      qualityBar: { status: 'passed', score: 96, allergenCheck: 'passed' },
      provenance: { source: 'ai_generated', generationMethod: 'llama-ai' },
      uncertaintySummary: summary,
    }} />)

    const banner = screen.getByRole('alert', { name: 'Recipe uncertainty' })
    expect(banner).toHaveTextContent('Safety information needs review')
    expect(banner).toHaveTextContent('Macros were not calculated')
    expect(banner).toHaveTextContent('Some ingredient terms are ambiguous')
    expect(screen.getByRole('region', { name: 'How this was made' }))
      .toHaveTextContent('Review required')
    expect(screen.getByText('Safety').closest('span')).toHaveClass('recipe-provenance-item--abstain')
  })

  test('renders a review note for non-safety uncertainty', () => {
    render(<RecipeCardDisplay recipe={{
      name: 'Estimated bowl',
      source: 'ai_generated',
      ingredients: ['1 cup rice'],
      instructions: ['Cook the rice.'],
      uncertaintySummary: {
        checked: true,
        level: 'medium',
        dimensions: {
          nutrition: { level: 'medium', reasons: ['nutrition_is_estimated'] },
          allergen_coverage: { level: 'high', reasons: [] },
          process_safety: { level: 'high', reasons: [] },
        },
      },
    }} />)

    expect(screen.getByRole('note', { name: 'Recipe uncertainty' })).toHaveTextContent('Macros are estimates')
  })
})
