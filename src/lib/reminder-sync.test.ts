import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fromKey, shiftKey, today } from '@/lib/dates'
import { readLedger, syncReminders } from '@/lib/reminder-sync'
import { setReminderSettings } from '@/lib/reminder-settings'
import { addMedicine, importDatabase, setDose } from '@/lib/store'

const now = today()
const TOPIC = 'dosely-testtopic1234'

/**
 * Four in the morning on today's dose day. Built from the key rather than from
 * the wall clock so that the whole suite does not change meaning depending on
 * the hour it is run at — at 2pm the default after-lunch slot has already gone,
 * and every assertion about booking it would be answering a different question.
 */
const NOW = (() => {
  const at = fromKey(now)
  at.setHours(4, 0, 0, 0)
  return at
})()

let fetched: ReturnType<typeof vi.fn>

/** Every request the run made, as method and path. */
function calls(): string[] {
  const made = fetched.mock.calls as [string, RequestInit][]
  return made.map(([url, init]) => `${init.method} ${url}`)
}

function metformin(slots: ('after-lunch' | 'after-dinner')[] = ['after-lunch']) {
  return addMedicine({
    name: 'Metformin',
    slots,
    repeatEveryDays: 1,
    anchorDate: shiftKey(now, -1),
    durationValue: 30,
    durationUnit: 'days',
  })
}

function turnOn() {
  setReminderSettings({ enabled: true, topic: TOPIC })
}

beforeEach(() => {
  importDatabase(JSON.stringify({ version: 1, medicines: [], log: {} }))
  localStorage.removeItem('dosely.reminders')
  localStorage.removeItem('dosely.reminders.booked')
  fetched = vi.fn().mockResolvedValue({ ok: true, status: 200 })
  vi.stubGlobal('fetch', fetched)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('while reminders are switched off', () => {
  it('sends nothing at all', async () => {
    metformin()
    await syncReminders(NOW)
    expect(fetched).not.toHaveBeenCalled()
  })

  it('books nothing even once there is a topic, if the switch is off', async () => {
    metformin()
    setReminderSettings({ enabled: false, topic: TOPIC })
    await syncReminders(NOW)
    expect(fetched).not.toHaveBeenCalled()
  })
})

describe('the steady state', () => {
  it('books the pending slots the first time', async () => {
    metformin()
    turnOn()
    await syncReminders(NOW)
    expect(fetched.mock.calls.length).toBeGreaterThan(0)
    expect(calls().every((c) => c.startsWith('POST'))).toBe(true)
    expect(Object.keys(readLedger()).length).toBe(fetched.mock.calls.length)
  })

  // The property that keeps a feature firing five times a day inside a budget
  // of 250 messages: opening the app when nothing changed costs nothing.
  it('sends nothing the second time, when nothing has changed', async () => {
    metformin()
    turnOn()
    await syncReminders(NOW)
    fetched.mockClear()
    await syncReminders(NOW)
    expect(fetched).not.toHaveBeenCalled()
  })
})

describe('answering a dose', () => {
  it('cancels the slot reminder once the slot is fully answered', async () => {
    const id = metformin()
    turnOn()
    await syncReminders(NOW)
    fetched.mockClear()

    setDose(id, now, 'after-lunch', 'taken')
    await syncReminders(NOW)

    expect(calls()).toContain(`DELETE https://ntfy.sh/${TOPIC}/d${now}-after-lunch`)
    expect(readLedger()[`d${now}-after-lunch`]).toBeUndefined()
  })

  it('books it again when the tick is undone', async () => {
    const id = metformin()
    turnOn()
    setDose(id, now, 'after-lunch', 'taken')
    await syncReminders(NOW)
    fetched.mockClear()

    setDose(id, now, 'after-lunch', null)
    await syncReminders(NOW)

    expect(calls().some((c) => c.startsWith('POST'))).toBe(true)
    expect(readLedger()[`d${now}-after-lunch`]).toBeDefined()
  })

  it('corrects the count rather than booking a second reminder when a medicine joins the slot', async () => {
    metformin()
    turnOn()
    await syncReminders(NOW)
    const before = Object.keys(readLedger()).length
    fetched.mockClear()

    addMedicine({
      name: 'Amoxicillin',
      slots: ['after-lunch'],
      repeatEveryDays: 1,
      anchorDate: shiftKey(now, -1),
      durationValue: 30,
      durationUnit: 'days',
    })
    await syncReminders(NOW)

    expect(calls().every((c) => c.startsWith('POST'))).toBe(true)
    expect(Object.keys(readLedger()).length).toBe(before)
    expect(readLedger()[`d${now}-after-lunch`]?.body).toBe('2 doses due')
  })
})

describe('turning reminders off', () => {
  it('cancels everything that was booked, and empties the ledger', async () => {
    metformin()
    turnOn()
    await syncReminders(NOW)
    const booked = Object.keys(readLedger())
    fetched.mockClear()

    setReminderSettings({ enabled: false })
    await syncReminders(NOW)

    expect(calls().every((c) => c.startsWith('DELETE'))).toBe(true)
    expect(calls()).toHaveLength(booked.length)
    expect(readLedger()).toEqual({})
  })
})

describe('when a request does not land', () => {
  it('leaves the ledger alone, so the next run tries the same thing again', async () => {
    metformin()
    turnOn()
    fetched.mockRejectedValue(new TypeError('Failed to fetch'))
    await syncReminders(NOW)
    expect(readLedger()).toEqual({})

    fetched.mockReset().mockResolvedValue({ ok: true, status: 200 })
    await syncReminders(NOW)
    expect(Object.keys(readLedger()).length).toBeGreaterThan(0)
  })

  it('keeps whatever did land, when only some of the run failed', async () => {
    metformin(['after-lunch', 'after-dinner'])
    turnOn()
    let call = 0
    fetched.mockImplementation(() => {
      call += 1
      return Promise.resolve(call === 1 ? { ok: true, status: 200 } : { ok: false, status: 500 })
    })
    await syncReminders(NOW)
    expect(Object.keys(readLedger())).toHaveLength(1)
  })

  // Every request after a 429 fails too, so stopping is the difference between
  // one wasted request and thirty.
  it('stops the whole run on the first sign of a full bucket', async () => {
    metformin(['after-lunch', 'after-dinner'])
    turnOn()
    fetched.mockResolvedValue({ ok: false, status: 429 })
    await syncReminders(NOW)
    expect(fetched).toHaveBeenCalledTimes(1)
    expect(readLedger()).toEqual({})
  })
})

describe('a reminder that has already been delivered', () => {
  it('is forgotten rather than cancelled', async () => {
    localStorage.setItem(
      'dosely.reminders.booked',
      JSON.stringify({ 'd2020-01-01-after-lunch': { at: '2020-01-01T13:30:00.000Z', body: '1 dose due' } }),
    )
    setReminderSettings({ enabled: true, topic: TOPIC })
    await syncReminders(NOW)
    expect(calls().some((c) => c.includes('d2020-01-01-after-lunch'))).toBe(false)
    expect(readLedger()['d2020-01-01-after-lunch']).toBeUndefined()
  })
})
