/**
 * Fixed-date holidays plus Thanksgiving, which is the fourth Thursday
 * in November and is not the same day every year.
 */

const FIXED_HOLIDAYS = [
  { month: 0, day: 1, name: "New Year's Day", range: 7 },
  { month: 1, day: 14, name: "Valentine's Day", range: 7 },
  { month: 3, day: 1, name: 'Easter', range: 7 }, // Approximate
  { month: 6, day: 4, name: 'Independence Day', range: 7 },
  { month: 9, day: 31, name: 'Halloween', range: 7 },
  { month: 11, day: 25, name: 'Christmas', range: 7 },
]

/** Fourth Thursday of November, local calendar date. */
export function thanksgivingDate(year) {
  const novemberFirst = new Date(year, 10, 1)
  const firstThursday = 1 + ((4 - novemberFirst.getDay() + 7) % 7)
  return new Date(year, 10, firstThursday + 21)
}

export function getUpcomingHoliday(date) {
  const dateObj = new Date(date)
  if (Number.isNaN(dateObj.getTime())) return null

  const thanksgiving = thanksgivingDate(dateObj.getFullYear())
  const holidays = [
    ...FIXED_HOLIDAYS,
    {
      month: thanksgiving.getMonth(),
      day: thanksgiving.getDate(),
      name: 'Thanksgiving',
      range: 7,
    },
  ]

  for (const holiday of holidays) {
    const holidayDate = new Date(dateObj.getFullYear(), holiday.month, holiday.day)
    const daysDiff = Math.abs((dateObj - holidayDate) / (1000 * 60 * 60 * 24))
    if (daysDiff <= holiday.range) return holiday.name
  }

  return null
}
