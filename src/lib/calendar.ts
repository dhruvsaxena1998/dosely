import { addMonths, format, startOfMonth } from 'date-fns'
import type { DateKey } from '@/lib/dates'
import { fromKey, shiftKey, toKey } from '@/lib/dates'
import type { Adherence, DayTally } from '@/lib/schedule'
import { weekdayOf } from '@/lib/weekdays'

/** A calendar month as `YYYY-MM`. */
export type MonthKey = string

export function monthOf(key: DateKey): MonthKey {
  return key.slice(0, 7)
}

export function monthStart(month: MonthKey): DateKey {
  return `${month}-01`
}

/** Exclusive: the first day of the following month. */
export function monthEnd(month: MonthKey): DateKey {
  return toKey(addMonths(fromKey(monthStart(month)), 1))
}

export function shiftMonth(month: MonthKey, by: number): MonthKey {
  return monthOf(toKey(addMonths(startOfMonth(fromKey(monthStart(month))), by)))
}

export function formatMonth(month: MonthKey): string {
  return format(fromKey(monthStart(month)), 'MMMM yyyy')
}

export function clampMonth(month: MonthKey, first: MonthKey, last: MonthKey): MonthKey {
  return month < first ? first : month > last ? last : month
}

/**
 * The month laid out as rows of seven, Monday first. `lead` is how many blank
 * cells sit before the 1st so that every date lands under its weekday.
 */
export function monthCells(month: MonthKey): { lead: number; days: DateKey[] } {
  const start = monthStart(month)
  const end = monthEnd(month)
  const days: DateKey[] = []
  for (let cursor = start; cursor < end; cursor = shiftKey(cursor, 1)) days.push(cursor)
  return { lead: weekdayOf(start) - 1, days }
}

/**
 * How a day's pocket is drawn. Four fills between empty and full, carried by
 * the theme's one confident colour, plus the two states the rest of the app
 * already draws: a skip in its own colour, and a miss as the neutral hatch.
 *
 * `none` is a day with nothing scheduled and `pending` a day with nothing
 * answered yet; both are recessed and neither is a button.
 */
export type DayFill = 'none' | 'pending' | 'missed' | 'skipped' | 'low' | 'high' | 'full'

/**
 * Taken over taken plus missed. Skipped and pending are left out of the
 * denominator: a skip is a decision and a pending dose is not a lapse, and a
 * cell that pales every morning before lunch teaches you to ignore it.
 */
export function dayFill(t: DayTally): DayFill {
  if (t.scheduled === 0) return 'none'
  const answered = t.taken + t.missed
  if (answered === 0) return t.skipped > 0 ? 'skipped' : 'pending'
  if (t.taken === 0) return 'missed'
  if (t.taken === answered) return 'full'
  return t.taken * 2 >= answered ? 'high' : 'low'
}

/**
 * The same four steps read over a whole course rather than a day, which is what
 * the pocket on a medicine card draws. One tally is the other with a different
 * word for the total, so the rule is not restated here: a course that has gone
 * well is the same fill as a day that went well, and it always will be.
 */
export function courseFill(a: Adherence): DayFill {
  return dayFill({ ...a, scheduled: a.total })
}

/** Whether a cell has anything behind it worth opening. */
export function dayOpens(t: DayTally | undefined): boolean {
  if (!t || t.scheduled === 0) return false
  return t.taken + t.skipped + t.missed > 0
}
