import type { DateKey } from '@/lib/dates'
import { courseEndFrom, daysBetween, maxKey, minKey, shiftKey, today } from '@/lib/dates'
import type { SlotId } from '@/lib/slots'
import { sortSlots } from '@/lib/slots'
import type { Closure, DoseLogEntry, DoseState, Database, MedicineRecord } from '@/types'

/** All versions of one medicine, oldest first. */
export interface MedicineGroup {
  groupId: string
  /** The version in effect now, or the last one that was. */
  current: MedicineRecord
  records: MedicineRecord[]
}

export function courseEnd(m: MedicineRecord): DateKey {
  return courseEndFrom(m.anchorDate, m.durationValue, m.durationUnit)
}

/** `[from, to)` — the dates this version is responsible for. */
export function recordWindow(m: MedicineRecord): { from: DateKey; to: DateKey } {
  const to = m.closedOn ? minKey(courseEnd(m), m.closedOn) : courseEnd(m)
  return { from: m.effectiveFrom, to: maxKey(to, m.effectiveFrom) }
}

export function isDoseDay(m: MedicineRecord, date: DateKey): boolean {
  const { from, to } = recordWindow(m)
  if (date < from || date >= to) return false
  const offset = daysBetween(m.anchorDate, date)
  return offset >= 0 && offset % m.repeatEveryDays === 0
}

export function groupMedicines(medicines: readonly MedicineRecord[]): MedicineGroup[] {
  const byGroup = new Map<string, MedicineRecord[]>()
  for (const m of medicines) {
    const list = byGroup.get(m.groupId)
    if (list) list.push(m)
    else byGroup.set(m.groupId, [m])
  }
  const groups: MedicineGroup[] = []
  for (const [groupId, records] of byGroup) {
    records.sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? -1 : a.effectiveFrom > b.effectiveFrom ? 1 : 0))
    groups.push({ groupId, current: records[records.length - 1], records })
  }
  groups.sort((a, b) => a.current.name.localeCompare(b.current.name))
  return groups
}

export function isDeleted(g: MedicineGroup): boolean {
  return Boolean(g.current.deletedAt)
}

/**
 * Why a version is closed, and undefined when it is not.
 *
 * Records written before the two closures were named apart carry only a date.
 * The distinction is reconstructed from the shape the group has always had:
 * superseding a version is what puts another one after it, so a closed version
 * with a later version was superseded, and a closed version that is the group's
 * last was the user stopping the course.
 */
export function closureOf(g: MedicineGroup, m: MedicineRecord): Closure | undefined {
  if (!m.closedOn) return undefined
  return m.closedBy ?? (m.id === g.current.id ? 'stopped' : 'superseded')
}

/** `[start, end)` across every version of the medicine. */
export function groupSpan(g: MedicineGroup): { start: DateKey; end: DateKey } {
  let start = g.records[0].effectiveFrom
  let end = start
  for (const m of g.records) {
    const w = recordWindow(m)
    start = minKey(start, w.from)
    end = maxKey(end, w.to)
  }
  return { start, end }
}

/** Exactly one version owns any given date, because their windows never overlap. */
export function recordForDate(g: MedicineGroup, date: DateKey): MedicineRecord | undefined {
  return g.records.find((m) => {
    const { from, to } = recordWindow(m)
    return date >= from && date < to
  })
}

export function scheduledSlotsOn(g: MedicineGroup, date: DateKey): SlotId[] {
  const record = recordForDate(g, date)
  if (!record || !isDoseDay(record, date)) return []
  return sortSlots(record.slots)
}

export function nextDueDate(g: MedicineGroup, from: DateKey = today()): DateKey | undefined {
  const { start, end } = groupSpan(g)
  let cursor = maxKey(from, start)
  while (cursor < end) {
    if (scheduledSlotsOn(g, cursor).length > 0) return cursor
    cursor = shiftKey(cursor, 1)
  }
  return undefined
}

/** The last date this medicine ever schedules a dose, scanning back from its end. */
export function lastDueDate(g: MedicineGroup): DateKey | undefined {
  const { start, end } = groupSpan(g)
  let cursor = shiftKey(end, -1)
  while (cursor >= start) {
    if (scheduledSlotsOn(g, cursor).length > 0) return cursor
    cursor = shiftKey(cursor, -1)
  }
  return undefined
}

/**
 * How far forward it is worth looking. Past this date every course has run out,
 * so there is nothing to show and the Today screen stops walking. Never earlier
 * than `ref`, so the horizon is a date you can always reach.
 */
export function scheduleHorizon(db: Database, ref: DateKey = today()): DateKey {
  let horizon = ref
  for (const g of groupMedicines(db.medicines)) {
    if (isDeleted(g)) continue
    const last = lastDueDate(g)
    if (last) horizon = maxKey(horizon, last)
  }
  return horizon
}

export type CourseStatus = 'upcoming' | 'active' | 'stopped' | 'finished'

export function courseStatus(g: MedicineGroup, ref: DateKey = today()): CourseStatus {
  const { start, end } = groupSpan(g)
  if (ref < start) return 'upcoming'
  if (ref < end) return 'active'
  // Past its end, so it either ran out or was ended early. Which of those it was
  // is a fact the record states rather than something inferred from the date —
  // an edit closes a version too, and that must never read as a stop.
  const closed = g.current.closedOn
  if (!closed || closureOf(g, g.current) !== 'stopped') return 'finished'
  // A stop landing on or after the day the course was going to end anyway cut
  // nothing short. Abandoned and completed stay worth telling apart.
  return closed < courseEnd(g.current) ? 'stopped' : 'finished'
}

export function logKey(groupId: string, date: DateKey, slot: SlotId): string {
  return `${groupId}|${date}|${slot}`
}

export function lookupDose(db: Database, groupId: string, date: DateKey, slot: SlotId): DoseLogEntry | undefined {
  return db.log[logKey(groupId, date, slot)]
}

/**
 * The next date this medicine still wants something from you: scheduled, and
 * with at least one slot not yet ticked. `nextDueDate` answers what the
 * schedule says, which stays true whatever you do; this answers what is left of
 * it, which is the claim a card makes when it says a dose is due.
 *
 * A skipped dose counts as answered. The decision has been made, and asking
 * again tomorrow would only be nagging.
 */
export function nextOpenDate(db: Database, g: MedicineGroup, from: DateKey = today()): DateKey | undefined {
  const { start, end } = groupSpan(g)
  let cursor = maxKey(from, start)
  while (cursor < end) {
    const slots = scheduledSlotsOn(g, cursor)
    if (slots.some((slot) => !lookupDose(db, g.groupId, cursor, slot))) return cursor
    cursor = shiftKey(cursor, 1)
  }
  return undefined
}

export type DoseOutcome = DoseState | 'missed' | 'pending'

export interface Dose {
  group: MedicineGroup
  name: string
  note?: string
  date: DateKey
  slot: SlotId
  outcome: DoseOutcome
  entry?: DoseLogEntry
}

/**
 * Every dose scheduled on `date`, in slot order then name order. Doses on a past
 * day with no entry are missed; on today or later they are still pending.
 */
export function dosesOn(db: Database, date: DateKey, ref: DateKey = today()): Dose[] {
  const doses: Dose[] = []
  for (const g of groupMedicines(db.medicines)) {
    if (isDeleted(g)) continue
    const record = recordForDate(g, date)
    if (!record || !isDoseDay(record, date)) continue
    for (const slot of sortSlots(record.slots)) {
      const entry = lookupDose(db, g.groupId, date, slot)
      doses.push({
        group: g,
        name: record.name,
        note: record.note,
        date,
        slot,
        entry,
        outcome: entry ? entry.state : date < ref ? 'missed' : 'pending',
      })
    }
  }
  return doses
}

export interface Adherence {
  taken: number
  skipped: number
  missed: number
  pending: number
  total: number
}

export function adherenceFor(db: Database, g: MedicineGroup, ref: DateKey = today()): Adherence {
  const tally: Adherence = { taken: 0, skipped: 0, missed: 0, pending: 0, total: 0 }
  for (const { date, slot } of doseHistory(g)) {
    tally.total += 1
    const entry = lookupDose(db, g.groupId, date, slot)
    if (entry) tally[entry.state] += 1
    else if (date < ref) tally.missed += 1
    else tally.pending += 1
  }
  return tally
}

/** Every dose the medicine has ever scheduled, across all its versions. */
export function doseHistory(g: MedicineGroup): { date: DateKey; slot: SlotId }[] {
  const out: { date: DateKey; slot: SlotId }[] = []
  const { start, end } = groupSpan(g)
  for (let cursor = start; cursor < end; cursor = shiftKey(cursor, 1)) {
    for (const slot of scheduledSlotsOn(g, cursor)) out.push({ date: cursor, slot })
  }
  return out
}
