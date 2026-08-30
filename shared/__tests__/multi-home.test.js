import { describe, it, expect } from 'vitest'
import {
  resolveActiveHomeForDate,
  filterPantryByHome,
} from '../multi-home.js'

describe('multi-home helpers', () => {
  it('resolves active home according to custody calendar date ranges', () => {
    const rules = [
      { startDate: '2026-09-01', endDate: '2026-09-07', homeId: 'home-moms' },
      { startDate: '2026-09-08', endDate: '2026-09-14', homeId: 'home-dads' },
    ]

    expect(resolveActiveHomeForDate('2026-09-03', rules)).toBe('home-moms')
    expect(resolveActiveHomeForDate('2026-09-10', rules)).toBe('home-dads')
    expect(resolveActiveHomeForDate('2026-09-20', rules, 'home-primary')).toBe('home-primary')
  })

  it('partitions pantry inventory avoiding cross-home leakage', () => {
    const items = [
      { id: '1', name: 'Oat Milk', homeId: 'home-moms' },
      { id: '2', name: 'Almond Butter', homeId: 'home-dads' },
      { id: '3', name: 'Brown Rice', homeId: 'home-moms' },
    ]

    const momsPantry = filterPantryByHome(items, 'home-moms')
    expect(momsPantry).toHaveLength(2)
    expect(momsPantry.map(i => i.name)).toEqual(['Oat Milk', 'Brown Rice'])

    const dadsPantry = filterPantryByHome(items, 'home-dads')
    expect(dadsPantry).toHaveLength(1)
    expect(dadsPantry[0].name).toBe('Almond Butter')
  })
})
