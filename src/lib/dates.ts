import { useSyncExternalStore } from 'react'
import { addDays, addMonths, differenceInCalendarDays, format, isValid, parseISO, startOfDay, subDays } from 'date-fns'

/** A calendar date in the user's local timezone, as `YYYY-MM-DD`. */
export type DateKey = string

export type DurationUnit = 'days' | 'weeks' | 'months'

/**
 * A dose swallowed at 1am belongs to the night before, not to the new calendar
 * day. Everything in the app that says "today" means the day that started at
 * this hour.
 */
export const DAY_ROLLOVER_HOUR = 3

/** How many days back from today the Today screen lets you tick a dose. */
export const BACKFILL_DAYS = 3

export function toKey(date: Date): DateKey {
  return format(date, 'yyyy-MM-dd')
}

export function fromKey(key: DateKey): Date {
  return startOfDay(parseISO(key))
}

export function isValidKey(key: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(key) && isValid(parseISO(key))
}

export function today(now: Date = new Date()): DateKey {
  return toKey(now.getHours() < DAY_ROLLOVER_HOUR ? subDays(now, 1) : now)
}

/**
 * The day, as a live value. `today()` answers once; this keeps answering.
 *
 * Dosely is installed to a home screen and almost never closed, so a running
 * copy can sit untouched for hours. If nothing re-asks, the app keeps believing
 * whatever day it believed when it last rendered, and a dose ticked on Tuesday
 * morning is written to Monday. This is the one seam that stops that: a
 * component learns the date from `useToday()` and from nowhere else.
 *
 * Built like the app's other external stores, over `useSyncExternalStore`. The
 * snapshot is a `DateKey`, which is a primitive, so this one needs none of the
 * cached-object care the theme and install stores need.
 */
let currentDay: DateKey = today()

const dayListeners = new Set<() => void>()

let rollover: ReturnType<typeof setTimeout> | undefined

/**
 * How long until the day turns over. A second is added so the timer lands after
 * the boundary rather than on it — waking a hair early would read the old day
 * and re-arm for nothing.
 */
function msUntilRollover(now: Date = new Date()): number {
  const next = new Date(now)
  next.setHours(DAY_ROLLOVER_HOUR, 0, 0, 0)
  if (next <= now) next.setDate(next.getDate() + 1)
  return next.getTime() - now.getTime() + 1000
}

/**
 * Re-reads the clock. Silent when the day has not moved, so resuming an app
 * that has not crossed a boundary costs nothing and re-renders nothing. The
 * date is recomputed from scratch every time rather than tracked, which is why
 * flying across a timezone needs no handling of its own.
 */
function readDay() {
  const next = today()
  if (next === currentDay) return
  currentDay = next
  for (const listener of dayListeners) listener()
}

/** One timeout aimed at the next boundary. No interval, no per-second work. */
function armRollover() {
  clearTimeout(rollover)
  rollover = setTimeout(() => {
    readDay()
    armRollover()
  }, msUntilRollover())
}

/**
 * Resuming is the load-bearing trigger. A backgrounded PWA has its timers
 * frozen, so a phone asleep past 3am wakes with a timer that never fired; the
 * timer is the belt and this is the braces. `pageshow` catches a bfcache
 * restore, which does not always come with a visibility change.
 */
function onResume() {
  if (document.visibilityState !== 'visible') return
  readDay()
  armRollover()
}

function subscribeDay(listener: () => void) {
  if (dayListeners.size === 0) {
    document.addEventListener('visibilitychange', onResume)
    window.addEventListener('pageshow', onResume)
    armRollover()
  }
  dayListeners.add(listener)
  // Nothing was watching until now, so the day may have moved since it was last
  // read. React re-reads the snapshot after subscribing, which is what makes
  // catching up here enough.
  readDay()
  return () => {
    dayListeners.delete(listener)
    if (dayListeners.size > 0) return
    document.removeEventListener('visibilitychange', onResume)
    window.removeEventListener('pageshow', onResume)
    clearTimeout(rollover)
    rollover = undefined
  }
}

/**
 * Today's `DateKey`, kept current while the app is open. The only way a
 * rendering component should learn what day it is.
 */
export function useToday(): DateKey {
  return useSyncExternalStore(subscribeDay, () => currentDay)
}

export function shiftKey(key: DateKey, days: number): DateKey {
  return toKey(addDays(fromKey(key), days))
}

export function daysBetween(from: DateKey, to: DateKey): number {
  return differenceInCalendarDays(fromKey(to), fromKey(from))
}

export function minKey(a: DateKey, b: DateKey): DateKey {
  return a <= b ? a : b
}

export function maxKey(a: DateKey, b: DateKey): DateKey {
  return a >= b ? a : b
}

/**
 * The exclusive end of a course. Half-open on purpose: a 5 week weekly course
 * starting 1 Sep ends before 6 Oct, so it produces doses on 1, 8, 15, 22 and 29
 * Sep. Five doses, not six.
 */
export function courseEndFrom(start: DateKey, value: number, unit: DurationUnit): DateKey {
  const d = fromKey(start)
  if (unit === 'days') return toKey(addDays(d, value))
  if (unit === 'weeks') return toKey(addDays(d, value * 7))
  return toKey(addMonths(d, value))
}

export function formatDay(key: DateKey): string {
  return format(fromKey(key), 'EEE d MMM')
}

export function formatDayLong(key: DateKey): string {
  return format(fromKey(key), 'EEEE, d MMMM yyyy')
}

export function formatShort(key: DateKey): string {
  return format(fromKey(key), 'd MMM')
}

export function formatWithYear(key: DateKey): string {
  return format(fromKey(key), 'd MMM yyyy')
}

export function formatTime(iso: string): string {
  return format(parseISO(iso), 'h:mm a')
}

/** "Today" or "Yesterday" when that reads better than a date, otherwise nothing. */
export function nearDayLabel(key: DateKey, ref: DateKey = today()): string | undefined {
  const diff = daysBetween(ref, key)
  if (diff === 0) return 'Today'
  if (diff === -1) return 'Yesterday'
  return undefined
}

export function relativeDayLabel(key: DateKey, ref: DateKey = today()): string {
  const diff = daysBetween(ref, key)
  if (diff === 0) return 'Today'
  if (diff === -1) return 'Yesterday'
  if (diff === 1) return 'Tomorrow'
  return formatDay(key)
}
