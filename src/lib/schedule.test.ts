import { describe, expect, it } from 'vitest'
import { courseEndFrom, shiftKey, today } from '@/lib/dates'
import { examplePrescriptions } from '@/lib/examples'
import {
  adherenceFor,
  courseStatus,
  dosesOn,
  doseHistory,
  groupMedicines,
  isDoseDay,
  lastDueDate,
  nextDueDate,
  nextOpenDate,
  scheduleHorizon,
  slotAction,
  slotTargets,
} from '@/lib/schedule'
import type { DoseOutcome } from '@/lib/schedule'
import type { Database, MedicineInput, MedicineRecord } from '@/types'

let seq = 0
function record(input: MedicineInput, overrides: Partial<MedicineRecord> = {}): MedicineRecord {
  seq += 1
  return {
    ...input,
    id: `rec-${seq}`,
    groupId: `grp-${seq}`,
    effectiveFrom: input.anchorDate,
    createdAt: '2025-09-01T00:00:00.000Z',
    ...overrides,
  }
}

function db(medicines: MedicineRecord[], log: Database['log'] = {}): Database {
  return { version: 1, medicines, log }
}

function dosesFor(m: MedicineRecord) {
  return doseHistory(groupMedicines([m])[0])
}

describe('course end is half open', () => {
  it('gives a 7 day daily course exactly 7 doses', () => {
    const m = record({
      name: 'Omeprazole 20MG',
      slots: ['before-breakfast'],
      repeatEveryDays: 1,
      anchorDate: '2025-09-01',
      durationValue: 7,
      durationUnit: 'days',
    })
    const dates = dosesFor(m).map((d) => d.date)
    expect(dates).toEqual([
      '2025-09-01',
      '2025-09-02',
      '2025-09-03',
      '2025-09-04',
      '2025-09-05',
      '2025-09-06',
      '2025-09-07',
    ])
    expect(isDoseDay(m, '2025-09-08')).toBe(false)
  })

  it('gives a 5 week weekly course 5 doses, not 6', () => {
    const m = record({
      name: 'Vitamin B12',
      slots: ['anytime'],
      repeatEveryDays: 7,
      anchorDate: '2025-09-01',
      durationValue: 5,
      durationUnit: 'weeks',
    })
    expect(dosesFor(m).map((d) => d.date)).toEqual([
      '2025-09-01',
      '2025-09-08',
      '2025-09-15',
      '2025-09-22',
      '2025-09-29',
    ])
    expect(courseEndFrom('2025-09-01', 5, 'weeks')).toBe('2025-10-06')
  })

  it('gives an 8 week weekly course 8 doses', () => {
    const m = record({
      name: 'Vitamin D3 60000',
      slots: ['anytime'],
      repeatEveryDays: 7,
      anchorDate: '2025-09-01',
      durationValue: 8,
      durationUnit: 'weeks',
    })
    expect(dosesFor(m)).toHaveLength(8)
  })
})

describe('slots multiply the doses on a day', () => {
  it('emits one dose per slot per dose day, in slot order', () => {
    const m = record({
      name: 'Paracetamol 500MG or Crocin',
      slots: ['after-dinner', 'after-breakfast'],
      repeatEveryDays: 1,
      anchorDate: '2025-09-01',
      durationValue: 7,
      durationUnit: 'days',
    })
    const doses = dosesFor(m)
    expect(doses).toHaveLength(14)
    expect(doses.slice(0, 2)).toEqual([
      { date: '2025-09-01', slot: 'after-breakfast' },
      { date: '2025-09-01', slot: 'after-dinner' },
    ])
  })
})

describe('a weekly medicine holds its weekday', () => {
  it('only falls on the anchor weekday', () => {
    const m = record({
      name: 'Vitamin B12',
      slots: ['anytime'],
      repeatEveryDays: 7,
      anchorDate: '2025-09-01',
      durationValue: 5,
      durationUnit: 'weeks',
    })
    expect(isDoseDay(m, '2025-09-08')).toBe(true)
    expect(isDoseDay(m, '2025-09-09')).toBe(false)
    expect(nextDueDate(groupMedicines([m])[0], '2025-09-09')).toBe('2025-09-15')
  })
})

describe('editing forks a version and leaves the past alone', () => {
  const groupId = 'grp-shared'
  const base: MedicineInput = {
    name: 'Calcium with D3',
    slots: ['after-breakfast'],
    repeatEveryDays: 1,
    anchorDate: '2025-09-01',
    durationValue: 30,
    durationUnit: 'days',
  }
  const v1 = record(base, { id: 'v1', groupId, effectiveFrom: '2025-09-01', closedOn: '2025-09-05' })
  const v2 = record({ ...base, slots: ['after-dinner'] }, {
    id: 'v2',
    groupId,
    effectiveFrom: '2025-09-05',
  })
  const group = groupMedicines([v1, v2])[0]

  it('reads the old slot before the edit', () => {
    const doses = dosesOn(db([v1, v2]), '2025-09-04', '2025-09-10')
    expect(doses.map((d) => d.slot)).toEqual(['after-breakfast'])
  })

  it('reads the new slot from the edit onward', () => {
    const doses = dosesOn(db([v1, v2]), '2025-09-05', '2025-09-10')
    expect(doses.map((d) => d.slot)).toEqual(['after-dinner'])
  })

  it('never double counts the handover day', () => {
    const onHandover = doseHistory(group).filter((d) => d.date === '2025-09-05')
    expect(onHandover).toHaveLength(1)
  })

  it('keeps the original course length across the fork', () => {
    expect(doseHistory(group)).toHaveLength(30)
  })
})

describe('missed is derived, never stored', () => {
  const m = record({
    name: 'Magnesium 250MG',
    slots: ['after-dinner'],
    repeatEveryDays: 1,
    anchorDate: '2025-09-01',
    durationValue: 3,
    durationUnit: 'days',
  })
  const log = {
    [`${m.groupId}|2025-09-01|after-dinner`]: {
      groupId: m.groupId,
      date: '2025-09-01',
      slot: 'after-dinner' as const,
      state: 'taken' as const,
      at: '2025-09-01T21:00:00.000Z',
      name: 'Magnesium 250MG',
    },
    [`${m.groupId}|2025-09-02|after-dinner`]: {
      groupId: m.groupId,
      date: '2025-09-02',
      slot: 'after-dinner' as const,
      state: 'skipped' as const,
      at: '2025-09-02T21:00:00.000Z',
      name: 'Magnesium 250MG',
    },
  }

  it('counts an unlogged past day as missed and today as pending', () => {
    const group = groupMedicines([m])[0]
    expect(adherenceFor(db([m], log), group, '2025-09-03')).toEqual({
      taken: 1,
      skipped: 1,
      missed: 0,
      pending: 1,
      total: 3,
    })
    expect(adherenceFor(db([m], log), group, '2025-09-04')).toEqual({
      taken: 1,
      skipped: 1,
      missed: 1,
      pending: 0,
      total: 3,
    })
  })

  it('marks an untouched past dose as missed on the day view', () => {
    const doses = dosesOn(db([m], log), '2025-09-03', '2025-09-04')
    expect(doses[0].outcome).toBe('missed')
  })
})

describe('course status', () => {
  const base: MedicineInput = {
    name: 'Cetirizine 10MG',
    slots: ['after-dinner'],
    repeatEveryDays: 1,
    anchorDate: '2025-09-01',
    durationValue: 21,
    durationUnit: 'days',
  }

  it('is upcoming before the start date', () => {
    expect(courseStatus(groupMedicines([record(base)])[0], '2025-08-30')).toBe('upcoming')
  })

  it('is active inside the course', () => {
    expect(courseStatus(groupMedicines([record(base)])[0], '2025-09-10')).toBe('active')
  })

  it('is finished once the course runs out', () => {
    expect(courseStatus(groupMedicines([record(base)])[0], '2025-09-22')).toBe('finished')
  })

  it('is stopped when closed before the course end', () => {
    const stopped = record(base, { closedOn: '2025-09-10', closedBy: 'stopped' })
    expect(courseStatus(groupMedicines([stopped])[0], '2025-09-12')).toBe('stopped')
  })

  it('is finished when the stop landed on the day it was going to end anyway', () => {
    const stopped = record(base, { closedOn: '2025-09-22', closedBy: 'stopped' })
    expect(courseStatus(groupMedicines([stopped])[0], '2025-09-23')).toBe('finished')
  })

  it('never reports a superseded version as the state of the course', () => {
    const groupId = 'grp-forked'
    const first = record(base, { groupId, closedOn: '2025-09-10', closedBy: 'superseded' })
    const second = record({ ...base, slots: ['after-breakfast'] }, { groupId, effectiveFrom: '2025-09-10' })
    expect(courseStatus(groupMedicines([first, second])[0], '2025-09-12')).toBe('active')
  })

  it('reads a database written before the two closures were named apart', () => {
    // Only a date, no reason. The reason is reconstructed from the shape: the
    // group's last version can only have been closed by a stop, because
    // superseding a version is what puts another one after it.
    const stopped = record(base, { closedOn: '2025-09-10' })
    expect(courseStatus(groupMedicines([stopped])[0], '2025-09-12')).toBe('stopped')

    const groupId = 'grp-legacy-fork'
    const first = record(base, { groupId, closedOn: '2025-09-10' })
    const second = record({ ...base, slots: ['after-breakfast'] }, { groupId, effectiveFrom: '2025-09-10' })
    expect(courseStatus(groupMedicines([first, second])[0], '2025-09-12')).toBe('active')
  })
})

describe('the real prescription', () => {
  const start = today()
  const medicines = examplePrescriptions(start).map((input) => record(input))

  it('puts the follow-up three days after its partner, every week', () => {
    const first = medicines.find((m) => m.name === 'Vitamin B12')!
    const follow = medicines.find((m) => m.name === 'Vitamin C 500MG')!
    const firstDates = dosesFor(first).map((d) => d.date)
    const followDates = dosesFor(follow).map((d) => d.date)
    expect(followDates).toEqual(firstDates.map((d) => shiftKey(d, 3)))
  })

  it('schedules 10 doses on day one and 8 on day two', () => {
    const state = db(medicines)
    // Day one carries the weekly medicines except Vitamin C, which has not started.
    expect(dosesOn(state, start, start)).toHaveLength(10)
    expect(dosesOn(state, shiftKey(start, 1), start)).toHaveLength(8)
  })

  it('brings Vitamin C in on day four and nothing else weekly', () => {
    const names = dosesOn(db(medicines), shiftKey(start, 3), start).map((d) => d.name)
    expect(names).toContain('Vitamin C 500MG')
    expect(names).not.toContain('Vitamin B12')
    expect(names).not.toContain('Vitamin D3 60000')
  })

  it('drops the 7 day medicines out of the list on day eight', () => {
    const names = dosesOn(db(medicines), shiftKey(start, 7), start).map((d) => d.name)
    expect(names).not.toContain('Omeprazole 20MG')
    expect(names).not.toContain('Paracetamol 500MG or Crocin')
  })
})

describe('the horizon of what is still to come', () => {
  const weekly: MedicineInput = {
    name: 'Vitamin D3 60000',
    slots: ['anytime'],
    repeatEveryDays: 7,
    anchorDate: '2025-09-01',
    durationValue: 5,
    durationUnit: 'weeks',
  }

  it('ends on the last dose day, not on the day the course window closes', () => {
    // The window is half open to 6 Oct, but the fifth and final dose is 29 Sep.
    const g = groupMedicines([record(weekly)])[0]
    expect(lastDueDate(g)).toBe('2025-09-29')
  })

  it('reaches the furthest dose of any course', () => {
    const short = record({ ...weekly, name: 'Omeprazole 20MG', repeatEveryDays: 1, durationValue: 7, durationUnit: 'days' })
    expect(scheduleHorizon(db([record(weekly), short]), '2025-09-01')).toBe('2025-09-29')
  })

  it('ignores a deleted medicine', () => {
    const gone = record(weekly, { deletedAt: '2025-09-02T00:00:00.000Z' })
    expect(scheduleHorizon(db([gone]), '2025-09-02')).toBe('2025-09-02')
  })

  it('never falls behind today, so the horizon is always a date you can reach', () => {
    const finished = record(weekly)
    expect(scheduleHorizon(db([finished]), '2026-01-01')).toBe('2026-01-01')
  })

  it('is today when there are no medicines at all', () => {
    expect(scheduleHorizon(db([]), '2025-09-01')).toBe('2025-09-01')
  })
})

describe('a dose already ticked is no longer due', () => {
  const m = record({
    name: 'Metformin 500MG',
    slots: ['after-breakfast', 'after-dinner'],
    repeatEveryDays: 1,
    anchorDate: '2025-09-01',
    durationValue: 3,
    durationUnit: 'days',
  })
  const group = groupMedicines([m])[0]

  function entry(date: string, slot: 'after-breakfast' | 'after-dinner', state: 'taken' | 'skipped') {
    return {
      [`${m.groupId}|${date}|${slot}`]: {
        groupId: m.groupId,
        date,
        slot,
        state,
        at: `${date}T09:00:00.000Z`,
        name: m.name,
      },
    }
  }

  it('still counts today while a slot is untouched', () => {
    const log = entry('2025-09-01', 'after-breakfast', 'taken')
    expect(nextOpenDate(db([m], log), group, '2025-09-01')).toBe('2025-09-01')
  })

  it('moves to tomorrow once every slot today is answered', () => {
    const log = { ...entry('2025-09-01', 'after-breakfast', 'taken'), ...entry('2025-09-01', 'after-dinner', 'taken') }
    expect(nextOpenDate(db([m], log), group, '2025-09-01')).toBe('2025-09-02')
    // The schedule itself has not moved; only what is left of it has.
    expect(nextDueDate(group, '2025-09-01')).toBe('2025-09-01')
  })

  it('treats a skip as answered, not as still owing', () => {
    const log = {
      ...entry('2025-09-01', 'after-breakfast', 'skipped'),
      ...entry('2025-09-01', 'after-dinner', 'skipped'),
    }
    expect(nextOpenDate(db([m], log), group, '2025-09-01')).toBe('2025-09-02')
  })

  it('runs out when the whole course has been answered', () => {
    const log = Object.assign(
      {},
      ...['2025-09-01', '2025-09-02', '2025-09-03'].flatMap((d) => [
        entry(d, 'after-breakfast', 'taken'),
        entry(d, 'after-dinner', 'taken'),
      ]),
    )
    expect(nextOpenDate(db([m], log), group, '2025-09-01')).toBeUndefined()
  })

  it('does not reach back for a dose missed before today', () => {
    expect(nextOpenDate(db([m]), group, '2025-09-02')).toBe('2025-09-02')
  })
})

describe('what a press on a whole slot does', () => {
  const morning: MedicineInput = {
    name: 'Metformin 500MG',
    slots: ['after-breakfast'],
    repeatEveryDays: 1,
    anchorDate: '2025-09-01',
    durationValue: 7,
    durationUnit: 'days',
  }

  /** A slot's worth of doses, one per outcome given. */
  function slot(...outcomes: DoseOutcome[]) {
    const records = outcomes.map((_, i) => record({ ...morning, name: `Medicine ${i}` }))
    const log: Database['log'] = {}
    for (const [i, outcome] of outcomes.entries()) {
      if (outcome !== 'taken' && outcome !== 'skipped') continue
      log[`${records[i].groupId}|2025-09-01|after-breakfast`] = {
        groupId: records[i].groupId,
        date: '2025-09-01',
        slot: 'after-breakfast',
        state: outcome,
        at: '2025-09-01T09:00:00.000Z',
        name: `Medicine ${i}`,
      }
    }
    return dosesOn(db(records, log), '2025-09-01', '2025-09-01')
  }

  it('offers nothing on a slot that is already one press', () => {
    expect(slotAction(slot('pending'))).toBeUndefined()
    expect(slotAction(slot('taken'))).toBeUndefined()
  })

  it('fills a slot with anything left open, and clears one that is full', () => {
    expect(slotAction(slot('pending', 'pending'))).toBe('fill')
    expect(slotAction(slot('taken', 'pending'))).toBe('fill')
    expect(slotAction(slot('taken', 'taken'))).toBe('clear')
  })

  it('keeps offering the fill once the slot holds a skip', () => {
    expect(slotAction(slot('skipped', 'pending'))).toBe('fill')
    expect(slotAction(slot('skipped', 'taken'))).toBe('fill')
  })

  it('writes only what a press is entitled to write', () => {
    const partly = slot('taken', 'skipped', 'pending')
    expect(slotTargets(partly, 'fill').map((d) => d.name)).toEqual(['Medicine 2'])

    const full = slot('taken', 'taken')
    expect(slotTargets(full, 'clear')).toHaveLength(2)
    expect(slotTargets(slot('taken', 'skipped'), 'clear').map((d) => d.name)).toEqual(['Medicine 0'])
  })

  it('fills a past day\u2019s missed doses rather than treating them as answered', () => {
    const records = [record(morning)]
    const doses = dosesOn(db(records), '2025-09-01', '2025-09-02')
    expect(doses[0].outcome).toBe('missed')
    expect(slotTargets(doses, 'fill')).toHaveLength(1)
  })
})
