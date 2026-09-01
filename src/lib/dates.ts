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
