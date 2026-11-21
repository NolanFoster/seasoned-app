import { describe, it, expect } from 'vitest'
import {
  parseProduceBoxLines,
  calculateBoxCoverageScore,
} from '../produce-box-intake.js'

describe('produce-box-intake helpers', () => {
  it('parses raw CSA box share lines and attaches storage tips and shelf life', () => {
    const raw = `
      - 1 bunch Garlic Scapes
      - Bok Choy
      - Heirloom Tomatoes
      - Kohlrabi
    `
    const items = parseProduceBoxLines(raw)
    expect(items).toHaveLength(4)
    expect(items[0].name).toBe('Garlic Scapes')
    expect(items[0].shelfLifeDays).toBe(10)
    expect(items[1].name).toBe('Bok Choy')
    expect(items[1].shelfLifeDays).toBe(5)
    expect(items[2].name).toBe('Heirloom Tomatoes')
    expect(items[2].storageTip).toContain('room temperature')
  })

  it('calculates box coverage score for a proposed recipe', () => {
    const boxItems = [
      { name: 'Garlic Scapes' },
      { name: 'Bok Choy' },
    ]

    const recipeWithBoxProduce = {
      name: 'Garlic Scape & Bok Choy Stir Fry',
      ingredients: ['1 bunch Bok Choy', '1/2 cup Garlic Scapes', '2 tbsp Soy sauce', '1 tbsp Sesame oil'],
    }

    const score = calculateBoxCoverageScore(recipeWithBoxProduce, boxItems)
    expect(score).toBe(50) // 2 of 4 ingredients match box produce
  })
})
