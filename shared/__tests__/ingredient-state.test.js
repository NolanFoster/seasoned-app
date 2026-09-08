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
