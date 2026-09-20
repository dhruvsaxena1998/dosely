import { useEffect } from 'react'
import { useToday } from '@/lib/dates'
import { cancel, publish, type NtfyConfig } from '@/lib/ntfy'
import { reminderSettings, useReminderSettings } from '@/lib/reminder-settings'
import { plannedReminders, reconcile, type Ledger } from '@/lib/reminders'
import { getDatabase, useDatabase } from '@/lib/store'

/**
 * What we believe is booked on the server, in its own key.
 *
 * Out of the exported database along with the settings, and for a sharper
 * reason than those: a ledger restored onto another device would describe
 * reminders that device never booked, and the first sync would spend its
 * requests cancelling things that are not there.
 */
const LEDGER_KEY = 'dosely.reminders.booked'

/**
 * How many requests one run may make. ntfy.sh allows sixty at once and refills
 * one every five seconds, so a cap well under that leaves room for the app to
 * be opened again a minute later. Anything not done this time is done next time.
 */
const MAX_BATCH = 30

/**
 * Long enough that one act is one sync. `setDoses` already makes filling a
 * whole slot a single write, so this mostly catches an edit followed by the
 * navigation away from the form.
 */
const DEBOUNCE_MS = 1000

export function readLedger(): Ledger {
  try {
    const raw = localStorage.getItem(LEDGER_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Ledger
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeLedger(ledger: Ledger) {
  try {
    localStorage.setItem(LEDGER_KEY, JSON.stringify(ledger))
  } catch {
    // A ledger that cannot be saved means the next sync re-books what is
    // already booked. Republishing an address replaces rather than duplicates,
    // so the cost is wasted requests and never a second notification.
  }
}

/**
 * Make the server's future match the prescription.
 *
 * Runs whenever the app is open for any reason, and on a normal open it sends
 * nothing at all — the ledger already matches, so the diff is empty. That is
 * the property that keeps a feature which fires five times a day inside a
 * budget of 250 messages.
 *
 * Each success is written to the ledger as it lands rather than in one batch at
 * the end, so a run that dies halfway leaves an honest record of exactly how
 * far it got. A failure leaves that entry alone, which is what makes the retry
 * automatic: the next run recomputes the same diff and tries the same request.
 */
export async function syncReminders(now: Date = new Date()): Promise<void> {
  const settings = reminderSettings()
  const ledger = readLedger()

  // Off, and nothing booked. The overwhelming majority of runs for anyone who
  // never turned this on, and they must cost nothing and touch no network.
  if (!settings.enabled && Object.keys(ledger).length === 0) return
  if (!settings.topic) return

  const config: NtfyConfig = { server: settings.server, topic: settings.topic }
  // Switched off, `plannedReminders` returns nothing, and every booked address
  // falls into `cancel`. Turning reminders off is therefore not a special path;
  // it is the ordinary diff against an empty intent.
  const { publish: toPublish, cancel: toCancel, drop } = reconcile(
    plannedReminders(getDatabase(), settings, now),
    ledger,
    now,
  )

  const next: Ledger = { ...ledger }
  // Already delivered. Forgetting them is free and needs no request.
  for (const id of drop) delete next[id]
  if (drop.length > 0) writeLedger(next)

  let spent = 0
  for (const id of toCancel) {
    if (spent >= MAX_BATCH) break
    spent += 1
    const result = await cancel(config, id)
    // Every request after a 429 fails too, so stopping is the difference
    // between one wasted request and thirty.
    if (result === 'throttled') return
    if (result === 'failed') continue
    delete next[id]
    writeLedger(next)
  }

  for (const reminder of toPublish) {
    if (spent >= MAX_BATCH) break
    spent += 1
    const result = await publish(config, reminder)
    if (result === 'throttled') return
    if (result === 'failed') continue
    next[reminder.id] = { at: reminder.at, body: reminder.body }
    writeLedger(next)
  }
}

/**
 * The one place the sync is wired to the app.
 *
 * Mounted in `AppShell`, which is the component that is always on screen, so
 * this runs for every reason the app has to be open: launched, ticked, edited,
 * or the day turning over underneath a window left open all night. There is no
 * separate "when to sync" list to keep in step with the rest of the app —
 * anything that changes the database changes `db`, and that is the trigger.
 */
export function useReminderSync() {
  const db = useDatabase()
  const now = useToday()
  const settings = useReminderSettings()

  useEffect(() => {
    const timer = setTimeout(() => {
      void syncReminders()
    }, DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [db, now, settings])
}
