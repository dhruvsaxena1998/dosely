import type { DateKey } from '@/lib/dates'
import { courseEndFrom, daysBetween, maxKey, minKey, shiftKey, today } from '@/lib/dates'
import type { SlotId } from '@/lib/slots'
import { sortSlots } from '@/lib/slots'
import type { Weekday } from '@/lib/weekdays'
import { isEveryDay, sortWeekdays, weekdayOf } from '@/lib/weekdays'
import type { Closure, DoseLogEntry, DoseState, Database, MedicineRecord } from '@/types'

/** All versions of one medicine, oldest first. */
export interface MedicineGroup {
  groupId: string
  /** The version in effect now, or the last one that was. */
  current: MedicineRecord
  records: MedicineRecord[]
}

export function courseEnd(m: MedicineRecord): DateKey {
  if (m.durationUnit !== 'doses') return courseEndFrom(m.anchorDate, m.durationValue, m.durationUnit)
  const { lastDay } = countPlan(m)
  return lastDay ? shiftKey(lastDay, 1) : m.effectiveFrom
}

/**
 * Where a count of doses runs out: the day the last one falls on, and how many
 * of that day's slots are left to hold it.
 *
 * Ten doses at three slots a day is three days and one more dose, so the fourth
 * dose day is partial. Rounding it up would schedule two tablets that are not in
 * the strip and rounding it down would end the prescription early, so the last
 * day keeps only the slots the count can pay for.
 *
 * Counted from `effectiveFrom` rather than from the anchor, which is what lets a
 * fork be handed the remainder and count it out from the day it opens. The
 * anchor still decides the phase, so an edit never moves a weekly course off its
 * weekday.
 */
function countPlan(m: MedicineRecord): { lastDay?: DateKey; lastDaySlots: number } {
  const perDay = m.slots.length
  const count = Math.floor(m.durationValue)
  if (perDay < 1 || count < 1) return { lastDaySlots: 0 }
  const rest = count % perDay
  const days = Math.floor(count / perDay) + (rest > 0 ? 1 : 0)
  return { lastDay: nthPatternDay(m, m.effectiveFrom, days), lastDaySlots: rest === 0 ? perDay : rest }
}

/**
 * Whether the repeat and the weekdays land a dose on this date, with no regard
 * for how long the course runs. The half of `isDoseDay` that a count is allowed
 * to ask, because asking the other half would mean knowing the end of a course
 * in order to work out the end of a course.
 */
function onPattern(m: ScheduleShape, date: DateKey): boolean {
  const offset = daysBetween(m.anchorDate, date)
  if (offset < 0 || offset % m.repeatEveryDays !== 0) return false
  return !m.weekdays || m.weekdays.includes(weekdayOf(date))
}

/**
 * The nth day on or after `from` that the pattern falls on, counting from one.
 *
 * Arithmetic rather than a walk, because this is reached from `courseEnd`, which
 * is reached from `isDoseDay`, which a month of grid cells calls a few hundred
 * times. A plain repeat is one multiplication. A set of weekdays is a whole
 * number of weeks plus an offset from the cycle of chosen days.
 *
 * The third case is a repeat above one combined with a weekday set, which the
 * form never writes and an imported record can still hold. It is walked, one
 * repeat at a time, and given up on after seven consecutive misses: seven steps
 * cover every weekday the cycle can reach, so a pattern still dry by then —
 * every 7 days from a Monday, filtered to Tuesdays — never fires at all.
 */
function nthPatternDay(m: ScheduleShape, from: DateKey, n: number): DateKey | undefined {
  if (n < 1) return undefined
  const step = m.repeatEveryDays
  const gap = Math.max(0, daysBetween(m.anchorDate, from))
  const first = shiftKey(m.anchorDate, Math.ceil(gap / step) * step)
  if (!m.weekdays || isEveryDay(m.weekdays)) return shiftKey(first, (n - 1) * step)
  if (step === 1) {
    const start = weekdayOf(first)
    const offsets = sortWeekdays(m.weekdays)
      .map((d) => (d - start + 7) % 7)
      .sort((a, b) => a - b)
    return shiftKey(first, Math.floor((n - 1) / offsets.length) * 7 + offsets[(n - 1) % offsets.length])
  }
  let cursor = first
  let dry = 0
  let seen = 0
  while (dry < 7) {
    if (m.weekdays.includes(weekdayOf(cursor))) {
      seen += 1
      if (seen === n) return cursor
      dry = 0
    } else dry += 1
    cursor = shiftKey(cursor, step)
  }
  return undefined
}

/** `[from, to)` — the dates this version is responsible for. */
export function recordWindow(m: MedicineRecord): { from: DateKey; to: DateKey } {
  const to = m.closedOn ? minKey(courseEnd(m), m.closedOn) : courseEnd(m)
  return { from: m.effectiveFrom, to: maxKey(to, m.effectiveFrom) }
}

export function isDoseDay(m: MedicineRecord, date: DateKey): boolean {
  const { from, to } = recordWindow(m)
  if (date < from || date >= to) return false
  return onPattern(m, date)
}

/**
 * The slots this version schedules on a date, in slot order, and empty on a day
 * it schedules nothing.
 *
 * The one place a partial day exists. Everything that asks what a day holds asks
 * here, so the Today screen, the tallies and the history cannot disagree about
 * the day a count runs out on.
 */
export function slotsOn(m: MedicineRecord, date: DateKey): SlotId[] {
  if (!isDoseDay(m, date)) return []
  const slots = sortSlots(m.slots)
  if (m.durationUnit !== 'doses') return slots
  const plan = countPlan(m)
  return date === plan.lastDay ? slots.slice(0, plan.lastDaySlots) : slots
}

/**
 * How many doses this version has scheduled before `date`, which for a counted
 * course is how much of the count is spent. What was ticked has nothing to do
 * with it: a missed dose is a missed dose, not a tablet still owed.
 */
export function dosesBefore(m: MedicineRecord, date: DateKey): number {
  const { from, to } = recordWindow(m)
  let spent = 0
  for (let cursor = from; cursor < to && cursor < date; cursor = shiftKey(cursor, 1)) {
    spent += slotsOn(m, cursor).length
  }
  return spent
}

/** What is left of a counted course, and nothing for a course counted in days. */
export function dosesLeft(m: MedicineRecord, date: DateKey = today()): number | undefined {
  if (m.durationUnit !== 'doses') return undefined
  return Math.max(0, Math.floor(m.durationValue) - dosesBefore(m, date))
}

/** The fields that decide which days and slots a version schedules. */
export type ScheduleShape = Pick<
  MedicineRecord,
  'slots' | 'repeatEveryDays' | 'weekdays' | 'anchorDate' | 'durationValue' | 'durationUnit'
>

/**
 * Whether two schedules produce the same doses. Compared on what they schedule
 * rather than how they are written, because the same week can be spelled two
 * ways: a record saved before weekdays existed says "every 7 days", and the form
 * now says "Tuesdays". Reading either as a change would fork a version the user
 * never edited. Every-day is likewise the same whether the set is written out or
 * left off.
 */
export function sameSchedule(a: ScheduleShape, b: ScheduleShape): boolean {
  const x = repeatOf(a)
  const y = repeatOf(b)
  return (
    a.anchorDate === b.anchorDate &&
    a.durationValue === b.durationValue &&
    a.durationUnit === b.durationUnit &&
    a.slots.length === b.slots.length &&
    a.slots.every((s) => b.slots.includes(s)) &&
    x.every === y.every &&
    x.days.length === y.days.length &&
    x.days.every((d, i) => d === y.days[i])
  )
}

function repeatOf(s: ScheduleShape): { every: number; days: Weekday[] } {
  if (s.repeatEveryDays === 7 && !s.weekdays) return { every: 1, days: [weekdayOf(s.anchorDate)] }
  if (s.repeatEveryDays !== 1 || isEveryDay(s.weekdays)) return { every: s.repeatEveryDays, days: [] }
  return { every: 1, days: sortWeekdays(s.weekdays!) }
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
  return record ? slotsOn(record, date) : []
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

/**
 * Whether a stopped course still has somewhere to go.
 *
 * A stop cuts a course short, and what is left of it is the stretch between now
 * and the end the course was always going to have. Once that has passed there is
 * nothing to resume into — a version opened today would own an empty window —
 * so a course stopped and then left alone until its span ran out is asked to be
 * started again rather than resumed.
 */
export function canResume(g: MedicineGroup, ref: DateKey = today()): boolean {
  if (courseStatus(g, ref) !== 'stopped') return false
  // A counted course has doses left rather than days left, and a pause spends
  // neither. It can be resumed for as long as there is anything in the strip.
  const left = dosesLeft(g.current, ref)
  return left === undefined ? ref < courseEnd(g.current) : left > 0
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
  return dosesOnFor(
    db,
    groupMedicines(db.medicines).filter((g) => !isDeleted(g)),
    date,
    ref,
  )
}

/**
 * The same, over a chosen set of medicines. Today hides what was deleted;
 * History does not, because a dose taken is a dose taken whatever happened to
 * the course afterwards. Which set to read is the caller's call.
 */
export function dosesOnFor(db: Database, groups: readonly MedicineGroup[], date: DateKey, ref: DateKey = today()): Dose[] {
  const doses: Dose[] = []
  for (const g of groups) {
    const record = recordForDate(g, date)
    if (!record) continue
    for (const slot of slotsOn(record, date)) {
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

/** One day's doses across a set of medicines, counted by what became of them. */
export interface DayTally {
  scheduled: number
  taken: number
  skipped: number
  missed: number
  pending: number
}

/**
 * Every day in `[from, to)` that any of the groups schedules something on,
 * tallied. Days with nothing scheduled are left out, so a lookup that misses
 * means a blank cell.
 */
export function dayTallies(
  db: Database,
  groups: readonly MedicineGroup[],
  from: DateKey,
  to: DateKey,
  ref: DateKey = today(),
): Map<DateKey, DayTally> {
  const out = new Map<DateKey, DayTally>()
  for (const g of groups) {
    const span = groupSpan(g)
    const start = maxKey(from, span.start)
    const end = minKey(to, span.end)
    for (let cursor = start; cursor < end; cursor = shiftKey(cursor, 1)) {
      const slots = scheduledSlotsOn(g, cursor)
      if (slots.length === 0) continue
      const tally = out.get(cursor) ?? { scheduled: 0, taken: 0, skipped: 0, missed: 0, pending: 0 }
      for (const slot of slots) {
        tally.scheduled += 1
        const entry = lookupDose(db, g.groupId, cursor, slot)
        if (entry) tally[entry.state] += 1
        else if (cursor < ref) tally.missed += 1
        else tally.pending += 1
      }
      out.set(cursor, tally)
    }
  }
  return out
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

/** What a press on a whole slot heading does. */
export type SlotAction = 'fill' | 'clear'

/**
 * What a press on a whole slot would do, and undefined where a slot offers no
 * bulk control at all.
 *
 * A slot of one is already one press, so the heading would only be a second
 * target for the same act. Otherwise a slot with anything left unanswered fills,
 * and a slot that is entirely taken clears back.
 *
 * A skip is a decision, and the two halves of this control treat it the same
 * way: filling steps over it, and clearing never takes it away. That leaves a
 * slot holding one with no symmetric clear to offer — everything a clear could
 * undo, it would have to leave behind — so it keeps offering the fill, which by
 * then has nothing left to do and is the idempotent no-op it always was.
 */
export function slotAction(doses: readonly Dose[]): SlotAction | undefined {
  if (doses.length < 2) return undefined
  if (doses.some((d) => d.outcome === 'skipped')) return 'fill'
  return doses.every((d) => d.outcome === 'taken') ? 'clear' : 'fill'
}

/** The doses a press would actually write, which is never the whole slot. */
export function slotTargets(doses: readonly Dose[], action: SlotAction): Dose[] {
  return doses.filter((d) => (action === 'fill' ? !d.entry : d.outcome === 'taken'))
}
