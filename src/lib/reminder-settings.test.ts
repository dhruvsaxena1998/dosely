import { beforeEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_SERVER,
  DEFAULT_SETTINGS,
  isTime,
  reminderSettings,
  setReminderSettings,
  setSlotTime,
  slotInstant,
} from '@/lib/reminder-settings'
import { exportDatabase, importDatabase } from '@/lib/store'

const KEY = 'dosely.reminders'

beforeEach(() => {
  localStorage.removeItem(KEY)
})

describe('the defaults', () => {
  it('has reminders off until somebody turns them on', () => {
    expect(reminderSettings().enabled).toBe(false)
  })

  it('points at ntfy.sh, and names no topic yet', () => {
    expect(reminderSettings().server).toBe(DEFAULT_SERVER)
    expect(reminderSettings().topic).toBe('')
  })

  it('leaves medicine names out, because the topic is the only thing protecting them', () => {
    expect(reminderSettings().includeNames).toBe(false)
  })

  it('gives every slot an hour, so turning it on is one press and not seven decisions', () => {
    const { times } = reminderSettings()
    expect(times['after-breakfast']).toBe('08:30')
    expect(times.anytime).toBe('10:00')
    expect(Object.values(times).every(isTime)).toBe(true)
  })

  it('writes nothing until something is actually changed', () => {
    reminderSettings()
    expect(localStorage.getItem(KEY)).toBeNull()
  })
})

describe('the preference', () => {
  it('survives being read again from scratch', () => {
    setReminderSettings({ enabled: true, topic: 'dosely-abc123' })
    expect(reminderSettings().topic).toBe('dosely-abc123')
    expect(reminderSettings().enabled).toBe(true)
  })

  it('changes one slot without disturbing the others', () => {
    setSlotTime('after-dinner', '21:15')
    expect(reminderSettings().times['after-dinner']).toBe('21:15')
    expect(reminderSettings().times['after-breakfast']).toBe('08:30')
  })

  it('hands back the same object while nothing has changed, so the hook cannot spin', () => {
    expect(reminderSettings()).toBe(reminderSettings())
    setReminderSettings({ includeNames: true })
    expect(reminderSettings()).toBe(reminderSettings())
  })

  it('falls back to the defaults when the stored value is nonsense', () => {
    localStorage.setItem(KEY, 'not json at all')
    expect(reminderSettings()).toEqual(DEFAULT_SETTINGS)
  })

  it('loses only the slot that was corrupted, not the other six', () => {
    localStorage.setItem(KEY, JSON.stringify({ times: { 'after-lunch': '25:99', anytime: '11:00' } }))
    expect(reminderSettings().times['after-lunch']).toBe('13:30')
    expect(reminderSettings().times.anytime).toBe('11:00')
  })

  it('stays out of the exported data', () => {
    setReminderSettings({ enabled: true, topic: 'dosely-secret' })
    expect(exportDatabase()).not.toContain('dosely-secret')
    expect(exportDatabase()).not.toContain('reminders')
  })

  it('is left alone by restoring a backup', () => {
    setReminderSettings({ enabled: true, topic: 'dosely-secret' })
    importDatabase(JSON.stringify({ version: 1, medicines: [], log: {} }))
    expect(reminderSettings().topic).toBe('dosely-secret')
  })
})

describe('when a slot falls', () => {
  it('is that time on that day, for anything after the rollover', () => {
    const at = slotInstant('2026-09-22', '08:30')
    expect(at.getDate()).toBe(22)
    expect(at.getHours()).toBe(8)
    expect(at.getMinutes()).toBe(30)
  })

  // The day named by a DateKey starts at 3am, so the small hours of a dose day
  // are the small hours of the next calendar date. A reminder that missed this
  // would land twenty-three hours early for anyone taking something at night.
  it('is the next calendar day for a time before the rollover', () => {
    const at = slotInstant('2026-09-22', '01:00')
    expect(at.getDate()).toBe(23)
    expect(at.getHours()).toBe(1)
  })

  it('does not shift the boundary itself, which is the first moment of its own day', () => {
    const at = slotInstant('2026-09-22', '03:00')
    expect(at.getDate()).toBe(22)
    expect(at.getHours()).toBe(3)
  })

  it('carries a small-hours time across a month end', () => {
    const at = slotInstant('2026-09-30', '02:30')
    expect(at.getMonth()).toBe(9)
    expect(at.getDate()).toBe(1)
  })

  it('takes the last minute before the rollover with it', () => {
    expect(slotInstant('2026-09-22', '02:59').getDate()).toBe(23)
  })
})

describe('what counts as a time', () => {
  it('accepts a 24 hour clock', () => {
    expect(isTime('00:00')).toBe(true)
    expect(isTime('23:59')).toBe(true)
  })

  it('rejects anything a time input would never produce', () => {
    expect(isTime('24:00')).toBe(false)
    expect(isTime('7:30')).toBe(false)
    expect(isTime('08:60')).toBe(false)
    expect(isTime('')).toBe(false)
    expect(isTime(830)).toBe(false)
  })
})
