import { describe, it, expect } from 'vitest'
import {
  createIngredientStateTracker,
  applyStepTransition,
  patchEntityState,
  validateAction,
  filterSalvageOptions,
  exportStateSnapshot,
  restoreStateSnapshot,
  normalizeEntityName,
} from '../ingredient-state.js'

describe('IngredientStateV1 Runtime Model', () => {
  it('normalizes entity names correctly', () => {
    expect(normalizeEntityName('2 cups diced yellow onions')).toBe('yellow onions')
    expect(normalizeEntityName('500g frozen chicken breast')).toBe('frozen chicken breast')
    expect(normalizeEntityName('1 tbsp of olive oil')).toBe('olive oil')
  })

  it('creates initial tracker from ingredients, steps, and equipment', () => {
    const tracker = createIngredientStateTracker({
      ingredients: [
        '1 large yellow onion, diced',
        '2 cloves garlic, minced',
        '400g frozen chicken breast',
      ],
      steps: [
        'Heat olive oil in a skillet.',
        'Sauté the onions until translucent.',
      ],
      equipment: ['skillet', 'chef knife'],
    })

    expect(tracker.version).toBe(1)
    expect(tracker.entities.length).toBeGreaterThanOrEqual(4)

    const onion = tracker.entities.find((e) => e.name.includes('onion'))
    expect(onion).toBeDefined()
    expect(onion.state).toBe('raw')
    expect(onion.type).toBe('ingredient')

    const chicken = tracker.entities.find((e) => e.name.includes('chicken'))
    expect(chicken).toBeDefined()
    expect(chicken.state).toBe('frozen')
    expect(chicken.location).toBe('freezer')

    const skillet = tracker.entities.find((e) => e.name.includes('skillet'))
    expect(skillet).toBeDefined()
    expect(skillet.type).toBe('tool')
    expect(skillet.state).toBe('clean')
  })

  it('applies step transitions deterministically based on culinary verbs', () => {
    let tracker = createIngredientStateTracker({
      ingredients: ['1 large onion', '400g chicken breast'],
      steps: ['Dice the onion on a cutting board.', 'Sauté the onion in a skillet until caramelized.'],
    })

    // Step 0: Dice the onion
    tracker = applyStepTransition(tracker, 0, 'Dice the onion on a cutting board.')
    let onion = tracker.entities.find((e) => e.name.includes('onion'))
    expect(onion.state).toBe('diced')
    expect(onion.location).toBe('board')
    expect(tracker.history.length).toBe(1)

    // Step 1: Caramelize onion
    tracker = applyStepTransition(tracker, 1, 'Sauté the onion in a skillet until caramelized.')
    onion = tracker.entities.find((e) => e.name.includes('onion'))
    expect(onion.state).toBe('caramelized')
    expect(onion.location).toBe('pan')
    expect(tracker.history.length).toBe(2)
  })

  it('detects newly formed intermediates during step transition', () => {
    let tracker = createIngredientStateTracker({
      ingredients: ['50g butter', '50g sugar', '2 eggs'],
      steps: ['Whisk butter and sugar into a butter-sugar mixture.', 'Whisk eggs into an egg mixture.'],
    })

    tracker = applyStepTransition(tracker, 0, 'Whisk butter and sugar into a butter-sugar mixture.')
    const intermediate = tracker.entities.find((e) => e.name === 'butter-sugar mixture')
    expect(intermediate).toBeDefined()
    expect(intermediate.type).toBe('intermediate')
    expect(intermediate.state).toBe('mixed')
    expect(intermediate.location).toBe('bowl')
  })

  it('supports manual state patching with source=user', () => {
    const tracker = createIngredientStateTracker({
      ingredients: ['1 onion'],
    })
    const onion = tracker.entities.find((e) => e.name.includes('onion'))

    const updated = patchEntityState(tracker, onion.id, {
      state: 'caramelized',
      location: 'pan',
    }, 'user')

    const updatedOnion = updated.entities.find((e) => e.id === onion.id)
    expect(updatedOnion.state).toBe('caramelized')
    expect(updatedOnion.location).toBe('pan')
    expect(updatedOnion.source).toBe('user')
    expect(updated.history.length).toBe(1)
  })

  describe('validateAction & Gating Rules', () => {
    it('warns with critical severity when searing frozen protein', () => {
      const tracker = createIngredientStateTracker({
        ingredients: ['500g frozen chicken breast'],
      })
      const result = validateAction(tracker, {
        action: 'sear',
        entity: 'frozen chicken breast',
      })

      expect(result.valid).toBe(false)
      expect(result.severity).toBe('critical')
      expect(result.warning).toContain('frozen')
    })

    it('soft-gates plating unreduced sauce', () => {
      let tracker = createIngredientStateTracker({
        ingredients: ['100ml red wine', '50g butter'],
      })
      tracker = applyStepTransition(tracker, 0, 'Simmer red wine in the pan to form sauce.')
      const result = validateAction(tracker, {
        action: 'plate',
        entity: 'sauce',
      })

      expect(result.valid).toBe(false)
      expect(result.severity).toBe('soft_gate')
      expect(result.warning).toContain('reduced')
    })

    it('passes validation when actions match valid states', () => {
      const tracker = createIngredientStateTracker({
        ingredients: ['500g chicken breast'],
      })
      const result = validateAction(tracker, {
        action: 'sear',
        entity: 'chicken breast',
      })

      expect(result.valid).toBe(true)
    })
  })

  describe('filterSalvageOptions', () => {
    it('filters out split sauce advice when no sauce/emulsion intermediate exists', () => {
      const tracker = createIngredientStateTracker({
        ingredients: ['1 head broccoli', '1 pinch salt'],
      })
      const options = [
        { id: 'split_sauce_fix', title: 'Fix Split Sauce with Warm Water' },
        { id: 'too_salty_fix', title: 'Add acid or potato for excess salt' },
      ]

      const filtered = filterSalvageOptions(options, tracker)
      expect(filtered.some((o) => o.id === 'split_sauce_fix')).toBe(false)
    })

    it('includes split sauce advice when emulsion or sauce exists', () => {
      let tracker = createIngredientStateTracker({
        ingredients: ['1 egg yolk', '100ml olive oil'],
      })
      tracker = applyStepTransition(tracker, 0, 'Whisk egg yolk and oil to form vinaigrette dressing.')

      const options = [
        { id: 'split_sauce_fix', title: 'Fix Split Sauce with Warm Water' },
      ]
      const filtered = filterSalvageOptions(options, tracker)
      expect(filtered.some((o) => o.id === 'split_sauce_fix')).toBe(true)
    })
  })

  describe('Snapshots & Serialization', () => {
    it('round-trips snapshots correctly', () => {
      const tracker = createIngredientStateTracker({
        ingredients: ['1 onion', '2 eggs'],
      })
      const snapshot = exportStateSnapshot(tracker)
      const restored = restoreStateSnapshot(snapshot)

      expect(restored.version).toBe(tracker.version)
      expect(restored.entities.length).toBe(tracker.entities.length)
      expect(restored.entities[0].name).toBe(tracker.entities[0].name)
    })
  })
})

describe('IngredientStateV1 branch coverage', () => {
  it('normalizes empty and non-string names to empty string', () => {
    expect(normalizeEntityName('')).toBe('')
    expect(normalizeEntityName(null)).toBe('')
    expect(normalizeEntityName(undefined)).toBe('')
    expect(normalizeEntityName(42)).toBe('')
  })

  it('uses recipe fallback and object-shaped ingredients', () => {
    const tracker = createIngredientStateTracker({
      recipe: {
        id: 'r1',
        ingredients: [
          { name: '1 cup chilled cream', quantity: 2 },
          { text: '2 tbsp olive oil', amount: 1 },
        ],
        instructions: ['Preheat the oven to 400F.'],
        equipment: ['oven'],
      },
    })
    expect(tracker.recipeId).toBe('r1')

    const cream = tracker.entities.find((e) => e.name.includes('cream'))
    expect(cream).toBeDefined()
    expect(cream.state).toBe('raw')
    expect(cream.location).toBe('fridge')
    expect(cream.quantityRemaining).toBe(2)

    const oil = tracker.entities.find((e) => e.name.includes('olive oil'))
    expect(oil.quantityRemaining).toBe(1)

    const oven = tracker.entities.find((e) => e.type === 'tool' && e.name.includes('oven'))
    expect(oven.location).toBe('oven')
  })

  it('deduplicates repeated ingredient names', () => {
    const tracker = createIngredientStateTracker({
      ingredients: ['1 onion', '2 onions'],
    })
    const onionEntities = tracker.entities.filter((e) => e.name === 'onion')
    expect(onionEntities).toHaveLength(1)
  })

  it('seeds intermediates from the process graph', () => {
    const tracker = createIngredientStateTracker({
      ingredients: [],
      processGraph: {
        intermediates: [
          { name: 'Roux', state: 'simmering', location: 'pan' },
          { name: null },
        ],
      },
    })
    const roux = tracker.entities.find((e) => e.name === 'roux')
    expect(roux.type).toBe('intermediate')
    expect(roux.state).toBe('simmering')
    expect(roux.location).toBe('pan')

    const unnamed = tracker.entities.find((e) => e.name === 'intermediate-2')
    expect(unnamed).toBeDefined()
    expect(unnamed.state).toBe('raw')
    expect(unnamed.location).toBe('bowl')
  })

  it('detects equipment from step text when none is provided', () => {
    const tracker = createIngredientStateTracker({
      ingredients: ['1 onion'],
      steps: ['Heat a skillet over medium heat.', 'Preheat the oven to 350F.'],
    })
    const skillet = tracker.entities.find((e) => e.type === 'tool' && e.name.includes('skillet'))
    expect(skillet).toBeDefined()
    const oven = tracker.entities.find((e) => e.type === 'tool' && e.name.includes('oven'))
    expect(oven).toBeDefined()
    expect(oven.location).toBe('oven')
  })

  it('returns invalid trackers unchanged from applyStepTransition', () => {
    expect(applyStepTransition(null, 0, 'Dice')).toBe(null)
    expect(applyStepTransition({}, 0, 'Dice')).toEqual({})
  })

  it('applies explicit graph transitions and defaults the source to step', () => {
    let tracker = createIngredientStateTracker({ ingredients: ['1 onion'] })
    const onion = tracker.entities.find((e) => e.name.includes('onion'))
    tracker = applyStepTransition(tracker, 0, {
      text: 'Cook the onion.',
      stateUpdates: [{ id: onion.id, state: 'caramelized', location: 'pan' }],
    })
    const updatedOnion = tracker.entities.find((e) => e.id === onion.id)
    expect(updatedOnion.state).toBe('caramelized')
    expect(updatedOnion.source).toBe('step')
  })

  it('records a no-op history entry when the transition is unchanged', () => {
    let tracker = createIngredientStateTracker({ ingredients: ['1 onion'] })
    tracker = applyStepTransition(tracker, 0, 'Dice the onion.')
    tracker = applyStepTransition(tracker, 0, 'Dice the onion.')
    expect(tracker.history).toHaveLength(2)
    expect(tracker.history[1].changes).toHaveLength(0)
  })

  it('covers the deterministic state verbs', () => {
    const cases = [
      ['Mince the onion.', 'minced', 'board'],
      ['Chop the onion.', 'chopped', 'board'],
      ['Slice the onion.', 'sliced', 'board'],
      ['Sear the onion.', 'seared', 'pan'],
      ['Saute the onion.', 'sautéed', 'pan'],
      ['Simmer the onion.', 'simmering', 'pot'],
      ['Boil the onion.', 'boiling', 'pot'],
      ['Reduce the onion.', 'reduced', 'pan'],
      ['Roast the onion.', 'roasted', 'oven'],
      ['Melt the onion.', 'melted', 'pan'],
      ['Rest the onion.', 'resting', 'board'],
      ['Plate the onion.', 'plated', 'plate'],
      ['Thaw the onion.', 'thawed', 'counter'],
    ]
    for (const [step, state, location] of cases) {
      const tracker = createIngredientStateTracker({ ingredients: ['1 onion'] })
      const updated = applyStepTransition(tracker, 0, step)
      const onion = updated.entities.find((e) => e.name.includes('onion'))
      expect(onion.state).toBe(state)
      expect(onion.location).toBe(location)
    }
  })

  it('keeps frozen ingredients frozen instead of auto-transitioning to hot states', () => {
    const tracker = createIngredientStateTracker({ ingredients: ['400g frozen chicken'] })
    const updated = applyStepTransition(tracker, 0, 'Sear the frozen chicken.')
    const chicken = updated.entities.find((e) => e.name.includes('chicken'))
    expect(chicken.state).toBe('frozen')
  })

  it('transitions tools on preheat and in-use cues', () => {
    const tracker = createIngredientStateTracker({
      ingredients: ['1 onion'],
      equipment: ['skillet'],
    })
    let updated = applyStepTransition(tracker, 0, 'Preheat the skillet.')
    let skillet = updated.entities.find((e) => e.type === 'tool' && e.name.includes('skillet'))
    expect(skillet.state).toBe('preheating')

    updated = applyStepTransition(tracker, 0, 'Cook in the skillet.')
    skillet = updated.entities.find((e) => e.type === 'tool' && e.name.includes('skillet'))
    expect(skillet.state).toBe('in-use')
  })

  it('detects a variety of intermediates from step text', () => {
    const cases = [
      ['Whisk the eggs into an egg mixture.', 'egg mixture', 'whisked'],
      ['Whisk flour and butter into a roux.', 'roux', 'simmering'],
      ['Simmer until the sauce is reduced.', 'sauce', 'reduced'],
      ['Mix into a batter.', 'batter', 'mixed'],
      ['Knead the dough.', 'dough', 'mixed'],
      ['Make a marinade.', 'marinade', 'mixed'],
    ]
    for (const [step, name, state] of cases) {
      const tracker = createIngredientStateTracker({ ingredients: [] })
      const updated = applyStepTransition(tracker, 0, step)
      const intermediate = updated.entities.find((e) => e.name === name)
      expect(intermediate).toBeDefined()
      expect(intermediate.state).toBe(state)
    }
  })

  it('returns invalid trackers unchanged from patchEntityState', () => {
    expect(patchEntityState(null, 'x', {})).toBe(null)
  })

  it('patches location and quantity independently', () => {
    const tracker = createIngredientStateTracker({ ingredients: ['1 onion'] })
    const onion = tracker.entities.find((e) => e.name.includes('onion'))

    let updated = patchEntityState(tracker, onion.id, { location: 'plate' })
    let patched = updated.entities.find((e) => e.id === onion.id)
    expect(patched.location).toBe('plate')
    expect(patched.state).toBe('raw')

    updated = patchEntityState(tracker, onion.id, { quantityRemaining: 0.5 })
    patched = updated.entities.find((e) => e.id === onion.id)
    expect(patched.quantityRemaining).toBe(0.5)
  })

  it('records no history when patching an unknown entity id', () => {
    const tracker = createIngredientStateTracker({ ingredients: ['1 onion'] })
    const updated = patchEntityState(tracker, 'nonexistent', { state: 'diced' })
    expect(updated.history).toHaveLength(0)
  })

  it('returns valid for invalid trackers and scans for frozen entities', () => {
    expect(validateAction(null, { action: 'sear' })).toEqual({ valid: true })

    const frozenTracker = createIngredientStateTracker({ ingredients: ['500g frozen chicken'] })
    let result = validateAction(frozenTracker, { action: 'sear', entity: 'nonexistent' })
    expect(result.valid).toBe(false)
    expect(result.severity).toBe('critical')

    const normalTracker = createIngredientStateTracker({ ingredients: ['500g chicken'] })
    result = validateAction(normalTracker, { action: 'sear', entity: 'nonexistent' })
    expect(result.valid).toBe(true)
  })

  it('matches entities by id and by substring', () => {
    let tracker = createIngredientStateTracker({ ingredients: ['400g chicken'] })
    tracker = applyStepTransition(tracker, 0, 'Sear the chicken.')
    const chicken = tracker.entities.find((e) => e.name.includes('chicken'))
    expect(chicken.state).toBe('seared')

    let result = validateAction(tracker, { action: 'slice', entity: chicken.id })
    expect(result.valid).toBe(false)
    expect(result.severity).toBe('info')

    result = validateAction(tracker, { action: 'slice', entity: 'the chicken' })
    expect(result.valid).toBe(false)
    expect(result.severity).toBe('info')
  })

  it('soft-gates plating a raw sauce', () => {
    const tracker = createIngredientStateTracker({
      ingredients: [],
      processGraph: { intermediates: [{ name: 'sauce', state: 'raw' }] },
    })
    const result = validateAction(tracker, { action: 'plate', entity: 'sauce' })
    expect(result.valid).toBe(false)
    expect(result.severity).toBe('soft_gate')
  })

  it('returns non-array salvage options unchanged', () => {
    const tracker = createIngredientStateTracker({ ingredients: ['1 onion'] })
    expect(filterSalvageOptions(null, tracker)).toBeNull()
    expect(filterSalvageOptions([], null)).toEqual([])
  })

  it('keeps salty fixes when cooked items exist and filters broken emulsions otherwise', () => {
    let tracker = createIngredientStateTracker({ ingredients: ['1 chicken'] })
    tracker = applyStepTransition(tracker, 0, 'Sear the chicken.')

    const salty = filterSalvageOptions([{ id: 'too_salty_fix', title: 'Add acid' }], tracker)
    expect(salty).toHaveLength(1)

    const broken = filterSalvageOptions([{ id: 'broken_emulsion_fix', title: 'Fix' }], tracker)
    expect(broken).toHaveLength(0)
  })

  it('exports null for a missing snapshot and restores invalid states safely', () => {
    expect(exportStateSnapshot(null)).toBeNull()

    const restored = restoreStateSnapshot(null)
    expect(restored.version).toBe(1)
    expect(restored.entities).toEqual([])

    const fixed = restoreStateSnapshot({
      entities: [
        { name: 'x', type: 'ingredient', state: 'not_a_real_state', location: 'mars' },
        { name: 'y', type: 'ingredient', location: 'elsewhere' },
      ],
      history: null,
    })
    expect(fixed.entities[0].state).toBe('not_a_real_state')
    expect(fixed.entities[0].location).toBe('counter')
    expect(fixed.entities[1].state).toBe('raw')
    expect(fixed.entities[1].location).toBe('counter')
    expect(fixed.history).toEqual([])
  })
})
