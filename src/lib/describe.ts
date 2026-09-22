import type { DateKey, DurationUnit } from '@/lib/dates'
import { formatShort, formatWithYear, shiftKey, today } from '@/lib/dates'
import type { Adherence, MedicineGroup } from '@/lib/schedule'
import { adherenceFor, groupSpan } from '@/lib/schedule'
import type { Weekday } from '@/lib/weekdays'
import { WEEKDAYS, isEveryDay, sortWeekdays, weekdayShort } from '@/lib/weekdays'
import type { Database } from '@/types'

const WEEKDAYS_ONLY: readonly Weekday[] = [1, 2, 3, 4, 5]
const WEEKEND: readonly Weekday[] = [6, 7]

/**
 * How often, in as few words as the shape allows. A set of six reads by the day
 * it leaves out, because "Daily except Tue" is how the prescription was said.
 */
export function describeRepeat(m: { repeatEveryDays: number; weekdays?: readonly Weekday[] }): string {
  if (m.repeatEveryDays === 7 && !m.weekdays) return 'Weekly'
  if (m.repeatEveryDays !== 1) return `Every ${m.repeatEveryDays} days`
  if (isEveryDay(m.weekdays)) return 'Daily'
  const days = sortWeekdays(m.weekdays!)
  if (sameDays(days, WEEKDAYS_ONLY)) return 'Weekdays'
  if (sameDays(days, WEEKEND)) return 'Weekends'
  if (days.length === 6) {
    const missing = ([1, 2, 3, 4, 5, 6, 7] as Weekday[]).find((d) => !days.includes(d))!
    return `Daily except ${weekdayShort(missing)}`
  }
  if (days.length === 1) return `${WEEKDAYS[days[0] - 1].label}s`
  return sentenceList(days.map(weekdayShort))
}

function sameDays(a: readonly Weekday[], b: readonly Weekday[]): boolean {
  return a.length === b.length && a.every((d, i) => d === b[i])
}

export function sentenceList(parts: readonly string[]): string {
  if (parts.length < 2) return parts.join('')
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
}

export function describeDuration(value: number, unit: DurationUnit): string {
  const noun = value === 1 ? unit.slice(0, -1) : unit
  return `${value} ${noun}`
}

/**
 * How long a course is, in the unit it was prescribed in.
 *
 * A counted course is asked of the whole group rather than of the current
 * version, because an edit hands the fork what is left: five doses on the record
 * of a course that was written for twenty is the remainder, not the
 * prescription. Adding the versions back up says twenty, which is what the
 * person was told and what the card should say.
 *
 * What is added up is the doses the strip holds — taken, or still to come —
 * rather than every dose the course ever scheduled. A dose skipped or missed
 * stays in the packet and the schedule grows a day for it, so counting the
 * scheduled days would say twelve of a strip of ten. A course counted in
 * calendar reads straight off the record and walks nothing.
 */
export function describeLength(db: Database, g: MedicineGroup, ref: DateKey = today()): string {
  const m = g.current
  if (m.durationUnit !== 'doses') return describeDuration(m.durationValue, m.durationUnit)
  const tally = adherenceFor(db, g, ref)
  return describeDuration(tally.taken + tally.pending, 'doses')
}

/** The span reads inclusively, so a course ending before 6 Oct shows as "to 5 Oct". */
export function describeSpan(start: string, endExclusive: string): string {
  const lastDay = shiftKey(endExclusive, -1)
  return `${formatShort(start)} to ${formatWithYear(lastDay)}`
}

export function describeGroupSpan(db: Database, g: MedicineGroup, ref: DateKey = today()): string {
  const { start, end } = groupSpan(db, g, ref)
  return describeSpan(start, end)
}

/**
 * What became of a set of doses, in words. The month grid's cells and the
 * medicine list's pockets are both drawn from a tally and neither has room to
 * print one, so this is the only thing a screen reader gets and it says the
 * whole count rather than the fill it was reduced to.
 *
 * A count of nothing is left out, so a course with no skips never mentions
 * skipping.
 */
export function describeTally(t: Adherence): string {
  const parts: string[] = []
  if (t.taken) parts.push(`${t.taken} taken`)
  if (t.skipped) parts.push(`${t.skipped} skipped`)
  if (t.missed) parts.push(`${t.missed} missed`)
  if (t.pending) parts.push(`${t.pending} due`)
  return `${parts.join(', ')} of ${t.total}`
}
