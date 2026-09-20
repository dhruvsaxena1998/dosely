import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, type ReminderSettings } from '@/lib/reminder-settings'
import { plannedReminders, reconcile, reminderId, type Ledger } from '@/lib/reminders'
import { logKey } from '@/lib/schedule'
import type { Database, DoseState, MedicineInput, MedicineRecord } from '@/types'

/**
 * A fixed clock, so nothing here needs fake timers. 09:00 is after the 3am
 * rollover, so `today(NOW)` is the 22nd, and the morning slots have already
 * been and gone.
 */
const NOW = new Date('2026-09-22T09:00:00')

const settings: ReminderSettings = {
  ...DEFAULT_SETTINGS,
  enabled: true,
  topic: 'dosely-testtopic1234',
}

let seq = 0
function record(input: MedicineInput, overrides: Partial<MedicineRecord> = {}): MedicineRecord {
  seq += 1
  return {
    ...input,
    id: `rec-${seq}`,
    groupId: `grp-${seq}`,
    effectiveFrom: input.anchorDate,
    createdAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  }
}

function db(medicines: MedicineRecord[], log: Database['log'] = {}): Database {
  return { version: 1, medicines, log }
}

/** A daily course running across the whole window, unless told otherwise. */
function daily(name: string, slots: MedicineInput['slots'], overrides: Partial<MedicineRecord> = {}) {
  return record(
    { name, slots, repeatEveryDays: 1, anchorDate: '2026-09-20', durationValue: 30, durationUnit: 'days' },
    overrides,
  )
}

function logged(m: MedicineRecord, date: string, slot: string, state: DoseState): Database['log'] {
  const key = logKey(m.groupId, date, slot as never)
  return { [key]: { groupId: m.groupId, date, slot: slot as never, state, at: NOW.toISOString(), name: m.name } }
}

function planned(database: Database, over: Partial<ReminderSettings> = {}) {
  return plannedReminders(database, { ...settings, ...over }, NOW)
}

describe('what should be scheduled', () => {
  it('books one reminder for a slot with a dose still pending', () => {
    const reminders = planned(db([daily('Metformin', ['after-lunch'])]))
    // The 22nd, 23rd and 24th. The 25th's 13:30 is beyond a window opened at
    // 09:00 three days earlier, which is the ceiling doing its job.
    expect(reminders).toHaveLength(3)
    expect(reminders[0]).toMatchObject({ id: 'd2026-09-22-after-lunch', title: 'After lunch', body: '1 dose due' })
  })

  // Four things after breakfast is one act, so it is one notification. The whole
  // app already works in slots; the reminders have no business inventing a
  // different unit.
  it('books one reminder for the slot, not one per medicine', () => {
    const reminders = planned(
      db([daily('Metformin', ['after-lunch']), daily('Amoxicillin', ['after-lunch'])]),
    )
    const today = reminders.filter((r) => r.id.startsWith('d2026-09-22'))
    expect(today).toHaveLength(1)
    expect(today[0].body).toBe('2 doses due')
  })

  it('books nothing for a slot that has been ticked', () => {
    const m = daily('Metformin', ['after-lunch'])
    const reminders = planned(db([m], logged(m, '2026-09-22', 'after-lunch', 'taken')))
    expect(reminders.map((r) => r.id)).not.toContain('d2026-09-22-after-lunch')
  })

  it('books nothing for a slot that was deliberately skipped, because a skip is a decision', () => {
    const m = daily('Metformin', ['after-lunch'])
    const reminders = planned(db([m], logged(m, '2026-09-22', 'after-lunch', 'skipped')))
    expect(reminders.map((r) => r.id)).not.toContain('d2026-09-22-after-lunch')
  })

  it('still books the slot when only some of it is answered', () => {
    const a = daily('Metformin', ['after-lunch'])
    const b = daily('Amoxicillin', ['after-lunch'])
    const reminders = planned(db([a, b], logged(a, '2026-09-22', 'after-lunch', 'taken')))
    const today = reminders.filter((r) => r.id === 'd2026-09-22-after-lunch')
    expect(today[0].body).toBe('1 dose due')
  })

  it('books nothing for a course that was stopped', () => {
    const m = daily('Metformin', ['after-lunch'], { closedOn: '2026-09-21', closedBy: 'stopped' })
    expect(planned(db([m]))).toHaveLength(0)
  })

  it('books nothing for a course that was deleted', () => {
    const m = daily('Metformin', ['after-lunch'], { deletedAt: '2026-09-21T10:00:00.000Z' })
    expect(planned(db([m]))).toHaveLength(0)
  })

  it('books nothing for a course that has already run out', () => {
    const m = record({
      name: 'Amoxicillin',
      slots: ['after-lunch'],
      repeatEveryDays: 1,
      anchorDate: '2026-09-10',
      durationValue: 5,
      durationUnit: 'days',
    })
    expect(planned(db([m]))).toHaveLength(0)
  })

  it('books nothing for a course that has not started yet', () => {
    const m = record({
      name: 'Amoxicillin',
      slots: ['after-lunch'],
      repeatEveryDays: 1,
      anchorDate: '2026-10-01',
      durationValue: 5,
      durationUnit: 'days',
    })
    expect(planned(db([m]))).toHaveLength(0)
  })

  it('follows the prescription rather than the calendar for a weekly course', () => {
    // Anchored on the 22nd, so the next dose day inside the window is the 29th.
    const m = record({
      name: 'Methotrexate',
      slots: ['after-dinner'],
      repeatEveryDays: 7,
      anchorDate: '2026-09-22',
      durationValue: 8,
      durationUnit: 'weeks',
    })
    expect(planned(db([m])).map((r) => r.id)).toEqual(['d2026-09-22-after-dinner'])
  })

  // A course counted in doses ends when it has scheduled its number rather than
  // on a date, so the window has to stop with it.
  it('stops with a course counted in doses once it has run out of them', () => {
    const m = record({
      name: 'Physio',
      slots: ['after-lunch'],
      repeatEveryDays: 1,
      anchorDate: '2026-09-22',
      durationValue: 2,
      durationUnit: 'doses',
    })
    expect(planned(db([m])).map((r) => r.id)).toEqual([
      'd2026-09-22-after-lunch',
      'd2026-09-23-after-lunch',
    ])
  })

  it('books nothing at all while reminders are switched off', () => {
    expect(planned(db([daily('Metformin', ['after-lunch'])]), { enabled: false })).toHaveLength(0)
  })

  it('books nothing before a topic exists to book it against', () => {
    expect(planned(db([daily('Metformin', ['after-lunch'])]), { topic: '' })).toHaveLength(0)
  })
})

describe('the edges of the window', () => {
  it('leaves behind a slot whose time has already passed today', () => {
    // 07:30 by default, and it is 09:00.
    const reminders = planned(db([daily('Thyroxine', ['before-breakfast'])]))
    expect(reminders.map((r) => r.id)).not.toContain('d2026-09-22-before-breakfast')
    expect(reminders.map((r) => r.id)).toContain('d2026-09-23-before-breakfast')
  })

  it('refuses a slot landing inside the ten seconds ntfy will not take', () => {
    const database = db([daily('Metformin', ['after-breakfast'])])
    const justBefore = plannedReminders(database, settings, new Date('2026-09-22T08:29:55'))
    expect(justBefore.map((r) => r.id)).not.toContain('d2026-09-22-after-breakfast')
  })

  it('takes a slot that is comfortably outside that floor', () => {
    const database = db([daily('Metformin', ['after-breakfast'])])
    const earlier = plannedReminders(database, settings, new Date('2026-09-22T08:00:00'))
    expect(earlier.map((r) => r.id)).toContain('d2026-09-22-after-breakfast')
  })

  // The third day out still has an evening in it, which is nearly four days
  // away. A day count alone would book it and the server would refuse.
  it('stops at three days as an instant, not as a day count', () => {
    const reminders = planned(db([daily('Thyroxine', ['before-breakfast', 'after-dinner'])]))
    const ids = reminders.map((r) => r.id)
    expect(ids).toContain('d2026-09-25-before-breakfast')
    expect(ids).not.toContain('d2026-09-25-after-dinner')
  })

  it('never books anything further out than the window', () => {
    const reminders = planned(db([daily('Metformin', ['after-lunch'])]))
    const ceiling = NOW.getTime() + 3 * 24 * 60 * 60 * 1000
    expect(reminders.every((r) => new Date(r.at).getTime() <= ceiling)).toBe(true)
  })
})

describe('what a reminder says', () => {
  it('counts, and pluralises the count', () => {
    const one = planned(db([daily('Metformin', ['after-lunch'])]))
    expect(one[0].body).toBe('1 dose due')
    const three = planned(
      db([
        daily('Metformin', ['after-lunch']),
        daily('Amoxicillin', ['after-lunch']),
        daily('Calcium', ['after-lunch']),
      ]),
    )
    expect(three[0].body).toBe('3 doses due')
  })

  it('names nothing unless it is asked to, because the topic is the only lock', () => {
    const reminders = planned(db([daily('Metformin', ['after-lunch'])]))
    expect(reminders[0].body).not.toContain('Metformin')
  })

  it('names the medicines once it is asked to', () => {
    const reminders = planned(
      db([daily('Metformin', ['after-lunch']), daily('Amoxicillin', ['after-lunch'])]),
      { includeNames: true },
    )
    // Slot order then name order, the same order the Today screen lists them in.
    expect(reminders[0].body).toBe('Amoxicillin, Metformin')
  })

  it('uses the name the version owning that day carries', () => {
    const old = daily('Metformin', ['after-lunch'], {
      groupId: 'shared',
      closedOn: '2026-09-22',
      closedBy: 'superseded',
    })
    const current = daily('Metformin 500', ['after-lunch'], {
      groupId: 'shared',
      effectiveFrom: '2026-09-22',
    })
    const reminders = planned(db([old, current]), { includeNames: true })
    expect(reminders[0].body).toBe('Metformin 500')
  })

  it('titles the reminder with the slot', () => {
    const reminders = planned(db([daily('Metformin', ['before-dinner'])]))
    expect(reminders[0].title).toBe('Before dinner')
  })
})

describe('the address', () => {
  it('is one slot on one day', () => {
    expect(reminderId('2026-09-22', 'after-lunch')).toBe('d2026-09-22-after-lunch')
  })

  it('is the same on two runs over the same state, or nothing else here works', () => {
    const database = db([daily('Metformin', ['after-lunch'])])
    expect(planned(database).map((r) => r.id)).toEqual(planned(database).map((r) => r.id))
  })
})

describe('the difference between wanted and booked', () => {
  const reminder = { id: 'd2026-09-22-after-lunch', at: '2026-09-22T13:30:00.000Z', title: 'After lunch', body: '2 doses due' }
  const booked: Ledger = { [reminder.id]: { at: reminder.at, body: reminder.body } }

  // The property that keeps this inside ntfy.sh's daily allowance: opening the
  // app when nothing has changed must cost nothing at all.
  it('sends nothing when nothing has changed', () => {
    const { publish, cancel, drop } = reconcile([reminder], booked, NOW)
    expect(publish).toHaveLength(0)
    expect(cancel).toHaveLength(0)
    expect(drop).toHaveLength(0)
  })

  it('republishes the same address when the count changed', () => {
    const grown = { ...reminder, body: '4 doses due' }
    const { publish, cancel } = reconcile([grown], booked, NOW)
    expect(publish).toEqual([grown])
    expect(cancel).toHaveLength(0)
  })

  it('republishes when the slot moved to a different time', () => {
    const moved = { ...reminder, at: '2026-09-22T14:00:00.000Z' }
    expect(reconcile([moved], booked, NOW).publish).toEqual([moved])
  })

  it('cancels an address that is no longer wanted and has not fired yet', () => {
    const future: Ledger = { 'd2026-09-23-after-lunch': { at: '2026-09-23T13:30:00.000Z', body: '1 dose due' } }
    const { cancel, drop } = reconcile([], future, NOW)
    expect(cancel).toEqual(['d2026-09-23-after-lunch'])
    expect(drop).toHaveLength(0)
  })

  it('forgets one that has already been delivered rather than spending a request cancelling it', () => {
    const past: Ledger = { 'd2026-09-21-after-lunch': { at: '2026-09-21T13:30:00.000Z', body: '1 dose due' } }
    const { cancel, drop } = reconcile([], past, NOW)
    expect(drop).toEqual(['d2026-09-21-after-lunch'])
    expect(cancel).toHaveLength(0)
  })

  it('publishes an address it has never seen', () => {
    expect(reconcile([reminder], {}, NOW).publish).toEqual([reminder])
  })
})

describe('ticking a dose, end to end through the diff', () => {
  const m = daily('Metformin', ['after-lunch'])

  it('takes the reminder away once the slot is answered', () => {
    const before = planned(db([m]))
    const ledger: Ledger = Object.fromEntries(before.map((r) => [r.id, { at: r.at, body: r.body }]))
    const after = planned(db([m], logged(m, '2026-09-22', 'after-lunch', 'taken')))
    const { cancel, publish } = reconcile(after, ledger, NOW)
    expect(cancel).toEqual(['d2026-09-22-after-lunch'])
    expect(publish).toHaveLength(0)
  })

  it('puts it back when the tick is undone', () => {
    const ticked = planned(db([m], logged(m, '2026-09-22', 'after-lunch', 'taken')))
    const ledger: Ledger = Object.fromEntries(ticked.map((r) => [r.id, { at: r.at, body: r.body }]))
    const { publish } = reconcile(planned(db([m])), ledger, NOW)
    expect(publish.map((r) => r.id)).toEqual(['d2026-09-22-after-lunch'])
  })

  it('corrects the count when a medicine joins the slot', () => {
    const before = planned(db([m]))
    const ledger: Ledger = Object.fromEntries(before.map((r) => [r.id, { at: r.at, body: r.body }]))
    const { publish, cancel } = reconcile(planned(db([m, daily('Amoxicillin', ['after-lunch'])])), ledger, NOW)
    expect(cancel).toHaveLength(0)
    expect(publish.every((r) => r.body === '2 doses due')).toBe(true)
  })
})
