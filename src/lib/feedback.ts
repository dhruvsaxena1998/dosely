import { useSyncExternalStore } from 'react'
import { WebHaptics, defaultPatterns } from 'web-haptics'

/**
 * How much the app is allowed to answer back.
 *
 * The three positions are a platform story rather than a ladder of enthusiasm.
 * Android and Chrome have the Vibration API, so a tick can be felt and nothing
 * needs to be heard. iOS has no Vibration API at all — 17.4 added a real system
 * haptic that the web can reach, which the library implements, but it needs the
 * System Haptics setting on and it fails completely silently, and there is no
 * way to find out from script. So iOS is not a platform without haptics; it is
 * one where haptics might work and you cannot ask. It gets both, and anyone who
 * finds the braces too loud can drop to haptic only.
 */
export type FeedbackMode = 'off' | 'haptic' | 'haptic-and-sound'

/**
 * What there is to say back. Callers name the moment, never a preset, a
 * duration or an intensity — which is what keeps the library replaceable and
 * the platform branching in this one file.
 */
export type FeedbackMoment = 'dose-taken' | 'dose-skipped' | 'dose-cleared' | 'day-complete'

/**
 * Its own key beside the theme's, and deliberately not in the exported
 * database. Feedback is a property of a device — its speaker, its taptic
 * engine, whether it is on a bedside table at 3am — not of a prescription, so a
 * backup restored onto another phone must not bring it along.
 */
const STORAGE_KEY = 'dosely.feedback'

const listeners = new Set<() => void>()

function isMode(value: unknown): value is FeedbackMode {
  return value === 'off' || value === 'haptic' || value === 'haptic-and-sound'
}

/**
 * The same question the library asks to decide how to deliver a tick, asked
 * again here rather than read off its `isSupported` — that is a static settled
 * when the module was imported, and this has to answer for the device the app
 * is running on now.
 */
function canVibrate(): boolean {
  return typeof navigator.vibrate === 'function'
}

/** Sound where there is no vibration to trust, and none where there is. */
export function defaultMode(): FeedbackMode {
  return canVibrate() ? 'haptic' : 'haptic-and-sound'
}

/**
 * Read live rather than cached, like the install store and for the same reason:
 * the answer depends on the device, and a value fixed at import is one fixed
 * before anybody asked. A mode is a primitive, so `useSyncExternalStore` gets
 * the referential stability it needs for free.
 */
export function feedbackMode(): FeedbackMode {
  const stored = localStorage.getItem(STORAGE_KEY)
  return isMode(stored) ? stored : defaultMode()
}

export function setFeedbackMode(mode: FeedbackMode) {
  localStorage.setItem(STORAGE_KEY, mode)
  for (const listener of listeners) listener()
  // A setting about how the app feels should be felt as it is chosen, not read
  // about. This doubles as the gesture that unlocks audio, which Web Audio will
  // not start without.
  feedback('dose-taken')
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useFeedbackMode(): FeedbackMode {
  return useSyncExternalStore(subscribe, feedbackMode)
}

/**
 * One instance for the whole app, built when something first asks for it.
 * Each instance appends its own hidden `<label>` to the body — that element is
 * where iOS's system tick actually comes from — so the library's React hook,
 * which builds one per call, would append one per visible dose row. The vanilla
 * class is used instead and held here.
 */
let instance: WebHaptics | undefined

/** The library's lightest tick: 8ms at low weight, gone before it is noticed. */
const TICK = 'selection'

/** Two taps. The one moment in the app worth celebrating. */
const COMPLETE = 'success'

/**
 * A skip is a tick at a heavier weight and the same length, so the hand knows
 * which of the two columns it hit without the ear or the eye being involved.
 * Spelled out from the library's own preset rather than passed as a trigger
 * intensity, because a preset's own intensity wins over that option — and
 * derived from it rather than retyped, so the two cannot drift apart.
 */
const SKIP = defaultPatterns[TICK].pattern.map((v) => ({ ...v, intensity: 0.6 }))

function hapticsFor(mode: FeedbackMode): WebHaptics {
  instance ??= new WebHaptics()
  // The library plays its click only with debug on, and turning debug on also
  // adds the click on platforms that already vibrate. So sound is not a switch
  // of its own: it is this flag, and the mode is what encodes "iOS by default".
  instance.setDebug(mode === 'haptic-and-sound')
  return instance
}

/**
 * Answer a press. Fire and forget, and it cannot throw: a browser that refuses
 * to vibrate, or an audio context that will not start, degrades to no feedback
 * and never to a tick that failed to record.
 */
export function feedback(moment: FeedbackMoment) {
  const mode = feedbackMode()
  if (mode === 'off') return
  const input = moment === 'day-complete' ? COMPLETE : moment === 'dose-skipped' ? SKIP : TICK
  try {
    void hapticsFor(mode)
      .trigger(input)
      .catch(() => undefined)
  } catch {
    // Nothing to do and nothing to report. The dose is already recorded.
  }
}
