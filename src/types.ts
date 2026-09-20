import type { DateKey, DurationUnit } from '@/lib/dates'
import type { SlotId } from '@/lib/slots'
import type { Weekday } from '@/lib/weekdays'

/**
 * Why a version is closed. Three different things close a record and they mean
 * different things to the user: `stopped` is coming off a medicine and leaves
 * the door open, `completed` is a course ended early because it was done and
 * closes it, and `superseded` is an edit forking a new version behind this one
 * and is invisible. Kept apart on the record so that a rule about one cannot
 * accidentally be a rule about another.
 */
export type Closure = 'stopped' | 'completed' | 'superseded'

/**
 * One version of a medicine. Editing anything that changes the schedule closes
 * the current record and opens a new one from today, so what was prescribed on
 * any past date stays exact. Records sharing a `groupId` are the same medicine
 * to the user, who never sees this split.
 *
 * `closedOn` and `deletedAt` describe the whole medicine rather than one
 * version of it, and everything that asks reads them off the current version.
 * So a new version has to carry them forward, or adding one is a way to reset
 * them.
 */
export interface MedicineRecord {
  id: string
  groupId: string
  name: string
  note?: string
  slots: SlotId[]
  /** 1 is daily, 7 is weekly. */
  repeatEveryDays: number
  /**
   * The weekdays a daily medicine actually falls on. Absent means every day.
   * Only meaningful when `repeatEveryDays` is 1; the form never writes both.
   */
  weekdays?: Weekday[]
  /** Start of the course, and the phase the repeat counts from. */
  anchorDate: DateKey
  durationValue: number
  durationUnit: DurationUnit
  /** Inclusive. Equals `anchorDate` on the first version of a medicine. */
  effectiveFrom: DateKey
  /** Exclusive. Set when the course is stopped early or superseded by an edit. */
  closedOn?: DateKey
  /** Which of the two it was. Absent on records written before they were named apart. */
  closedBy?: Closure
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
  weekdays?: Weekday[]
  anchorDate: DateKey
  durationValue: number
  durationUnit: DurationUnit
}
