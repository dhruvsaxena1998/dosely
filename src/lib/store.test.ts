import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DateDurationUnit } from '@/lib/dates'
import { courseEndFrom, shiftKey, today } from '@/lib/dates'
import {
  adherenceFor,
  canResume,
  courseEnd,
  courseStatus,
  doseHistory,
  groupMedicines,
  groupSpan,
  isDeleted,
  logKey,
  scheduledSlotsOn,
} from '@/lib/schedule'
import {
  addMedicine,
  deleteMedicine,
  getDatabase,
  importDatabase,
  purgeMedicine,
  restoreMedicine,
  resumeMedicine,
  setDose,
  setDoses,
  stopMedicine,
  updateMedicine,
} from '@/lib/store'
import type { Weekday } from '@/lib/weekdays'
import type { MedicineInput } from '@/types'
import { getISODay } from 'date-fns'

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

function group(groupId: string) {
  return groupMedicines(records(groupId))[0]
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

  it('does not fork a weekly course rewritten as one weekday, because nothing moved', () => {
    const weekly: MedicineInput = { ...calcium, name: 'Vitamin B12', repeatEveryDays: 7, slots: ['anytime'] }
    const id = addMedicine(weekly)
    const day = getISODay(new Date(`${weekly.anchorDate}T00:00:00`)) as Weekday
    updateMedicine(id, { ...weekly, repeatEveryDays: 1, weekdays: [day] })
    expect(records(id)).toHaveLength(1)
    // But moving it to a different day does.
    updateMedicine(id, { ...weekly, repeatEveryDays: 1, weekdays: [((day % 7) + 1) as Weekday] })
    expect(records(id)).toHaveLength(2)
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

  it('purges every version and every entry it ever earned', () => {
    const id = addMedicine(calcium)
    setDose(id, shiftKey(now, -1), 'after-breakfast', 'taken')
    setDose(id, now, 'after-breakfast', 'taken')
    deleteMedicine(id)
    purgeMedicine(id)

    expect(records(id)).toHaveLength(0)
    expect(getDatabase().log).toEqual({})
  })

  it('purges only the medicine asked about', () => {
    const id = addMedicine(calcium)
    const other = addMedicine({ ...calcium, name: 'Vitamin D3' })
    setDose(id, now, 'after-breakfast', 'taken')
    setDose(other, now, 'after-breakfast', 'taken')
    purgeMedicine(id)

    expect(records(id)).toHaveLength(0)
    expect(records(other)).toHaveLength(1)
    expect(getDatabase().log[logKey(other, now, 'after-breakfast')].state).toBe('taken')
  })

})

describe('resuming a stopped course', () => {
  /**
   * A course stopped days ago and left alone since. `stopMedicine` always stops
   * as of today, so a stop with any distance behind it — which is the only shape
   * that has a pause in it to get wrong — has to be written out rather than
   * pressed into being.
   */
  function stoppedDaysAgo(over: Partial<MedicineInput> = {}, stopped = -5, started = -10) {
    const id = 'grp-paused'
    const input = { ...calcium, ...over, anchorDate: shiftKey(now, started) }
    importDatabase(
      JSON.stringify({
        version: 1,
        log: {},
        medicines: [
          {
            ...input,
            id: 'rec-1',
            groupId: id,
            effectiveFrom: input.anchorDate,
            closedOn: shiftKey(now, stopped),
            closedBy: 'stopped',
            createdAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      }),
    )
    return { id, input }
  }

  it('schedules nothing across the pause, and doses again after it', () => {
    const { id } = stoppedDaysAgo()
    resumeMedicine(id)

    expect(scheduledSlotsOn(group(id), shiftKey(now, -8))).toEqual(['after-breakfast'])
    // The days between the stop and the resume are owned by no version at all.
    expect(scheduledSlotsOn(group(id), shiftKey(now, -3))).toEqual([])
    expect(scheduledSlotsOn(group(id), now)).toEqual(['after-breakfast'])
  })

  it('moves the course back into running', () => {
    const { id } = stoppedDaysAgo()
    expect(courseStatus(group(id), now)).toBe('stopped')

    resumeMedicine(id)
    expect(courseStatus(group(id), now)).toBe('active')
  })

  it('ends the course when it was always going to end', () => {
    const { id, input } = stoppedDaysAgo()
    // Every fixture in this block is measured in calendar, so the unit narrows.
    const end = courseEndFrom(input.anchorDate, input.durationValue, input.durationUnit as DateDurationUnit)

    resumeMedicine(id)

    expect(courseEnd(group(id).current)).toBe(end)
    expect(groupSpan(group(id)).end).toBe(end)
  })

  it('holds the original weekday when a weekly course is resumed midweek', () => {
    const { id, input } = stoppedDaysAgo(
      { repeatEveryDays: 7, durationValue: 8, durationUnit: 'weeks' },
      -10,
      -21,
    )
    resumeMedicine(id)

    // Four weeks after the anchor is a week from now, which the resumed version
    // covers. It lands on the anchor's weekday, not on the day of the resume.
    expect(scheduledSlotsOn(group(id), shiftKey(input.anchorDate, 28))).toEqual(['after-breakfast'])
    expect(scheduledSlotsOn(group(id), shiftKey(input.anchorDate, 29))).toEqual([])
  })

  it('leaves the pause out of the tally rather than counting it as missed', () => {
    const { id } = stoppedDaysAgo()
    resumeMedicine(id)

    // Five days before the stop, twenty from the resume to the original end,
    // and the five days of the pause in neither.
    const tally = adherenceFor(getDatabase(), group(id), now)
    expect(tally.total).toBe(25)
    expect(tally.missed).toBe(5)
    expect(tally.pending).toBe(20)
  })

  it('keeps every tick recorded before the stop', () => {
    const { id } = stoppedDaysAgo()
    const before = shiftKey(now, -8)
    setDose(id, before, 'after-breakfast', 'taken')

    resumeMedicine(id)

    expect(getDatabase().log[logKey(id, before, 'after-breakfast')].state).toBe('taken')
  })

  it("brings today's doses back when the stop is undone the same day", () => {
    const id = addMedicine(calcium)
    stopMedicine(id)
    expect(scheduledSlotsOn(group(id), now)).toEqual([])

    resumeMedicine(id)
    expect(scheduledSlotsOn(group(id), now)).toEqual(['after-breakfast'])
  })

  it('can be stopped again afterwards', () => {
    const id = addMedicine(calcium)
    stopMedicine(id)
    resumeMedicine(id)
    stopMedicine(id)

    expect(courseStatus(group(id), now)).toBe('stopped')
    expect(scheduledSlotsOn(group(id), now)).toEqual([])
    expect(scheduledSlotsOn(group(id), shiftKey(now, -1))).toEqual(['after-breakfast'])
  })

  it('refuses a course whose original span has already run out', () => {
    // Stopped ten days ago, and the seventeen days it was prescribed for ran out
    // three days ago. There is nothing left to resume into.
    const { id } = stoppedDaysAgo({ durationValue: 17 }, -10, -20)

    resumeMedicine(id)

    expect(records(id)).toHaveLength(1)
    expect(scheduledSlotsOn(group(id), now)).toEqual([])
  })
})

describe('a fork inheriting the group lifecycle', () => {
  it('keeps a stopped course stopped when its schedule is edited', () => {
    const id = addMedicine(calcium)
    stopMedicine(id)
    updateMedicine(id, { ...calcium, slots: ['after-dinner'] })

    expect(courseStatus(group(id), now)).toBe('stopped')
  })

  it('keeps a deleted medicine deleted when its schedule is edited', () => {
    const id = addMedicine(calcium)
    deleteMedicine(id)
    updateMedicine(id, { ...calcium, slots: ['after-dinner'] })

    expect(isDeleted(group(id))).toBe(true)
  })

  it('leaves a running course running, and still forks it', () => {
    const id = addMedicine(calcium)
    updateMedicine(id, { ...calcium, slots: ['after-dinner'] })

    expect(records(id)).toHaveLength(2)
    expect(courseStatus(group(id), now)).toBe('active')
  })

  it('schedules nothing across a break the user asked for', () => {
    // A course stopped days ago, in the shape a database written before the two
    // closures were named apart would hold it: a date and nothing else.
    const id = 'grp-stopped'
    importDatabase(
      JSON.stringify({
        version: 1,
        log: {},
        medicines: [
          {
            ...calcium,
            id: 'rec-1',
            groupId: id,
            anchorDate: shiftKey(now, -10),
            effectiveFrom: shiftKey(now, -10),
            closedOn: shiftKey(now, -5),
            createdAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      }),
    )
    updateMedicine(id, { ...calcium, anchorDate: shiftKey(now, -10), slots: ['after-dinner'] })

    expect(courseStatus(group(id), now)).toBe('stopped')
    expect(scheduledSlotsOn(group(id), shiftKey(now, -3))).toEqual([])
    expect(scheduledSlotsOn(group(id), now)).toEqual([])
  })

  it('still rewrites the name across a stopped course without forking', () => {
    const id = addMedicine(calcium)
    stopMedicine(id)
    updateMedicine(id, { ...calcium, name: 'Calcium with D3 500' })

    expect(records(id)).toHaveLength(1)
    expect(records(id)[0].name).toBe('Calcium with D3 500')
    expect(courseStatus(group(id), now)).toBe('stopped')
  })

  it('restores a medicine that was edited while deleted', () => {
    const id = addMedicine(calcium)
    deleteMedicine(id)
    updateMedicine(id, { ...calcium, slots: ['after-dinner'] })
    restoreMedicine(id)

    expect(isDeleted(group(id))).toBe(false)
    expect(courseStatus(group(id), now)).toBe('active')
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

describe('answering several doses at once', () => {
  it('reaches storage once, however many doses were answered', () => {
    const ids = [addMedicine(calcium), addMedicine({ ...calcium, name: 'Vitamin D3' })]
    const write = vi.spyOn(Storage.prototype, 'setItem')

    setDoses(
      now,
      ids.map((groupId) => ({ groupId, slot: 'after-breakfast' as const, state: 'taken' as const })),
    )

    expect(write).toHaveBeenCalledTimes(1)
    expect(Object.keys(getDatabase().log)).toHaveLength(2)
    write.mockRestore()
  })

  it('stamps each entry with the name from the version owning that date', () => {
    const yesterday = shiftKey(now, -1)
    const base = {
      groupId: 'grp',
      slots: ['after-breakfast'],
      repeatEveryDays: 1,
      anchorDate: shiftKey(now, -5),
      durationValue: 30,
      durationUnit: 'days',
      createdAt: '2025-09-01T00:00:00.000Z',
    }
    // Two versions with two names, which the app itself cannot produce — a
    // rename rewrites every version — so that the version boundary is the only
    // thing the stamp could be reading.
    importDatabase(
      JSON.stringify({
        version: 1,
        medicines: [
          { ...base, id: 'v1', name: 'Calcium with D3', effectiveFrom: base.anchorDate, closedOn: now, closedBy: 'superseded' },
          { ...base, id: 'v2', name: 'Calcium 500', effectiveFrom: now },
        ],
        log: {},
      }),
    )

    setDoses(yesterday, [{ groupId: 'grp', slot: 'after-breakfast', state: 'taken' }])
    setDose('grp', now, 'after-breakfast', 'taken')

    expect(getDatabase().log[logKey('grp', yesterday, 'after-breakfast')].name).toBe('Calcium with D3')
    expect(getDatabase().log[logKey('grp', now, 'after-breakfast')].name).toBe('Calcium 500')
  })

  it('takes entries away without disturbing the ones it was not given', () => {
    const id = addMedicine({ ...calcium, slots: ['after-breakfast', 'after-dinner'] })
    setDose(id, now, 'after-breakfast', 'taken')
    setDose(id, now, 'after-dinner', 'skipped')

    setDoses(now, [{ groupId: id, slot: 'after-breakfast', state: null }])

    expect(getDatabase().log[logKey(id, now, 'after-breakfast')]).toBeUndefined()
    expect(getDatabase().log[logKey(id, now, 'after-dinner')].state).toBe('skipped')
  })

  it('writes nothing at all when there is nothing to answer', () => {
    const write = vi.spyOn(Storage.prototype, 'setItem')
    setDoses(now, [])
    expect(write).not.toHaveBeenCalled()
    write.mockRestore()
  })
})

describe('a course counted in doses', () => {
  /** Ten tablets, twice a day, started five days ago — so half the strip is gone. */
  const strip: MedicineInput = {
    name: 'Amoxicillin 500MG',
    slots: ['after-breakfast', 'after-dinner'],
    repeatEveryDays: 1,
    anchorDate: shiftKey(now, -5),
    durationValue: 10,
    durationUnit: 'doses',
  }

  function started(over: Partial<MedicineInput> = {}) {
    const id = 'grp-counted'
    const input = { ...strip, ...over }
    importDatabase(
      JSON.stringify({
        version: 1,
        log: {},
        medicines: [
          {
            ...input,
            id: 'rec-1',
            groupId: id,
            effectiveFrom: input.anchorDate,
            createdAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      }),
    )
    return { id, input }
  }

  it('hands a fork what is left of the count, not the whole strip again', () => {
    const { id, input } = started({ durationValue: 20 })
    updateMedicine(id, { ...input, durationValue: 20, slots: ['after-breakfast'] })

    const forked = records(id).find((m) => m.effectiveFrom === now)!
    // Ten of the twenty were scheduled across the five days before today.
    expect(forked.durationValue).toBe(10)
    expect(forked.durationUnit).toBe('doses')
    expect(doseHistory(group(id))).toHaveLength(20)
  })

  it('takes a number the user changed at its word', () => {
    const { id, input } = started()
    updateMedicine(id, { ...input, durationValue: 20, slots: ['after-breakfast'] })

    const forked = records(id).find((m) => m.effectiveFrom === now)!
    expect(forked.durationValue).toBe(20)
  })

  it('forks a course with nothing left rather than one with less than nothing', () => {
    const { id, input } = started()
    updateMedicine(id, { ...input, slots: ['after-breakfast'] })

    const forked = records(id).find((m) => m.effectiveFrom === now)!
    expect(forked.durationValue).toBe(0)
    expect(scheduledSlotsOn(group(id), now)).toEqual([])
    expect(courseStatus(group(id), now)).toBe('finished')
  })

  it('leaves a course measured in calendar alone', () => {
    const id = addMedicine(calcium)
    updateMedicine(id, { ...calcium, slots: ['after-dinner'] })

    const forked = records(id).find((m) => m.effectiveFrom === now)!
    expect(forked.durationValue).toBe(calcium.durationValue)
  })

  it('resumes with the doses that are left, and carries them past the old end', () => {
    const { id } = started({ durationValue: 20 })
    stopMedicine(id)
    resumeMedicine(id)

    const resumed = group(id).current
    expect(resumed.durationValue).toBe(10)
    // Ten doses two a day from today, so the course now ends five days out
    // rather than where the first version would have run out.
    expect(courseEnd(resumed)).toBe(shiftKey(now, 5))
    expect(doseHistory(group(id))).toHaveLength(20)
  })

  it('offers a resume while the strip has anything in it', () => {
    const { id } = started({ durationValue: 20 })
    stopMedicine(id)
    expect(canResume(group(id), now)).toBe(true)

    resumeMedicine(id)
    // Wind the count down to nothing and the offer goes with it.
    updateMedicine(id, { ...strip, durationValue: 0, slots: ['after-breakfast'] })
    expect(canResume(group(id), now)).toBe(false)
  })

  it('brings the weekdays back with a resumed course', () => {
    const { id } = started({ repeatEveryDays: 1, weekdays: [1, 3, 5] as Weekday[], slots: ['anytime'] })
    stopMedicine(id)
    resumeMedicine(id)

    expect(group(id).current.weekdays).toEqual([1, 3, 5])
  })
})
