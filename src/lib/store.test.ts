import { beforeEach, describe, expect, it } from 'vitest'
import { shiftKey, today } from '@/lib/dates'
import { groupMedicines, logKey, scheduledSlotsOn } from '@/lib/schedule'
import {
  addMedicine,
  deleteMedicine,
  getDatabase,
  importDatabase,
  restartMedicine,
  setDose,
  stopMedicine,
  updateMedicine,
} from '@/lib/store'
import type { MedicineInput } from '@/types'

const now = today()

const calcium: MedicineInput = {
  name: 'Calcium with D3',
  slots: ['after-breakfast'],
  repeatEveryDays: 1,
  anchorDate: shiftKey(now, -5),
  durationValue: 30,
  durationUnit: 'days',
}

function records(groupId: string) {
  return getDatabase().medicines.filter((m) => m.groupId === groupId)
}

beforeEach(() => {
  importDatabase(JSON.stringify({ version: 1, medicines: [], log: {} }))
})

describe('adding', () => {
  it('starts the first version on the course start date', () => {
    const id = addMedicine(calcium)
    expect(records(id)).toHaveLength(1)
    expect(records(id)[0].effectiveFrom).toBe(calcium.anchorDate)
  })
})

describe('editing', () => {
  it('rewrites the name everywhere without forking', () => {
    const id = addMedicine(calcium)
    updateMedicine(id, { ...calcium, name: 'Calcium with D3 500' })
    expect(records(id)).toHaveLength(1)
    expect(records(id)[0].name).toBe('Calcium with D3 500')
  })

  it('forks from today when the slots change', () => {
    const id = addMedicine(calcium)
    updateMedicine(id, { ...calcium, slots: ['after-dinner'] })

    const all = records(id)
    expect(all).toHaveLength(2)
    const [first, second] = all.sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? -1 : 1))
    expect(first.closedOn).toBe(now)
    expect(second.effectiveFrom).toBe(now)
  })

  it('leaves yesterday on the old slot and today on the new one', () => {
    const id = addMedicine(calcium)
    updateMedicine(id, { ...calcium, slots: ['after-dinner'] })

    const group = groupMedicines(getDatabase().medicines)[0]
    expect(scheduledSlotsOn(group, shiftKey(now, -1))).toEqual(['after-breakfast'])
    expect(scheduledSlotsOn(group, now)).toEqual(['after-dinner'])
  })

  it('holds the original weekday when a weekly medicine is edited midway', () => {
    const start = shiftKey(now, -14)
    const id = addMedicine({
      name: 'Vitamin B12',
      slots: ['anytime'],
      repeatEveryDays: 7,
      anchorDate: start,
      durationValue: 5,
      durationUnit: 'weeks',
    })
    updateMedicine(id, {
      name: 'Vitamin B12',
      slots: ['after-lunch'],
      repeatEveryDays: 7,
      anchorDate: start,
      durationValue: 5,
      durationUnit: 'weeks',
    })

    const group = groupMedicines(getDatabase().medicines)[0]
    // The fork keeps the anchor, so doses stay on the same weekday rather than
    // jumping to whatever day the edit happened on.
    expect(scheduledSlotsOn(group, shiftKey(start, 21))).toEqual(['after-lunch'])
    expect(scheduledSlotsOn(group, shiftKey(start, 22))).toEqual([])
  })

  it('keeps ticks logged before the edit', () => {
    const id = addMedicine(calcium)
    const yesterday = shiftKey(now, -1)
    setDose(id, yesterday, 'after-breakfast', 'taken')

    updateMedicine(id, { ...calcium, slots: ['after-dinner'] })
    expect(getDatabase().log[logKey(id, yesterday, 'after-breakfast')].state).toBe('taken')
  })

  it('replaces in place when the course has not started yet', () => {
    const id = addMedicine({ ...calcium, anchorDate: shiftKey(now, 3) })
    updateMedicine(id, { ...calcium, anchorDate: shiftKey(now, 3), slots: ['after-dinner'] })
    expect(records(id)).toHaveLength(1)
    expect(records(id)[0].slots).toEqual(['after-dinner'])
  })
})

describe('stopping, deleting and restarting', () => {
  it('closes the course today and keeps the history', () => {
    const id = addMedicine(calcium)
    setDose(id, shiftKey(now, -1), 'after-breakfast', 'taken')
    stopMedicine(id)

    const group = groupMedicines(getDatabase().medicines)[0]
    expect(scheduledSlotsOn(group, now)).toEqual([])
    expect(scheduledSlotsOn(group, shiftKey(now, -1))).toEqual(['after-breakfast'])
    expect(Object.keys(getDatabase().log)).toHaveLength(1)
  })

  it('soft deletes without touching the log', () => {
    const id = addMedicine(calcium)
    setDose(id, now, 'after-breakfast', 'taken')
    deleteMedicine(id)

    expect(records(id)[0].deletedAt).toBeTruthy()
    expect(Object.keys(getDatabase().log)).toHaveLength(1)
  })

  it('restarts into a separate group so the old history stays sealed', () => {
    const id = addMedicine(calcium)
    const restarted = restartMedicine(id, now)

    expect(restarted).toBeTruthy()
    expect(restarted).not.toBe(id)
    expect(groupMedicines(getDatabase().medicines)).toHaveLength(2)
    expect(records(restarted!)[0].anchorDate).toBe(now)
  })
})

describe('the log', () => {
  it('snapshots the medicine name at the moment of the tick', () => {
    const id = addMedicine(calcium)
    setDose(id, now, 'after-breakfast', 'taken')
    updateMedicine(id, { ...calcium, name: 'Something else' })
    expect(getDatabase().log[logKey(id, now, 'after-breakfast')].name).toBe('Calcium with D3')
  })

  it('drops the entry entirely when a tick is undone', () => {
    const id = addMedicine(calcium)
    setDose(id, now, 'after-breakfast', 'taken')
    setDose(id, now, 'after-breakfast', null)
    expect(getDatabase().log).toEqual({})
  })
})
