import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cancel, publish, sendTest, type NtfyConfig } from '@/lib/ntfy'
import type { Reminder } from '@/lib/reminders'

/**
 * Nothing here touches the network. What is being asserted is the request the
 * app decided to make, which is the only part of this that is ours — whether
 * ntfy then delivers it is ntfy's business and cannot be tested from here.
 */
const config: NtfyConfig = { server: 'https://ntfy.sh', topic: 'dosely-testtopic1234' }

const reminder: Reminder = {
  id: 'd2026-09-22-after-lunch',
  at: '2026-09-22T13:30:00.000Z',
  title: 'After lunch',
  body: '2 doses due',
}

let fetched: ReturnType<typeof vi.fn>

function lastCall() {
  const [input, init] = fetched.mock.calls.at(-1) as [string, RequestInit]
  return { input, init, headers: (init.headers ?? {}) as Record<string, string> }
}

beforeEach(() => {
  fetched = vi.fn().mockResolvedValue({ ok: true })
  vi.stubGlobal('fetch', fetched)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('booking a reminder', () => {
  it('posts to the topic', async () => {
    await publish(config, reminder)
    expect(lastCall().input).toBe('https://ntfy.sh/dosely-testtopic1234')
    expect(lastCall().init.method).toBe('POST')
  })

  // The address. Publishing to one that already holds a pending message
  // replaces it, which is the whole reason opening the app twice is harmless.
  it('carries the reminder id as the sequence id', async () => {
    await publish(config, reminder)
    expect(lastCall().headers['X-Sequence-ID']).toBe('d2026-09-22-after-lunch')
  })

  it('sends the delivery time as unix seconds', async () => {
    await publish(config, reminder)
    expect(lastCall().headers.At).toBe(String(Date.parse('2026-09-22T13:30:00.000Z') / 1000))
  })

  it('titles it with the slot and sends the body as written', async () => {
    await publish(config, reminder)
    expect(lastCall().headers['X-Title']).toBe('After lunch')
    expect(lastCall().init.body).toBe('2 doses due')
  })

  // Not the front door: on iOS a tap cannot reach the installed app, so it
  // lands on the page that explains that rather than on an empty medicine list.
  it('points the tap at the page that knows where it landed', async () => {
    await publish(config, reminder)
    expect(lastCall().headers['X-Click']).toBe(`${window.location.origin}/reminder`)
  })

  it('does not double the slash on a server written with a trailing one', async () => {
    await publish({ ...config, server: 'https://ntfy.example.com/' }, reminder)
    expect(lastCall().input).toBe('https://ntfy.example.com/dosely-testtopic1234')
  })
})

describe('unbooking one', () => {
  it('deletes the address', async () => {
    await cancel(config, 'd2026-09-22-after-lunch')
    expect(lastCall().input).toBe('https://ntfy.sh/dosely-testtopic1234/d2026-09-22-after-lunch')
    expect(lastCall().init.method).toBe('DELETE')
  })
})

describe('the test notification', () => {
  it('goes out now rather than at a time', async () => {
    await sendTest(config)
    expect(lastCall().headers.At).toBeUndefined()
    expect(lastCall().init.method).toBe('POST')
  })
})

/**
 * Every one of these is the same answer, because the caller's response to all
 * of them is the same: leave the ledger alone and try again next time.
 */
describe('a request that did not land', () => {
  it('says so when the server refuses', async () => {
    fetched.mockResolvedValue({ ok: false, status: 400 })
    expect(await publish(config, reminder)).toBe('failed')
  })

  // Told apart from the rest, because every request after this one fails too.
  it('says which failure it was when the burst bucket is empty', async () => {
    fetched.mockResolvedValue({ ok: false, status: 429 })
    expect(await publish(config, reminder)).toBe('throttled')
  })

  it('says so when the server breaks', async () => {
    fetched.mockResolvedValue({ ok: false, status: 500 })
    expect(await cancel(config, reminder.id)).toBe('failed')
  })

  it('says so when there is no network at all, rather than throwing', async () => {
    fetched.mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(publish(config, reminder)).resolves.toBe('failed')
    await expect(cancel(config, reminder.id)).resolves.toBe('failed')
    await expect(sendTest(config)).resolves.toBe('failed')
  })
})
