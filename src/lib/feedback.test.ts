import { beforeEach, describe, expect, it, vi } from 'vitest'
import { pretendVibration } from '@/test/agent'
import { defaultMode, feedback, feedbackMode, setFeedbackMode } from '@/lib/feedback'
import { exportDatabase, importDatabase } from '@/lib/store'

/**
 * These tests assert that the app asked for the right feedback in the right
 * circumstances. They never assert that a phone vibrated — that is the
 * library's job, and jsdom has no Vibration API, no real `AudioContext` and no
 * iOS, so there is nothing there to be right about.
 *
 * The library decides iOS from Android by whether `navigator.vibrate` is a
 * function, so the platform here is simulated the same way: by presence.
 */
const stub = vi.hoisted(() => ({
  trigger: vi.fn(),
  setDebug: vi.fn(),
  built: 0,
}))

vi.mock('web-haptics', async (importOriginal) => {
  const actual = await importOriginal<typeof import('web-haptics')>()
  return {
    ...actual,
    WebHaptics: class {
      constructor() {
        stub.built += 1
      }
      trigger = stub.trigger
      setDebug = stub.setDebug
    },
  }
})

/** The preset the library's own `selection` carries, at a heavier weight. */
const HEAVIER_TICK = [{ duration: 8, intensity: 0.6 }]

beforeEach(() => {
  localStorage.removeItem('dosely.feedback')
  stub.trigger.mockReset().mockReturnValue(Promise.resolve())
  stub.setDebug.mockReset()
})

describe('what a press asks for', () => {
  it('asks for the lightest tick when a dose is ticked', () => {
    feedback('dose-taken')
    expect(stub.trigger).toHaveBeenCalledWith('selection')
  })

  it('asks for the same tick when a mis-tap is undone', () => {
    feedback('dose-cleared')
    expect(stub.trigger).toHaveBeenCalledWith('selection')
  })

  it('asks for a heavier tick of the same length when a dose is skipped', () => {
    feedback('dose-skipped')
    expect(stub.trigger).toHaveBeenCalledWith(HEAVIER_TICK)
  })

  it('asks for the two-tap answer when the day is complete', () => {
    feedback('day-complete')
    expect(stub.trigger).toHaveBeenCalledWith('success')
  })

  it('asks for nothing at all when feedback is off', () => {
    setFeedbackMode('off')
    feedback('dose-taken')
    feedback('day-complete')
    expect(stub.trigger).not.toHaveBeenCalled()
  })

  it('builds one haptics instance for the whole app', () => {
    feedback('dose-taken')
    feedback('dose-skipped')
    feedback('day-complete')
    // Each instance appends its own hidden label to the body, and a dose row
    // asking for one per render would append one per visible row.
    expect(stub.built).toBe(1)
  })
})

describe('the default for the device', () => {
  it('is haptic and sound where there is no Vibration API to trust', () => {
    expect(defaultMode()).toBe('haptic-and-sound')
    expect(feedbackMode()).toBe('haptic-and-sound')
  })

  it('is haptic alone where the platform can vibrate', () => {
    pretendVibration()
    expect(defaultMode()).toBe('haptic')
    expect(feedbackMode()).toBe('haptic')
  })

  it('turns the library click on for the mode that wants sound', () => {
    setFeedbackMode('haptic-and-sound')
    expect(stub.setDebug).toHaveBeenCalledWith(true)
  })

  it('lets the sound go without taking the haptic with it', () => {
    setFeedbackMode('haptic')
    expect(stub.setDebug).toHaveBeenCalledWith(false)
    expect(stub.trigger).toHaveBeenCalledWith('selection')
  })
})

describe('the preference', () => {
  it('is felt as it is chosen', () => {
    setFeedbackMode('haptic')
    expect(stub.trigger).toHaveBeenCalledWith('selection')
  })

  it('survives being read again from scratch', () => {
    setFeedbackMode('haptic')
    expect(localStorage.getItem('dosely.feedback')).toBe('haptic')
    expect(feedbackMode()).toBe('haptic')
  })

  it('stays out of the exported data', () => {
    setFeedbackMode('off')
    expect(exportDatabase()).not.toContain('feedback')
  })

  it('is left alone by restoring a backup', () => {
    setFeedbackMode('off')
    importDatabase(JSON.stringify({ version: 1, medicines: [], log: {} }))
    expect(feedbackMode()).toBe('off')
  })

  it('falls back to the device default when the stored value is nonsense', () => {
    localStorage.setItem('dosely.feedback', 'loud')
    expect(feedbackMode()).toBe(defaultMode())
  })
})

describe('a device that will not answer', () => {
  it('never lets a refused vibration break a tick that was recorded', () => {
    stub.trigger.mockReturnValue(Promise.reject(new Error('not allowed')))
    expect(() => feedback('dose-taken')).not.toThrow()
  })

  it('never lets a thrown vibration break a tick either', () => {
    stub.trigger.mockImplementation(() => {
      throw new Error('no vibration hardware')
    })
    expect(() => feedback('dose-taken')).not.toThrow()
  })
})
