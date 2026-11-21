import { describe, it, expect } from 'vitest'
import {
  detectStepAppliance,
  detectEquipmentConflicts,
  normalizeMultiDishSession,
} from '../multi-dish.js'

describe('multi-dish cooking orchestration helpers', () => {
  it('detects appliance usage in step instructions', () => {
    expect(detectStepAppliance('Bake casserole in oven at 375F for 25 mins.')).toContain('OVEN')
    expect(detectStepAppliance('Blend dressing in blender until smooth.')).toContain('BLENDER')
    expect(detectStepAppliance('Warm soup in the microwave for 2 minutes.')).toContain('MICROWAVE')
    expect(detectStepAppliance('Chop onions and garlic on cutting board.')).toEqual([])
  })

  it('detects oven and equipment conflicts between active recipes', () => {
    const activeSteps = [
      {
        recipeName: 'Roast Salmon',
        stepIndex: 1,
        stepText: 'Roast in the oven at 400F for 15 minutes.',
      },
      {
        recipeName: 'Garlic Bread',
        stepIndex: 2,
        stepText: 'Bake garlic bread in oven until golden and crisp.',
      },
    ]

    const conflicts = detectEquipmentConflicts(activeSteps)
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0].appliance).toBe('OVEN')
    expect(conflicts[0].recipes).toEqual(['Roast Salmon', 'Garlic Bread'])
    expect(conflicts[0].message).toContain('Both "Roast Salmon" and "Garlic Bread" need the oven')
  })

  it('returns empty conflicts when recipes use distinct appliances', () => {
    const activeSteps = [
      {
        recipeName: 'Roast Salmon',
        stepIndex: 1,
        stepText: 'Roast in the oven at 400F for 15 minutes.',
      },
      {
        recipeName: 'Mashed Potatoes',
        stepIndex: 1,
        stepText: 'Boil potatoes in a pot on the stovetop.',
      },
    ]

    const conflicts = detectEquipmentConflicts(activeSteps)
    expect(conflicts).toEqual([])
  })

  it('normalizes multi-dish sessions cleanly', () => {
    const session = normalizeMultiDishSession([
      { name: 'Dish A', instructions: ['Step 1'] },
      { name: 'Dish B', instructions: ['Step 1', 'Step 2'] },
    ])
    expect(session).toHaveLength(2)
    expect(session[0].id).toBe('dish-0')
    expect(session[1].id).toBe('dish-1')
  })
})
