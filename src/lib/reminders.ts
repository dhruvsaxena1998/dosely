import { shiftKey, today, type DateKey } from '@/lib/dates'
import { slotInstant, type ReminderSettings } from '@/lib/reminder-settings'
import { courseStatus, dosesOn, groupMedicines, isDeleted } from '@/lib/schedule'
import { slotLabel, sortSlots, type SlotId } from '@/lib/slots'
import type { Database } from '@/types'

/**
 * How far ahead reminders can be booked at all.
 *
 * **This is ntfy's cap, not a preference.** The server refuses a delay of more
 * than three days, so this is a wall rather than a number somebody chose and
 * tuning it up does not buy a longer window, it buys rejected requests. The
 * consequence is the honest limit the feature ships with: stop opening the app
 * and the reminders run out.
 */
export const REMINDER_HORIZON_DAYS = 3

/** ntfy's other end: a delay under ten seconds is refused too. */
export const MIN_LEAD_SECONDS = 10

/**
 * Where a reminder's tap lands. Here rather than beside the screen that draws
 * it, so that the transport can address it without a lib reaching up into a
 * screen for a string.
 */
export const REMINDER_PATH = '/reminder'

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * One notification, and the address it lives at on the server.
 *
 * `id` is the whole design. Republishing to the same address replaces whatever
 * was pending there, so an app that opens twice books one reminder rather than
 * two, and a slot whose count changed is corrected rather than duplicated.
 */
export interface Reminder {
  id: string
  /** ISO, for reading; the transport converts to what ntfy wants. */
  at: string
  title: string
  body: string
}

/**
 * Everything about the message that is not its time or its words.
 *
 * Bump this whenever what gets published changes shape — a different click
 * target, a new header, a different title. The ledger records it alongside each
 * booking, so a booking made by an older build stops matching and is
 * republished once. Without it the diff can only see `at` and `body`, and a
 * change to any other part of the message is invisible: every reminder already
 * on the server keeps the old shape until it fires, which for this feature is
 * up to three days of notifications built by the previous build.
 *
 * 2 — the tap lands on `/reminder` rather than on the app's front door.
 */
export const MESSAGE_SHAPE = 2

/** What we believe is currently booked, by address. */
export type Ledger = Record<string, { at: string; body: string; shape?: number }>

export interface Reconciliation {
  /** New, or booked with the wrong time or wording. */
  publish: Reminder[]
  /** Booked, and no longer wanted. */
  cancel: string[]
  /** Booked, and already delivered. Forget them; do not try to cancel them. */
  drop: string[]
}

/**
 * One slot on one day has one address, for ever. Everything the feature gets
 * for free — no duplicates across opens, no duplicates across two devices on
 * one topic, a correction instead of a second notification — falls out of this
 * being derivable rather than remembered.
 */
export function reminderId(date: DateKey, slot: SlotId): string {
  return `d${date}-${slot}`
}

function bodyFor(names: readonly string[], includeNames: boolean): string {
  if (includeNames) return names.join(', ')
  return names.length === 1 ? '1 dose due' : `${names.length} doses due`
}

/**
 * The reminders that should exist right now.
 *
 * Intent is read from `dosesOn`, the same derivation the Today screen renders,
 * rather than from a second walk over the schedule. A reminder that disagreed
 * with the screen about what is due would be worse than no reminder, and one
 * derivation is the only way to be sure it cannot.
 *
 * The rule that makes the feature work is the plainest one here: **a slot with
 * no pending dose produces no reminder.** Ticking the last dose in a slot takes
 * it out of this list, so the next reconcile cancels it; unticking puts it
 * back. Nothing anywhere mentions notifications to achieve that. A skip counts
 * as answered, which is the rule the month grid and `slotAction` already hold —
 * a skip is a decision, not a lapse.
 */
export function plannedReminders(
  db: Database,
  settings: ReminderSettings,
  now: Date,
): Reminder[] {
  if (!settings.enabled || !settings.topic) return []

  const ref = today(now)
  const floor = now.getTime() + MIN_LEAD_SECONDS * 1000
  // A day count is not a horizon. The third day out still has an evening in it,
  // which is nearly four days away and past what the server will accept — so
  // the ceiling is an instant, and the day walk is only how we reach it.
  const ceiling = now.getTime() + REMINDER_HORIZON_DAYS * DAY_MS

  const reminders: Reminder[] = []
  for (let offset = 0; offset <= REMINDER_HORIZON_DAYS; offset += 1) {
    const date = shiftKey(ref, offset)
    const pending = new Map<SlotId, string[]>()
    for (const dose of dosesOn(db, date, ref)) {
      if (dose.outcome !== 'pending') continue
      const names = pending.get(dose.slot)
      if (names) names.push(dose.name)
      else pending.set(dose.slot, [dose.name])
    }

    for (const slot of sortSlots([...pending.keys()])) {
      const at = slotInstant(date, settings.times[slot])
      const time = at.getTime()
      if (time < floor || time > ceiling) continue
      reminders.push({
        id: reminderId(date, slot),
        at: at.toISOString(),
        title: slotLabel(slot),
        body: bodyFor(pending.get(slot)!, settings.includeNames),
      })
    }
  }
  return reminders
}

/**
 * The difference between what should be booked and what we believe is.
 *
 * Three answers rather than two, because "no longer wanted" and "already
 * delivered" look identical in the ledger and must not be treated alike. A
 * delivered reminder is simply forgotten; trying to cancel it would spend a
 * request on a message the server has already handed over.
 */
export function reconcile(
  planned: readonly Reminder[],
  ledger: Ledger,
  now: Date,
): Reconciliation {
  const wanted = new Map(planned.map((r) => [r.id, r]))
  const publish = planned.filter((r) => {
    const booked = ledger[r.id]
    if (!booked) return true
    // An entry written before shapes were recorded has no `shape` at all, which
    // is exactly the case that needs republishing, so undefined failing this
    // comparison is the point rather than an oversight.
    if (booked.shape !== MESSAGE_SHAPE) return true
    return booked.at !== r.at || booked.body !== r.body
  })

  const cancel: string[] = []
  const drop: string[] = []
  for (const [id, booked] of Object.entries(ledger)) {
    if (wanted.has(id)) continue
    if (new Date(booked.at).getTime() <= now.getTime()) drop.push(id)
    else cancel.push(id)
  }

  return { publish, cancel, drop }
}

/**
 * The slots the prescription actually uses today.
 *
 * Reminders need a time per slot, and there are seven of them. Asking someone
 * with two tablets a day to set seven times is a setting the size of the domain
 * rather than the size of their life, so the section only offers the ones in
 * play. Courses that are finished, stopped or deleted are not in play.
 */
export function slotsInUse(db: Database, ref: DateKey = today()): SlotId[] {
  const slots = new Set<SlotId>()
  for (const group of groupMedicines(db.medicines)) {
    if (isDeleted(group)) continue
    const status = courseStatus(db, group, ref)
    if (status !== 'active' && status !== 'upcoming') continue
    for (const slot of group.current.slots) slots.add(slot)
  }
  return sortSlots([...slots])
}
