import { describe, expect, it } from 'vitest'
import { shiftKey, today } from '@/lib/dates'
import { courseActions } from '@/lib/actions'
import { groupMedicines } from '@/lib/schedule'
import type { MedicineRecord } from '@/types'

const now = today()

let seq = 0
function group(overrides: Partial<MedicineRecord> = {}) {
  seq += 1
  const record: MedicineRecord = {
    id: `rec-${seq}`,
    groupId: `grp-${seq}`,
    name: 'Amoxicillin 500MG',
    slots: ['after-breakfast'],
    repeatEveryDays: 1,
    anchorDate: shiftKey(now, -13),
    durationValue: 21,
    durationUnit: 'days',
    effectiveFrom: shiftKey(now, -13),
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
  return groupMedicines([record])[0]
}

describe('what a card offers', () => {
  it('offers both ways out of a course that is under way', () => {
    expect(courseActions(group(), now)).toEqual(['edit', 'finish', 'stop', 'delete'])
  })

  it('offers only Stop before the course has started', () => {
    const upcoming = { anchorDate: shiftKey(now, 3), effectiveFrom: shiftKey(now, 3) }
    expect(courseActions(group(upcoming), now)).toEqual(['edit', 'stop', 'delete'])
  })

  it('offers Start again rather than Resume on a course that was finished early', () => {
    const finished = { closedOn: shiftKey(now, 1), closedBy: 'completed' as const }
    expect(courseActions(group(finished), now)).toEqual(['restart', 'delete'])
  })

  it('still offers Resume on a course that was stopped with days left', () => {
    const stopped = { closedOn: now, closedBy: 'stopped' as const }
    expect(courseActions(group(stopped), now)).toEqual(['resume', 'delete'])
  })

  it('takes a deleted medicine off the board entirely', () => {
    expect(courseActions(group({ deletedAt: '2026-01-02T00:00:00.000Z' }), now)).toEqual([
      'restore',
      'purge',
    ])
  })
})
