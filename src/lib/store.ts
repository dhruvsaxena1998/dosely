import { useSyncExternalStore } from 'react'
import type { DateKey } from '@/lib/dates'
import { maxKey, today } from '@/lib/dates'
import type { SlotId } from '@/lib/slots'
import { closureOf, groupMedicines, logKey, recordWindow } from '@/lib/schedule'
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

/** Same medicine, fresh course, new group so the old history stays sealed. */
export function restartMedicine(groupId: string, startDate: DateKey): string | undefined {
  const current = currentRecord(groupId)
  if (!current) return undefined
  return addMedicine({
    name: current.name,
    note: current.note,
    slots: current.slots,
    repeatEveryDays: current.repeatEveryDays,
    anchorDate: startDate,
    durationValue: current.durationValue,
    durationUnit: current.durationUnit,
  })
}

export function setDose(groupId: string, date: DateKey, slot: SlotId, state: DoseState | null) {
  const key = logKey(groupId, date, slot)
  const log = { ...db.log }
  if (state === null) {
    delete log[key]
  } else {
    const record = db.medicines.find((m) => {
      if (m.groupId !== groupId) return false
      const w = recordWindow(m)
      return date >= w.from && date < w.to
    })
    log[key] = {
      groupId,
      date,
      slot,
      state,
      at: new Date().toISOString(),
      name: record?.name ?? currentRecord(groupId)?.name ?? 'Unknown',
    }
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
