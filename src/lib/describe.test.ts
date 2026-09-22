import { describe, expect, it } from 'vitest'
import { describeLength, describeRepeat } from '@/lib/describe'
import { groupMedicines, logKey } from '@/lib/schedule'
import type { Database, MedicineRecord } from '@/types'

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

describe('describing how long', () => {
  const strip: MedicineRecord = {
    id: 'rec-1',
    groupId: 'grp-1',
    name: 'Amoxicillin 500MG',
    slots: ['after-breakfast'],
    repeatEveryDays: 1,
    anchorDate: '2025-09-01',
    durationValue: 10,
    durationUnit: 'doses',
    effectiveFrom: '2025-09-01',
    createdAt: '2025-09-01T00:00:00.000Z',
  }
  const group = groupMedicines([strip])[0]

  function state(log: Database['log'] = {}): Database {
    return { version: 1, medicines: [strip], log }
  }

  it('reads a course measured in calendar straight off the record', () => {
    const week = { ...strip, durationValue: 7, durationUnit: 'days' as const }
    expect(describeLength(state(), groupMedicines([week])[0], '2025-09-01')).toBe('7 days')
  })

  it('says the size of the strip, not the number of days it took', () => {
    expect(describeLength(state(), group, '2025-09-01')).toBe('10 doses')
    // One skipped, one taken, one missed and nine to come: twelve scheduled
    // days, and still a strip of ten.
    const log = {
      [logKey('grp-1', '2025-09-01', 'after-breakfast')]: {
        groupId: 'grp-1', date: '2025-09-01', slot: 'after-breakfast' as const, state: 'skipped' as const, at: '', name: '',
      },
      [logKey('grp-1', '2025-09-02', 'after-breakfast')]: {
        groupId: 'grp-1', date: '2025-09-02', slot: 'after-breakfast' as const, state: 'taken' as const, at: '', name: '',
      },
    }
    expect(describeLength(state(log), group, '2025-09-04')).toBe('10 doses')
  })
})
