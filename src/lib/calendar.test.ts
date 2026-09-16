import { describe, expect, it } from 'vitest'
import { clampMonth, courseFill, dayFill, dayOpens, formatMonth, monthCells, monthEnd, shiftMonth } from '@/lib/calendar'
import type { Adherence, DayTally } from '@/lib/schedule'

function tally(t: Partial<DayTally>): DayTally {
  const full = { taken: 0, skipped: 0, missed: 0, pending: 0, ...t }
  return { scheduled: full.taken + full.skipped + full.missed + full.pending, ...full }
}

describe('laying out a month', () => {
  it('puts the 1st under its weekday, Monday first', () => {
    // September 2025 starts on a Monday; October on a Wednesday.
    expect(monthCells('2025-09').lead).toBe(0)
    expect(monthCells('2025-10').lead).toBe(2)
    // February 2026 starts on a Sunday, the last column.
    expect(monthCells('2026-02').lead).toBe(6)
    expect(monthCells('2026-02').days).toHaveLength(28)
  })

  it('walks months across a year end', () => {
    expect(shiftMonth('2025-12', 1)).toBe('2026-01')
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
    expect(monthEnd('2025-12')).toBe('2026-01-01')
    expect(formatMonth('2026-09')).toBe('September 2026')
    expect(clampMonth('2026-09', '2025-01', '2026-03')).toBe('2026-03')
  })
})

describe('how full a day draws', () => {
  it('steps by how much of what was answered was taken', () => {
    expect(dayFill(tally({ taken: 4 }))).toBe('full')
    expect(dayFill(tally({ taken: 3, missed: 1 }))).toBe('high')
    expect(dayFill(tally({ taken: 2, missed: 2 }))).toBe('high')
    expect(dayFill(tally({ taken: 1, missed: 3 }))).toBe('low')
    expect(dayFill(tally({ missed: 2 }))).toBe('missed')
  })

  it('leaves skips and pending doses out of the reckoning', () => {
    expect(dayFill(tally({ taken: 2, skipped: 2 }))).toBe('full')
    expect(dayFill(tally({ taken: 1, pending: 5 }))).toBe('full')
    expect(dayFill(tally({ skipped: 1 }))).toBe('skipped')
    expect(dayFill(tally({ pending: 3 }))).toBe('pending')
    expect(dayFill(tally({}))).toBe('none')
  })

  it('opens only a day with something behind it', () => {
    expect(dayOpens(undefined)).toBe(false)
    expect(dayOpens(tally({ pending: 2 }))).toBe(false)
    expect(dayOpens(tally({ taken: 1, pending: 1 }))).toBe(true)
    expect(dayOpens(tally({ missed: 1 }))).toBe(true)
  })
})

describe('a whole course read as one pocket', () => {
  function course(a: Partial<Adherence>): Adherence {
    const full = { taken: 0, skipped: 0, missed: 0, pending: 0, ...a }
    return { total: full.taken + full.skipped + full.missed + full.pending, ...full }
  }

  it('reads a course the same way it reads a day', () => {
    expect(courseFill(course({ taken: 20 }))).toBe('full')
    expect(courseFill(course({ taken: 18, missed: 2 }))).toBe('high')
    expect(courseFill(course({ taken: 4, missed: 16 }))).toBe('low')
    expect(courseFill(course({ missed: 6 }))).toBe('missed')
  })

  // The bulk of a long course is still to come, and a card that paled for
  // months because most of the doses were in the future would say nothing.
  it('judges a course on what has been answered, not on what is left', () => {
    expect(courseFill(course({ taken: 3, pending: 87 }))).toBe('full')
    expect(courseFill(course({ pending: 90 }))).toBe('pending')
    expect(courseFill(course({ skipped: 2, pending: 88 }))).toBe('skipped')
  })
})
