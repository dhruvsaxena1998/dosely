import { useSyncExternalStore } from 'react'
import { DAY_ROLLOVER_HOUR, fromKey, type DateKey } from '@/lib/dates'
import { SLOTS, type SlotId } from '@/lib/slots'

/**
 * Everything a reminder needs that the prescription does not hold.
 *
 * `times` is the gap this fills. The seven slots are labels and an order and
 * nothing else — the app has never known when "after breakfast" is, because
 * until something had to fire at a moment, nothing had to.
 */
export interface ReminderSettings {
  enabled: boolean
  /** An ntfy server. Anyone running their own points this at it. */
  server: string
  /** The ntfy topic, which is also the only thing protecting it. */
  topic: string
  /** When each slot falls, as `HH:mm` on a 24 hour clock. */
  times: Record<SlotId, string>
  /** Whether the notification names the medicines or only counts them. */
  includeNames: boolean
}

/**
 * Its own key beside the theme's and the feedback mode's, and deliberately not
 * in the exported database.
 *
 * `feedback.ts` makes this argument already and it is stronger here. A backup
 * carries a prescription between devices; if it carried the topic too, then
 * restoring last month's export onto a new tablet would quietly point it at the
 * phone's topic and both would publish to it. The times go with the topic
 * rather than with the prescription for the same reason — when you eat is a
 * fact about the device's owner's day, not about the medicine.
 */
const STORAGE_KEY = 'dosely.reminders'

export const DEFAULT_SERVER = 'https://ntfy.sh'

/**
 * Sensible hours for someone who has not said otherwise, so that turning
 * reminders on is one press rather than seven decisions. Anytime sits mid
 * morning because it is the slot with no meal to hang off.
 */
const DEFAULT_TIMES: Record<SlotId, string> = {
  'before-breakfast': '07:30',
  'after-breakfast': '08:30',
  'before-lunch': '12:30',
  'after-lunch': '13:30',
  'before-dinner': '19:30',
  'after-dinner': '20:30',
  anytime: '10:00',
}

export const DEFAULT_SETTINGS: ReminderSettings = {
  enabled: false,
  server: DEFAULT_SERVER,
  topic: '',
  times: DEFAULT_TIMES,
  includeNames: false,
}

const listeners = new Set<() => void>()

/** `HH:mm` on a 24 hour clock, which is what a native time input hands back. */
export function isTime(value: unknown): value is string {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
}

export function parseTime(time: string): { hours: number; minutes: number } {
  const [hours, minutes] = time.split(':')
  return { hours: Number(hours), minutes: Number(minutes) }
}

/**
 * The moment a slot falls on a given day.
 *
 * The subtle one. A `DateKey` does not name a calendar day here — it names the
 * day that started at `DAY_ROLLOVER_HOUR`, so Tuesday runs from 03:00 Tuesday
 * to 02:59 Wednesday. A slot set to 01:00 therefore belongs to Wednesday's
 * calendar date while still being Tuesday's dose, and a reminder that ignored
 * that would land twenty-three hours early, every time, for exactly the people
 * who take something in the middle of the night.
 *
 * The boundary itself does not shift: 03:00 is the first moment of its own day.
 */
export function slotInstant(date: DateKey, time: string): Date {
  const { hours, minutes } = parseTime(time)
  const instant = fromKey(date)
  if (hours < DAY_ROLLOVER_HOUR) instant.setDate(instant.getDate() + 1)
  instant.setHours(hours, minutes, 0, 0)
  return instant
}

function readTimes(value: unknown): Record<SlotId, string> {
  if (!value || typeof value !== 'object') return DEFAULT_TIMES
  const stored = value as Record<string, unknown>
  const times = {} as Record<SlotId, string>
  // Per slot rather than all or nothing: a key the app has never heard of, or
  // one hand-edited into nonsense, should cost that slot its time and not the
  // other six theirs.
  for (const { id } of SLOTS) times[id] = isTime(stored[id]) ? stored[id] : DEFAULT_TIMES[id]
  return times
}

function parse(raw: string): ReminderSettings {
  const stored = JSON.parse(raw) as Record<string, unknown>
  if (!stored || typeof stored !== 'object') return DEFAULT_SETTINGS
  return {
    enabled: stored.enabled === true,
    server: typeof stored.server === 'string' && stored.server ? stored.server : DEFAULT_SERVER,
    topic: typeof stored.topic === 'string' ? stored.topic : '',
    times: readTimes(stored.times),
    includeNames: stored.includeNames === true,
  }
}

/**
 * Read live like the feedback mode rather than cached at import, so that a
 * value written by another tab — or by a test's `beforeEach` — is seen without
 * anything having to be told about it.
 *
 * Settings are an object, though, and `useSyncExternalStore` spins on a fresh
 * one every read. So the raw string is what is cached, and the same object is
 * handed back until that string actually changes. Same trick `install.ts` uses,
 * for the same reason.
 */
let cache: { raw: string | null; value: ReminderSettings } = { raw: null, value: DEFAULT_SETTINGS }

export function reminderSettings(): ReminderSettings {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (raw === cache.raw) return cache.value
  let value = DEFAULT_SETTINGS
  if (raw) {
    try {
      value = parse(raw)
    } catch {
      // Unparseable is the same as absent. There is nothing here worth
      // interrupting somebody over, and the defaults are a working setup.
      value = DEFAULT_SETTINGS
    }
  }
  cache = { raw, value }
  return value
}

/**
 * Change some of it and leave the rest. Writes the whole object back, because
 * a settings blob small enough to read in devtools is not worth a merge
 * strategy.
 */
export function setReminderSettings(patch: Partial<ReminderSettings>) {
  const next: ReminderSettings = { ...reminderSettings(), ...patch }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  for (const listener of listeners) listener()
}

export function setSlotTime(slot: SlotId, time: string) {
  setReminderSettings({ times: { ...reminderSettings().times, [slot]: time } })
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useReminderSettings(): ReminderSettings {
  return useSyncExternalStore(subscribe, reminderSettings)
}

/**
 * Thirty-two characters, so each one is exactly five bits of the random bytes
 * and none is more likely than another. `l`, `o`, `0` and `1` are left out
 * because a topic is a thing people read off one screen and type into another.
 */
const TOPIC_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789'

/**
 * A topic nobody can guess.
 *
 * ntfy has no accounts and no passwords: knowing the topic *is* the
 * authorisation, to read as well as to write. So this is never a name the user
 * chooses. Sixteen characters from that alphabet is eighty bits, which is not a
 * thing anyone finds by trying.
 */
export function newTopic(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  let name = ''
  for (const byte of bytes) name += TOPIC_ALPHABET[byte % TOPIC_ALPHABET.length]
  return `dosely-${name}`
}
