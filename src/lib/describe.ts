import type { DurationUnit } from '@/lib/dates'
import { formatShort, formatWithYear, shiftKey } from '@/lib/dates'
import type { MedicineGroup } from '@/lib/schedule'
import { groupSpan } from '@/lib/schedule'
import type { Weekday } from '@/lib/weekdays'
import { WEEKDAYS, isEveryDay, sortWeekdays, weekdayShort } from '@/lib/weekdays'

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

/** The span reads inclusively, so a course ending before 6 Oct shows as "to 5 Oct". */
export function describeSpan(start: string, endExclusive: string): string {
  const lastDay = shiftKey(endExclusive, -1)
  return `${formatShort(start)} to ${formatWithYear(lastDay)}`
}

export function describeGroupSpan(g: MedicineGroup): string {
  const { start, end } = groupSpan(g)
  return describeSpan(start, end)
}
