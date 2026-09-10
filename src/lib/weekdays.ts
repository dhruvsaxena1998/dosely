import { getISODay } from 'date-fns'
import type { DateKey } from '@/lib/dates'
import { fromKey } from '@/lib/dates'

/**
 * ISO weekday: Monday is 1, Sunday is 7. Sorting a set ascending therefore puts
 * it in week order, and the week starts on Monday everywhere in the app — the
 * repeat picker, the describe text and the month grid all read from this list.
 */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7

export const WEEKDAYS: { id: Weekday; label: string; short: string }[] = [
  { id: 1, label: 'Monday', short: 'Mon' },
  { id: 2, label: 'Tuesday', short: 'Tue' },
  { id: 3, label: 'Wednesday', short: 'Wed' },
  { id: 4, label: 'Thursday', short: 'Thu' },
  { id: 5, label: 'Friday', short: 'Fri' },
  { id: 6, label: 'Saturday', short: 'Sat' },
  { id: 7, label: 'Sunday', short: 'Sun' },
]

export const EVERY_DAY: readonly Weekday[] = WEEKDAYS.map((d) => d.id)

export function weekdayOf(key: DateKey): Weekday {
  return getISODay(fromKey(key)) as Weekday
}

export function weekdayShort(day: Weekday): string {
  return WEEKDAYS[day - 1].short
}

/** Week order, no duplicates. The one shape a stored set is allowed to have. */
export function sortWeekdays(days: readonly Weekday[]): Weekday[] {
  return [...new Set(days)].sort((a, b) => a - b)
}

/** All seven days is the same as no filter at all, and is stored as none. */
export function isEveryDay(days: readonly Weekday[] | undefined): boolean {
  return !days || sortWeekdays(days).length === 7
}

/** What to store: the sorted set, or nothing when it would say every day. */
export function normalizeWeekdays(days: readonly Weekday[] | undefined): Weekday[] | undefined {
  return isEveryDay(days) ? undefined : sortWeekdays(days!)
}
