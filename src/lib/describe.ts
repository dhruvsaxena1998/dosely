import type { DurationUnit } from '@/lib/dates'
import { formatShort, formatWithYear, shiftKey } from '@/lib/dates'
import type { MedicineGroup } from '@/lib/schedule'
import { groupSpan } from '@/lib/schedule'

export function describeRepeat(repeatEveryDays: number): string {
  if (repeatEveryDays === 1) return 'Daily'
  if (repeatEveryDays === 7) return 'Weekly'
  return `Every ${repeatEveryDays} days`
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
