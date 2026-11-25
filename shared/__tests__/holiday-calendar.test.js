import { describe, it, expect } from 'vitest'
import { getUpcomingHoliday, thanksgivingDate } from '../holiday-calendar.js'

describe('thanksgivingDate', () => {
  it('is the fourth Thursday, not a fixed November 28', () => {
    expect(thanksgivingDate(2024).getDate()).toBe(28)
    expect(thanksgivingDate(2025).getDate()).toBe(27)
    expect(thanksgivingDate(2026).getDate()).toBe(26)
    expect(thanksgivingDate(2027).getDate()).toBe(25)
    expect(thanksgivingDate(2026).getDay()).toBe(4)
  })
})

describe('getUpcomingHoliday', () => {
  it('keeps the fixed holidays', () => {
    expect(getUpcomingHoliday('2024-12-25')).toBe('Christmas')
    expect(getUpcomingHoliday('2024-07-04')).toBe('Independence Day')
    expect(getUpcomingHoliday('2024-05-15')).toBeNull()
  })

  it('detects Thanksgiving 2026 on the real date, a week out', () => {
    expect(getUpcomingHoliday('2026-11-26')).toBe('Thanksgiving')
    expect(getUpcomingHoliday('2026-11-24')).toBe('Thanksgiving')
    expect(getUpcomingHoliday('2026-11-19')).toBe('Thanksgiving')
    expect(getUpcomingHoliday('2026-11-18')).toBeNull()
    expect(getUpcomingHoliday('2026-12-03')).toBe('Thanksgiving')
    expect(getUpcomingHoliday('2026-12-04')).toBeNull()
  })

  it('still matches the 2024 date the old approximation happened to get right', () => {
    expect(getUpcomingHoliday('2024-11-28')).toBe('Thanksgiving')
    expect(getUpcomingHoliday('2024-11-22')).toBe('Thanksgiving')
  })

  it('returns null for a date that cannot be parsed', () => {
    expect(getUpcomingHoliday('not-a-date')).toBeNull()
  })
})
