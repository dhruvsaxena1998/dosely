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

/**
 * Where a version's course ends, exclusive.
 *
 * A course measured in calendar ends where the calendar says and nothing you do
 * moves it. A course counted in doses ends where the count runs out, and the
 * count is spent by taking, so where it ends is a fact about the log as much as
 * about the record — which is why everything downstream of this takes the
 * database, and why `ref` matters: it is the line between what happened and
 * what is assumed to.
 */
export function courseEnd(db: Database, m: MedicineRecord, ref: DateKey = today()): DateKey {
  if (m.durationUnit !== 'doses') return courseEndFrom(m.anchorDate, m.durationValue, m.durationUnit)
  return countPlan(db, m, ref).end
}

interface CountPlan {
  /** The slots scheduled on every day the count reaches, in slot order, oldest day first. */
  days: Map<DateKey, SlotId[]>
  /** Exclusive. `effectiveFrom` when the count never lands anywhere. */
  end: DateKey
}

/**
 * The days a count of doses is spread over, and which slots each of them holds.
 *
 * A dose spends the count only by being taken. Ten tablets is ten tablets:
 * skipping Tuesday's does not swallow it and neither does forgetting it, so the
 * strip still holds ten less what actually went down, and the course runs on
 * until it is empty. Doses from `ref` onward have not been answered yet and are
 * projected as taken, which is what gives a course still under way a finite end
 * to print, walk to and set reminders against — and is why that end moves by a
 * day each time a dose does not happen.
 *
 * Ten doses at three slots a day is three days and one more, so the day the
 * count runs out on is partial: it keeps only the slots the count can pay for,
 * in slot order. Rounding it up would schedule a tablet that is not in the strip
 * and rounding it down would end the prescription early.
 *
 * Walked from `effectiveFrom` rather than from the anchor, which is what lets a
 * fork be handed the remainder and count it out from the day it opens. The
 * anchor still decides the phase, so an edit never moves a weekly course off its
 * weekday. The walk stops at `closedOn`: a version that was stopped or superseded
 * scheduled nothing past that day whatever was left in the strip, and what was
 * left is the fork's or the resumption's to carry.
 *
 * A walk rather than arithmetic, because there is no formula for what someone
 * did. It is reached from `isDoseDay` a few hundred times per month grid, so the
 * plan is worked out once per database, record and reference day and looked up
 * after that. The database is replaced on every write, so the cache empties
 * itself exactly when it should.
 */
function countPlan(db: Database, m: MedicineRecord, ref: DateKey): CountPlan {
  let byRecord = planCache.get(db)
  if (!byRecord) {
    byRecord = new WeakMap()
    planCache.set(db, byRecord)
  }
  let byRef = byRecord.get(m)
  if (!byRef) {
    byRef = new Map()
    byRecord.set(m, byRef)
  }
  const cached = byRef.get(ref)
  if (cached) return cached
  const plan = walkCount(db, m, ref)
  byRef.set(ref, plan)
  return plan
}

const planCache = new WeakMap<Database, WeakMap<MedicineRecord, Map<DateKey, CountPlan>>>()

function walkCount(db: Database, m: MedicineRecord, ref: DateKey): CountPlan {
  const days = new Map<DateKey, SlotId[]>()
  const slots = sortSlots(m.slots)
  let remaining = Math.floor(m.durationValue)
  let last: DateKey | undefined
  let cursor = slots.length > 0 && remaining > 0 ? nextPatternDay(m, m.effectiveFrom) : undefined
  while (cursor && remaining > 0 && (!m.closedOn || cursor < m.closedOn)) {
    const held = slots.slice(0, Math.min(slots.length, remaining))
    days.set(cursor, held)
    for (const slot of held) {
      const entry = lookupDose(db, m.groupId, cursor, slot)
      // Taken spends. Skipped and missed leave the tablet where it was. A dose
      // nobody has answered yet is assumed to be taken, but only from today on;
      // before today, no answer is a miss.
      if (entry ? entry.state === 'taken' : cursor >= ref) remaining -= 1
    }
    last = cursor
    cursor = nextPatternDay(m, shiftKey(cursor, 1))
  }
  return { days, end: last ? shiftKey(last, 1) : m.effectiveFrom }
}

/**
 * Whether the repeat and the weekdays land a dose on this date, with no regard
 * for how long the course runs.
 */
function onPattern(m: ScheduleShape, date: DateKey): boolean {
  const offset = daysBetween(m.anchorDate, date)
  if (offset < 0 || offset % m.repeatEveryDays !== 0) return false
  return !m.weekdays || m.weekdays.includes(weekdayOf(date))
}

/**
 * The first day on or after `from` that the pattern falls on.
 *
 * A plain repeat is one multiplication. A set of weekdays is walked from there,
 * one repeat at a time, and given up on after seven consecutive misses: seven
 * steps reach every weekday the cycle can, so a pattern still dry by then —
 * every 7 days from a Monday, filtered to Tuesdays — never fires at all. The
 * form never writes that shape, but an imported record can hold it.
 */
function nextPatternDay(m: ScheduleShape, from: DateKey): DateKey | undefined {
  const step = m.repeatEveryDays
  const gap = Math.max(0, daysBetween(m.anchorDate, from))
  let cursor = shiftKey(m.anchorDate, Math.ceil(gap / step) * step)
  if (!m.weekdays || isEveryDay(m.weekdays)) return cursor
  for (let dry = 0; dry < 7; dry += 1) {
    if (m.weekdays.includes(weekdayOf(cursor))) return cursor
    cursor = shiftKey(cursor, step)
  }
  return undefined
}

/** `[from, to)` — the dates this version is responsible for. */
export function recordWindow(db: Database, m: MedicineRecord, ref: DateKey = today()): { from: DateKey; to: DateKey } {
  const end = courseEnd(db, m, ref)
  const to = m.closedOn ? minKey(end, m.closedOn) : end
  return { from: m.effectiveFrom, to: maxKey(to, m.effectiveFrom) }
}

export function isDoseDay(db: Database, m: MedicineRecord, date: DateKey, ref: DateKey = today()): boolean {
  if (m.durationUnit === 'doses') return countPlan(db, m, ref).days.has(date)
  const { from, to } = recordWindow(db, m, ref)
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
export function slotsOn(db: Database, m: MedicineRecord, date: DateKey, ref: DateKey = today()): SlotId[] {
  if (m.durationUnit === 'doses') return countPlan(db, m, ref).days.get(date) ?? []
  return isDoseDay(db, m, date, ref) ? sortSlots(m.slots) : []
}

/**
 * What is left of a counted course before `date`, and nothing for a course
 * counted in days.
 *
 * Only what was actually taken has left the strip. Nothing before `date` is
 * assumed, so this is what a fork or a resumption opening on that day has to
 * carry — a dose still pending this morning is still in the packet.
 */
export function dosesLeft(db: Database, m: MedicineRecord, date: DateKey = today()): number | undefined {
  if (m.durationUnit !== 'doses') return undefined
  let taken = 0
  for (const [day, slots] of countPlan(db, m, date).days) {
    if (day >= date) break
    for (const slot of slots) {
      if (lookupDose(db, m.groupId, day, slot)?.state === 'taken') taken += 1
    }
  }
  return Math.max(0, Math.floor(m.durationValue) - taken)
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
export function groupSpan(db: Database, g: MedicineGroup, ref: DateKey = today()): { start: DateKey; end: DateKey } {
  let start = g.records[0].effectiveFrom
  let end = start
  for (const m of g.records) {
    const w = recordWindow(db, m, ref)
    start = minKey(start, w.from)
    end = maxKey(end, w.to)
  }
  return { start, end }
}

/** Exactly one version owns any given date, because their windows never overlap. */
export function recordForDate(db: Database, g: MedicineGroup, date: DateKey, ref: DateKey = today()): MedicineRecord | undefined {
  return g.records.find((m) => {
    const { from, to } = recordWindow(db, m, ref)
    return date >= from && date < to
  })
}

export function scheduledSlotsOn(db: Database, g: MedicineGroup, date: DateKey, ref: DateKey = today()): SlotId[] {
  const record = recordForDate(db, g, date, ref)
  return record ? slotsOn(db, record, date, ref) : []
}

export function nextDueDate(db: Database, g: MedicineGroup, from: DateKey = today()): DateKey | undefined {
  const { start, end } = groupSpan(db, g, from)
  let cursor = maxKey(from, start)
  while (cursor < end) {
    if (scheduledSlotsOn(db, g, cursor, from).length > 0) return cursor
    cursor = shiftKey(cursor, 1)
  }
  return undefined
}

/** The last date this medicine ever schedules a dose, scanning back from its end. */
export function lastDueDate(db: Database, g: MedicineGroup, ref: DateKey = today()): DateKey | undefined {
  const { start, end } = groupSpan(db, g, ref)
  let cursor = shiftKey(end, -1)
  while (cursor >= start) {
    if (scheduledSlotsOn(db, g, cursor, ref).length > 0) return cursor
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
    const last = lastDueDate(db, g, ref)
    if (last) horizon = maxKey(horizon, last)
  }
  return horizon
}

export type CourseStatus = 'upcoming' | 'active' | 'stopped' | 'finished'

/**
 * The day a course was finished early, and nothing for a course that was not.
 *
 * Finishing says today was the last day of the course, so the window it writes
 * closes after today and the day it was pressed on is the day before it.
 */
function completedOn(g: MedicineGroup): DateKey | undefined {
  const closed = g.current.closedOn
  if (!closed || closureOf(g, g.current) !== 'completed') return undefined
  return shiftKey(closed, -1)
}

export function courseStatus(db: Database, g: MedicineGroup, ref: DateKey = today()): CourseStatus {
  const { start, end } = groupSpan(db, g, ref)
  if (ref < start) return 'upcoming'
  // A course finished early is finished from the moment it was finished, and its
  // window still holds the rest of that day. The two are not in conflict: today's
  // doses are part of the course, and the course is over.
  const done = completedOn(g)
  if (done && ref >= done) return 'finished'
  if (ref < end) return 'active'
  // Past its end, so it either ran out or was ended early. Which of those it was
  // is a fact the record states rather than something inferred from the date —
  // an edit closes a version too, and that must never read as a stop.
  const closed = g.current.closedOn
  if (!closed || closureOf(g, g.current) !== 'stopped') return 'finished'
  // A stop landing on or after the day the course was going to end anyway cut
  // nothing short. Abandoned and completed stay worth telling apart. For a
  // count, the same question is whether the strip still had anything in it on
  // the day of the stop.
  const left = dosesLeft(db, g.current, closed)
  if (left !== undefined) return left > 0 ? 'stopped' : 'finished'
  return closed < courseEnd(db, g.current, ref) ? 'stopped' : 'finished'
}

/**
 * Whether a stopped course still has somewhere to go.
 *
 * A stop cuts a course short, and what is left of it is the stretch between now
 * and the end the course was always going to have. Once that has passed there is
 * nothing to resume into — a version opened today would own an empty window —
 * so a course stopped and then left alone until its span ran out is asked to be
 * started again rather than resumed.
 *
 * What is left of a counted course is doses rather than days, and no amount of
 * waiting spends those, so the same question is asked of the strip instead.
 */
export function canResume(db: Database, g: MedicineGroup, ref: DateKey = today()): boolean {
  if (courseStatus(db, g, ref) !== 'stopped') return false
  const left = dosesLeft(db, g.current, ref)
  return left === undefined ? ref < courseEnd(db, g.current, ref) : left > 0
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
 * again tomorrow would only be nagging — though for a counted course the
 * tablet is still in the strip, and the schedule has already grown a day for it.
 */
export function nextOpenDate(db: Database, g: MedicineGroup, from: DateKey = today()): DateKey | undefined {
  const { start, end } = groupSpan(db, g, from)
  let cursor = maxKey(from, start)
  while (cursor < end) {
    const slots = scheduledSlotsOn(db, g, cursor, from)
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
    const record = recordForDate(db, g, date, ref)
    if (!record) continue
    for (const slot of slotsOn(db, record, date, ref)) {
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
    const span = groupSpan(db, g, ref)
    const start = maxKey(from, span.start)
    const end = minKey(to, span.end)
    for (let cursor = start; cursor < end; cursor = shiftKey(cursor, 1)) {
      const slots = scheduledSlotsOn(db, g, cursor, ref)
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
  for (const { date, slot } of doseHistory(db, g, ref)) {
    tally.total += 1
    const entry = lookupDose(db, g.groupId, date, slot)
    if (entry) tally[entry.state] += 1
    else if (date < ref) tally.missed += 1
    else tally.pending += 1
  }
  return tally
}

/** Every dose the medicine has ever scheduled, across all its versions. */
export function doseHistory(db: Database, g: MedicineGroup, ref: DateKey = today()): { date: DateKey; slot: SlotId }[] {
  const out: { date: DateKey; slot: SlotId }[] = []
  const { start, end } = groupSpan(db, g, ref)
  for (let cursor = start; cursor < end; cursor = shiftKey(cursor, 1)) {
    for (const slot of scheduledSlotsOn(db, g, cursor, ref)) out.push({ date: cursor, slot })
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
