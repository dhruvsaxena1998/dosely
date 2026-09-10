import { describe, expect, it } from 'vitest'
import { describeRepeat } from '@/lib/describe'

describe('describing how often', () => {
  it('keeps the old words for the old shapes', () => {
    expect(describeRepeat({ repeatEveryDays: 1 })).toBe('Daily')
    expect(describeRepeat({ repeatEveryDays: 7 })).toBe('Weekly')
    expect(describeRepeat({ repeatEveryDays: 3 })).toBe('Every 3 days')
  })

  it('names a set of days by its shape before its members', () => {
    expect(describeRepeat({ repeatEveryDays: 1, weekdays: [1, 2, 3, 4, 5, 6, 7] })).toBe('Daily')
    expect(describeRepeat({ repeatEveryDays: 1, weekdays: [1, 2, 3, 4, 5] })).toBe('Weekdays')
    expect(describeRepeat({ repeatEveryDays: 1, weekdays: [6, 7] })).toBe('Weekends')
    expect(describeRepeat({ repeatEveryDays: 1, weekdays: [1, 3, 4, 5, 6, 7] })).toBe('Daily except Tue')
    expect(describeRepeat({ repeatEveryDays: 1, weekdays: [2] })).toBe('Tuesdays')
    expect(describeRepeat({ repeatEveryDays: 1, weekdays: [5, 1, 3] })).toBe('Mon, Wed and Fri')
  })
})
