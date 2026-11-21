import {
  PROCESS_GRAPH_EDGE_TYPES,
  PROCESS_GRAPH_NODE_TYPES,
  RECIPE_PROCESS_GRAPH_FLAG,
  assertValidRecipeProcessGraph,
  calculateProcessGraphCoverage,
  createRecipeProcessGraph,
  getCriticalPath,
  getNavigatorSteps,
  getStepLocalIngredients,
  isRecipeProcessGraphEnabled,
  isValidRecipeProcessGraph,
  liftLegacyRecipeToGraph,
  liftRecipeToGraph,
  liftRecipeToProcessGraph,
  renderRecipeFromProcessGraph,
  validateRecipeProcessGraph,
  withRecipeProcessGraph,
} from '../recipe-process-graph.js'

const pastaRecipe = {
  id: 'pasta-and-pan-sauce',
  name: 'Pasta with pan sauce',
  ingredients: [
    '8 oz pasta',
    '2 tbsp olive oil',
    '2 cloves garlic',
    '1 cup crushed tomatoes',
  ],
  instructions: [
    'Bring a pot of salted water to a boil and cook pasta for 10 minutes.',
    'Meanwhile, heat olive oil in a skillet and sauté garlic.',
    'Add tomatoes and simmer for 5 minutes.',
    'Toss pasta with sauce and serve.',
  ],
}

function validGraph(overrides = {}) {
  const base = createRecipeProcessGraph({
    nodes: [
      { id: 'ingredient-1', type: 'ingredient', name: 'flour', line: '1 cup flour' },
      { id: 'action-1', type: 'action', text: 'Mix the flour.', no_tool: true },
      { id: 'intermediate-1', type: 'intermediate', name: 'dough', state: 'mixed' },
    ],
    edges: [
      { from: 'ingredient-1', to: 'action-1', type: 'uses' },
      { from: 'action-1', to: 'intermediate-1', type: 'produces' },
    ],
  })
  return { ...base, ...overrides }
}

describe('recipe process graph contract', () => {
  test('exposes the versioned node and edge vocabularies', () => {
    expect(PROCESS_GRAPH_NODE_TYPES).toEqual(['ingredient', 'tool', 'action', 'intermediate', 'timer'])
    expect(PROCESS_GRAPH_EDGE_TYPES).toEqual(['uses', 'produces', 'before', 'parallel_ok', 'heats_in', 'rests'])
    expect(RECIPE_PROCESS_GRAPH_FLAG).toBe('recipe_process_graph_v1')
  })

  test('creates a versioned graph envelope without mutating inputs', () => {
    const nodes = [{ id: 'action-1', type: 'action', text: 'Serve.', no_tool: true }]
    const graph = createRecipeProcessGraph({ nodes, edges: [] })
    expect(graph).toMatchObject({ schemaVersion: '1.0', graphType: 'recipe_process' })
    expect(graph.nodes).not.toBe(nodes)
    expect(graph.nodes[0]).not.toBe(nodes[0])
  })

  test('accepts a complete graph', () => {
    const result = validateRecipeProcessGraph(validGraph())
    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
    expect(result.stats.actions).toBe(1)
    expect(isValidRecipeProcessGraph(validGraph())).toBe(true)
  })

  test('returns machine-readable errors for malformed graphs', () => {
    const graph = validGraph({
      schemaVersion: '0.9',
      nodes: [
        { id: 'ingredient-1', type: 'ingredient', name: 'flour' },
        { id: 'ingredient-1', type: 'ingredient', name: 'duplicate' },
        { id: 'action-1', type: 'action', text: 'Mix.' },
      ],
      edges: [{ from: 'ingredient-1', to: 'missing', type: 'uses' }],
    })
    const result = validateRecipeProcessGraph(graph)
    expect(result.valid).toBe(false)
    expect(result.errors.map((error) => error.code)).toEqual(expect.arrayContaining([
      'GRAPH_SCHEMA_VERSION',
      'NODE_ID_DUPLICATE',
      'EDGE_TO_UNKNOWN',
      'INGREDIENT_ORPHAN',
      'ACTION_MISSING_PRODUCES',
      'ACTION_TOOL_REQUIRED',
    ]))
  })

  test('assert helper exposes the same structured validation result', () => {
    expect(() => assertValidRecipeProcessGraph(validGraph({ edges: [] }))).toThrowError(/validation failed/i)
    try {
      assertValidRecipeProcessGraph(validGraph({ edges: [] }))
    } catch (error) {
      expect(error.code).toBe('RECIPE_PROCESS_GRAPH_INVALID')
      expect(error.errors.map((item) => item.code)).toContain('INGREDIENT_ORPHAN')
    }
  })

  test('detects dependency cycles but ignores parallel annotations', () => {
    const graph = validGraph({
      nodes: [
        { id: 'action-1', type: 'action', text: 'Mix.', no_tool: true },
        { id: 'action-2', type: 'action', text: 'Serve.', no_tool: true },
        { id: 'result-1', type: 'intermediate', state: 'mixed' },
        { id: 'result-2', type: 'intermediate', state: 'served' },
      ],
      edges: [
        { from: 'action-1', to: 'result-1', type: 'produces' },
        { from: 'action-2', to: 'result-2', type: 'produces' },
        { from: 'action-1', to: 'action-2', type: 'parallel_ok' },
        { from: 'action-2', to: 'action-1', type: 'parallel_ok' },
      ],
    })
    expect(validateRecipeProcessGraph(graph).valid).toBe(true)
    const cyclic = { ...graph, edges: [...graph.edges, { from: 'action-2', to: 'action-1', type: 'before' }, { from: 'action-1', to: 'action-2', type: 'before' }] }
    expect(validateRecipeProcessGraph(cyclic).errors.map((error) => error.code)).toContain('GRAPH_CYCLE')
  })

  test('requires action outputs and a tool or explicit no_tool', () => {
    const result = validateRecipeProcessGraph(validGraph({
      nodes: [
        { id: 'action-1', type: 'action', text: 'Cook.' },
        { id: 'result-1', type: 'intermediate', state: 'cooked' },
      ],
      edges: [{ from: 'action-1', to: 'result-1', type: 'produces' }],
    }))
    expect(result.valid).toBe(false)
    expect(result.errors.map((error) => error.code)).toContain('ACTION_TOOL_REQUIRED')
  })
})

describe('legacy recipe lifting', () => {
  test('lifts a pasta and pan sauce recipe with parallel prep', () => {
    const graph = liftRecipeToProcessGraph(pastaRecipe)
    const result = validateRecipeProcessGraph(graph)
    expect(result.valid).toBe(true)
    expect(graph.graphConfidence).toBe('high')
    expect(graph.nodes.filter((node) => node.type === 'ingredient')).toHaveLength(4)
    expect(graph.nodes.filter((node) => node.type === 'action')).toHaveLength(4)
    expect(graph.edges).toContainEqual({ from: 'action-1', to: 'action-2', type: 'parallel_ok' })
    expect(graph.nodes.find((node) => node.type === 'ingredient' && node.name === 'pasta').allergenRefs).toContain('wheat')
  })

  test('parses quantities, units, states, equipment, and timers', () => {
    const graph = liftRecipeToProcessGraph({
      ingredients: [{ name: 'garlic', quantity: 2, unit: 'cloves' }, '1/2 cup broth'],
      instructions: ['Chop garlic in a bowl.', 'Simmer broth for 15 minutes.'],
    })
    const garlic = graph.nodes.find((node) => node.name === 'garlic')
    expect(garlic).toMatchObject({ quantity: 2, unit: 'cloves', state: 'raw' })
    expect(graph.nodes.find((node) => node.type === 'timer')).toMatchObject({ durationSeconds: 900 })
    expect(graph.nodes.filter((node) => node.type === 'tool').map((node) => node.equipmentId)).toEqual(expect.arrayContaining(['bowl']))
    expect(graph.nodes.find((node) => node.type === 'intermediate')).toHaveProperty('state', 'prepped')
  })

  test('links each matched ingredient to step-local action references', () => {
    const graph = liftRecipeToGraph(pastaRecipe)
    const steps = getNavigatorSteps(graph)
    expect(getStepLocalIngredients(graph, 1).map((node) => node.name)).toEqual(['olive oil', 'garlic'])
    expect(steps[0].ingredientRefs).toEqual(['ingredient-1'])
    expect(steps[1].parallel).toBe(true)
  })

  test('uses a safe fallback and records a warning for unmatched text', () => {
    const graph = liftLegacyRecipeToGraph({
      ingredients: ['1 cup flour', '1 tsp salt'],
      instructions: ['Do the thing.'],
    })
    expect(graph.metadata.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'INGREDIENT_MATCH_FALLBACK' }),
    ]))
    expect(validateRecipeProcessGraph(graph).valid).toBe(true)
    expect(graph.graphConfidence).toBe('medium')
  })

  test('is deterministic for the same recipe input', () => {
    const first = liftRecipeToProcessGraph(pastaRecipe)
    const second = liftRecipeToProcessGraph(pastaRecipe)
    expect(second).toEqual(first)
  })

  test.each(Array.from({ length: 20 }, (_, index) => index + 1))('fixture %i lifts to a valid graph', (index) => {
    const graph = liftRecipeToProcessGraph({
      id: `fixture-${index}`,
      ingredients: [`${index} cup ingredient ${index}`],
      instructions: [`Mix ingredient ${index} and serve.`],
    })
    expect(validateRecipeProcessGraph(graph).valid).toBe(true)
  })
})

describe('graph consumers and rollout helpers', () => {
  test('renders graph actions and ingredients back to a legacy recipe', () => {
    const graph = liftRecipeToProcessGraph(pastaRecipe)
    const rendered = renderRecipeFromProcessGraph(graph, { description: 'kept' })
    expect(rendered).toMatchObject({ description: 'kept', processGraph: graph })
    expect(rendered.ingredients).toEqual(pastaRecipe.ingredients)
    expect(rendered.instructions).toEqual(pastaRecipe.instructions)
  })

  test('calculates graph coverage and critical path timing', () => {
    const graph = liftRecipeToProcessGraph(pastaRecipe)
    const coverage = calculateProcessGraphCoverage(graph)
    expect(coverage).toMatchObject({ valid: true, ingredientCoverage: 1, actionCoverage: 1, percent: 100 })
    expect(getCriticalPath(graph).durationSeconds).toBe(600)
  })

  test('does not attach a graph when the server flag is off', () => {
    expect(isRecipeProcessGraphEnabled({})).toBe(false)
    expect(withRecipeProcessGraph(pastaRecipe, { enabled: false })).toBe(pastaRecipe)
  })

  test('attaches a validated graph and quality metadata can inspect it', () => {
    const result = withRecipeProcessGraph(pastaRecipe, { enabled: true })
    expect(result.processGraph).toBeTruthy()
    expect(result.graphConfidence).toBe('high')
    expect(result.graphValidation).toMatchObject({ valid: true, coverage: 100 })
    expect(isRecipeProcessGraphEnabled({ RECIPE_PROCESS_GRAPH_V1: 'true' })).toBe(true)
    expect(isRecipeProcessGraphEnabled({ RECIPE_PROCESS_GRAPH_ENABLED: true })).toBe(true)
    expect(isRecipeProcessGraphEnabled({ FEATURE_RECIPE_PROCESS_GRAPH_V1: 1 })).toBe(true)
  })

  test('keeps linear-only fallback when no usable process graph can be made', () => {
    const result = withRecipeProcessGraph({ name: 'Incomplete', ingredients: [], instructions: [] }, { enabled: true })
    expect(result.processGraph).toBeNull()
    expect(result.graphConfidence).toBe('low')
    expect(result.graphValidation.valid).toBe(false)
  })
})
