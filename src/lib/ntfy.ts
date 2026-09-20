import type { Reminder } from '@/lib/reminders'

/**
 * Where to publish, and under what name. The topic is not a channel so much as
 * a shared secret: ntfy has no accounts, so anyone who knows it can both read
 * and write. That is why it is generated rather than chosen.
 */
export interface NtfyConfig {
  server: string
  topic: string
}

function endpoint({ server, topic }: NtfyConfig): string {
  return `${server.replace(/\/+$/, '')}/${topic}`
}

/**
 * Where tapping the notification lands. The app's own origin, which matters
 * more than it looks: opening Dosely is what re-books the next three days, so
 * this is the thing that keeps the window from running out for anybody who
 * actually uses the reminders.
 */
function clickTarget(): string {
  return window.location.origin
}

/**
 * How a request went. Three answers rather than a boolean, because one failure
 * is not like the others: a 429 means the burst bucket is empty and every
 * request after it will fail too, so the caller should stop rather than spend
 * the rest of the batch finding that out. Offline, refused and 500 are all
 * `failed`, because the response to all three is the same — leave the ledger
 * alone and try again next time the app is open.
 */
export type SendResult = 'ok' | 'failed' | 'throttled'

/** Every request the feature makes, in one place, and none of them can throw. */
async function send(input: string, init: RequestInit): Promise<SendResult> {
  try {
    const response = await fetch(input, init)
    if (response.ok) return 'ok'
    return response.status === 429 ? 'throttled' : 'failed'
  } catch {
    // No network, DNS, a blocked request. Nothing to report and nobody to
    // interrupt — the dose is already recorded either way.
    return 'failed'
  }
}

/**
 * Book a reminder, or correct one already booked.
 *
 * `X-Sequence-ID` is the address. Publishing to an address that already holds a
 * pending message replaces it, which is what makes opening the app twice book
 * one reminder rather than two. The header form is used rather than the
 * `/<topic>/<id>` path form so that an address can never collide with one of
 * ntfy's own routes — `/json`, `/ws`, `/raw`, `/auth`.
 */
export function publish(config: NtfyConfig, reminder: Reminder): Promise<SendResult> {
  return send(endpoint(config), {
    method: 'POST',
    headers: {
      'X-Sequence-ID': reminder.id,
      // Unix seconds. ntfy accepts several spellings; this is the unambiguous one.
      At: String(Math.floor(new Date(reminder.at).getTime() / 1000)),
      'X-Title': reminder.title,
      'X-Tags': 'pill',
      'X-Click': clickTarget(),
    },
    body: reminder.body,
  })
}

/**
 * Unbook one before it fires. This is what a ticked dose costs: one request,
 * and the notification never arrives.
 */
export function cancel(config: NtfyConfig, id: string): Promise<SendResult> {
  return send(`${endpoint(config)}/${id}`, { method: 'DELETE' })
}

/**
 * The only feedback channel this feature has.
 *
 * A topic nobody subscribed to accepts messages happily and delivers them
 * nowhere, and there is no way to ask ntfy whether anyone is listening. So the
 * alternative to a test button is finding out at the first missed dose.
 */
export function sendTest(config: NtfyConfig): Promise<SendResult> {
  return send(endpoint(config), {
    method: 'POST',
    headers: {
      'X-Title': 'Dosely',
      'X-Tags': 'pill',
      'X-Click': clickTarget(),
    },
    body: 'Reminders are set up. This is what one looks like.',
  })
}
