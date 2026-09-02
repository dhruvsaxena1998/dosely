import { useSyncExternalStore } from 'react'
import type { DateKey } from '@/lib/dates'
import { maxKey, today } from '@/lib/dates'
import type { SlotId } from '@/lib/slots'
import { canResume, closureOf, groupMedicines, logKey, recordWindow } from '@/lib/schedule'
import type { Database, DoseState, MedicineInput, MedicineRecord } from '@/types'

const STORAGE_KEY = 'dosely.db.v1'

const EMPTY: Database = { version: 1, medicines: [], log: {} }

function newId(): string {
  return crypto.randomUUID()
}

function read(): Database {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return EMPTY
    const parsed = JSON.parse(raw) as Database
    if (parsed.version !== 1 || !Array.isArray(parsed.medicines)) return EMPTY
    return { version: 1, medicines: parsed.medicines, log: parsed.log ?? {} }
  } catch {
    return EMPTY
  }
}

let db: Database = read()
const listeners = new Set<() => void>()

function commit(next: Database) {
  db = next
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch (error) {
    console.error('Could not save to localStorage', error)
  }
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useDatabase(): Database {
  return useSyncExternalStore(subscribe, () => db)
}

export function getDatabase(): Database {
  return db
}

function recordsOf(groupId: string): MedicineRecord[] {
  return db.medicines.filter((m) => m.groupId === groupId)
}

function currentRecord(groupId: string): MedicineRecord | undefined {
  const records = recordsOf(groupId)
  if (records.length === 0) return undefined
  return records.reduce((latest, m) => (m.effectiveFrom >= latest.effectiveFrom ? m : latest))
}

export function addMedicine(input: MedicineInput): string {
  const groupId = newId()
  const record: MedicineRecord = {
    ...input,
    id: newId(),
    groupId,
    effectiveFrom: input.anchorDate,
    createdAt: new Date().toISOString(),
  }
  commit({ ...db, medicines: [...db.medicines, record] })
  return groupId
}

function scheduleChanged(a: MedicineRecord, b: MedicineInput): boolean {
  return (
    a.repeatEveryDays !== b.repeatEveryDays ||
    a.anchorDate !== b.anchorDate ||
    a.durationValue !== b.durationValue ||
    a.durationUnit !== b.durationUnit ||
    a.slots.length !== b.slots.length ||
    a.slots.some((s) => !b.slots.includes(s))
  )
}

/**
 * Name and note are cosmetic, so they rewrite every version — fixing a typo
 * should fix it everywhere. Anything that moves a dose forks a new version from
 * today instead, leaving the past exactly as it was prescribed.
 */
export function updateMedicine(groupId: string, input: MedicineInput) {
  const current = currentRecord(groupId)
  if (!current) return
  const now = today()

  if (!scheduleChanged(current, input)) {
    commit({
      ...db,
      medicines: db.medicines.map((m) =>
        m.groupId === groupId ? { ...m, name: input.name, note: input.note } : m,
      ),
    })
    return
  }

  const renamed = db.medicines.map((m) =>
    m.groupId === groupId ? { ...m, name: input.name, note: input.note } : m,
  )

  // A version that has not covered a past day yet has no history to protect.
  if (current.effectiveFrom >= now) {
    commit({
      ...db,
      medicines: renamed.map((m) =>
        m.id === current.id ? { ...m, ...input, effectiveFrom: input.anchorDate } : m,
      ),
    })
    return
  }

  const forkFrom = maxKey(now, input.anchorDate)
  // The lifecycle belongs to the medicine, not to one version of it, and
  // everything that asks reads it off the current version. A fork carrying none
  // would hand the group a blank one — which is how editing a stopped course
  // used to restart it, and editing a deleted one used to bring it back.
  const closure = closureOf(groupMedicines(recordsOf(groupId))[0], current)
  const stoppedOn = closure === 'stopped' ? current.closedOn : undefined
  const next: MedicineRecord = {
    ...input,
    id: newId(),
    groupId,
    effectiveFrom: forkFrom,
    closedOn: stoppedOn,
    closedBy: stoppedOn ? 'stopped' : undefined,
    deletedAt: current.deletedAt,
    createdAt: new Date().toISOString(),
  }
  commit({
    ...db,
    medicines: [
      // A version that is already closed keeps the date and the reason it closed
      // on. Restamping a stop as a supersede would drag its window forward and
      // schedule doses through a break the user asked for.
      ...renamed.map((m) =>
        m.id === current.id && !m.closedOn
          ? { ...m, closedOn: forkFrom, closedBy: 'superseded' as const }
          : m,
      ),
      next,
    ],
  })
}

export function stopMedicine(groupId: string) {
  const current = currentRecord(groupId)
  if (!current) return
  const now = today()
  commit({
    ...db,
    medicines: db.medicines.map((m) =>
      m.id === current.id ? { ...m, closedOn: now, closedBy: 'stopped' as const } : m,
    ),
  })
}

export function deleteMedicine(groupId: string) {
  const at = new Date().toISOString()
  commit({
    ...db,
    medicines: db.medicines.map((m) => (m.groupId === groupId ? { ...m, deletedAt: at } : m)),
  })
}

export function restoreMedicine(groupId: string) {
  commit({
    ...db,
    medicines: db.medicines.map((m) =>
      m.groupId === groupId ? { ...m, deletedAt: undefined } : m,
    ),
  })
}

/**
 * A stop, undone — by carrying on rather than by rewinding.
 *
 * The stop is not cleared. A new version of the same medicine opens from today
 * and the stopped one keeps the bounded window it was given, which leaves the
 * days in between owned by no version at all. Nothing covers them, so they
 * schedule no doses, sit in no denominator and are never marked missed: a
 * fortnight off reads as a fortnight off rather than as fourteen failures. The
 * alternative — clearing the stop and letting the derivation fill the gap in —
 * would convert a decision the user made into a stretch of neglect.
 *
 * The anchor and the duration come across untouched. The anchor keeps a weekly
 * course on the weekday it always used, and the duration keeps the course
 * ending when it was always going to end, so resuming never quietly extends a
 * prescription. It takes a hole out of the middle of one.
 */
export function resumeMedicine(groupId: string) {
  const group = groupMedicines(recordsOf(groupId))[0]
  const current = group?.current
  // Nothing to resume into once the original span has elapsed, and a version
  // owning an empty window is a record that means nothing. The card offers
  // Start again by then; this is the same rule, held where it cannot be skipped.
  if (!current || !canResume(group)) return
  const record: MedicineRecord = {
    id: newId(),
    groupId,
    name: current.name,
    note: current.note,
    slots: current.slots,
    repeatEveryDays: current.repeatEveryDays,
    anchorDate: current.anchorDate,
    durationValue: current.durationValue,
    durationUnit: current.durationUnit,
    effectiveFrom: today(),
    deletedAt: current.deletedAt,
    createdAt: new Date().toISOString(),
  }
  commit({ ...db, medicines: [...db.medicines, record] })
}

/** One dose's answer: a state to record, or null to take the entry away again. */
export interface DoseChange {
  groupId: string
  slot: SlotId
  state: DoseState | null
}

/**
 * The name to stamp an entry with: the one the version owning that date carries,
 * so a dose ticked on a past day is logged under what it was called then. Falls
 * back to the current version for a date no version owns, which is a dose being
 * answered outside its own course.
 */
function nameOn(groupId: string, date: DateKey): string {
  const record = db.medicines.find((m) => {
    if (m.groupId !== groupId) return false
    const w = recordWindow(m)
    return date >= w.from && date < w.to
  })
  return record?.name ?? currentRecord(groupId)?.name ?? 'Unknown'
}

export function setDose(groupId: string, date: DateKey, slot: SlotId, state: DoseState | null) {
  setDoses(date, [{ groupId, slot, state }])
}

/**
 * Every answer a single press produced, on one day, in one write. Four doses
 * filled from a slot heading are one trip through localStorage and one nudge to
 * the listeners, not four of each — and they share the timestamp, because they
 * are one act rather than four that happened to land in the same millisecond.
 */
export function setDoses(date: DateKey, changes: readonly DoseChange[]) {
  if (changes.length === 0) return
  const log = { ...db.log }
  const at = new Date().toISOString()
  for (const { groupId, slot, state } of changes) {
    const key = logKey(groupId, date, slot)
    if (state === null) delete log[key]
    else log[key] = { groupId, date, slot, state, at, name: nameOn(groupId, date) }
  }
  commit({ ...db, log })
}

export function exportDatabase(): string {
  return JSON.stringify(db, null, 2)
}

export function importDatabase(json: string): { ok: true } | { ok: false; error: string } {
  try {
    const parsed = JSON.parse(json) as Database
    if (parsed.version !== 1 || !Array.isArray(parsed.medicines)) {
      return { ok: false, error: 'That file is not a Dosely backup.' }
    }
    commit({ version: 1, medicines: parsed.medicines, log: parsed.log ?? {} })
    return { ok: true }
  } catch {
    return { ok: false, error: 'That file is not valid JSON.' }
  }
}
