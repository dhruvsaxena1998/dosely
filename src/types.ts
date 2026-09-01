import type { DateKey, DurationUnit } from '@/lib/dates'
import type { SlotId } from '@/lib/slots'

/**
 * One version of a medicine. Editing anything that changes the schedule closes
 * the current record and opens a new one from today, so what was prescribed on
 * any past date stays exact. Records sharing a `groupId` are the same medicine
 * to the user, who never sees this split.
 */
export interface MedicineRecord {
  id: string
  groupId: string
  name: string
  note?: string
  slots: SlotId[]
  /** 1 is daily, 7 is weekly. */
  repeatEveryDays: number
  /** Start of the course, and the phase the repeat counts from. */
  anchorDate: DateKey
  durationValue: number
  durationUnit: DurationUnit
  /** Inclusive. Equals `anchorDate` on the first version of a medicine. */
  effectiveFrom: DateKey
  /** Exclusive. Set when the course is stopped early or superseded by an edit. */
  closedOn?: DateKey
  /** ISO timestamp. Soft delete hides the medicine but keeps its history. */
  deletedAt?: string
  createdAt: string
}

/** Missed is never stored. It is the absence of an entry on a past dose day. */
export type DoseState = 'taken' | 'skipped'

export interface DoseLogEntry {
  groupId: string
  date: DateKey
  slot: SlotId
  state: DoseState
  /** When the tick actually happened, not the day it counts for. */
  at: string
  /** The medicine's name when it was ticked. */
  name: string
}

export interface Database {
  version: 1
  medicines: MedicineRecord[]
  /** Keyed by `${groupId}|${date}|${slot}`. */
  log: Record<string, DoseLogEntry>
}

export interface MedicineInput {
  name: string
  note?: string
  slots: SlotId[]
  repeatEveryDays: number
  anchorDate: DateKey
  durationValue: number
  durationUnit: DurationUnit
}
