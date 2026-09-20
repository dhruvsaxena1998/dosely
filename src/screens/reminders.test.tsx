import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { Settings } from '@/screens/Settings'
import { shiftKey, today } from '@/lib/dates'
import { reminderSettings } from '@/lib/reminder-settings'
import { addMedicine, getDatabase, importDatabase } from '@/lib/store'

const now = today()

function open() {
  return render(
    <MemoryRouter>
      <Settings />
    </MemoryRouter>,
  )
}

/** Scoped to its own group: Feedback has an Off of its own on the same screen. */
function group(name: string) {
  return within(screen.getByRole('radiogroup', { name }))
}

async function turnOn(user: ReturnType<typeof userEvent.setup>) {
  await user.click(group('Reminders').getByRole('radio', { name: 'On' }))
}

let fetched: ReturnType<typeof vi.fn>

beforeEach(() => {
  importDatabase(JSON.stringify({ version: 1, medicines: [], log: {} }))
  localStorage.removeItem('dosely.reminders')
  localStorage.removeItem('dosely.reminders.booked')
  fetched = vi.fn().mockResolvedValue({ ok: true })
  vi.stubGlobal('fetch', fetched)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('before reminders are turned on', () => {
  it('offers the switch and nothing else', () => {
    open()
    expect(group('Reminders').getByRole('radio', { name: 'On' })).toBeTruthy()
    expect(screen.queryByLabelText('Topic')).toBeNull()
    expect(screen.queryByRole('button', { name: /Send a test/ })).toBeNull()
  })

  // An opt-in feature has to be genuinely opt-in: nothing booked, nothing sent.
  it('has sent nothing', () => {
    open()
    expect(fetched).not.toHaveBeenCalled()
  })

  it('says the three day limit before you have committed to anything', () => {
    open()
    expect(screen.getByText(/run out if you stay away for three days/)).toBeTruthy()
  })
})

describe('turning them on', () => {
  it('mints a topic nobody could guess', async () => {
    const user = userEvent.setup()
    open()
    await turnOn(user)
    const topic = (screen.getByLabelText('Topic') as HTMLInputElement).value
    expect(topic).toMatch(/^dosely-[a-z2-9]{16}$/)
  })

  it('names the app that actually does the buzzing', async () => {
    const user = userEvent.setup()
    open()
    await turnOn(user)
    expect(screen.getByText(/That app is what buzzes/)).toBeTruthy()
  })

  it('writes nothing to the prescription', async () => {
    const user = userEvent.setup()
    open()
    await turnOn(user)
    expect(getDatabase().medicines).toHaveLength(0)
    expect(JSON.stringify(getDatabase())).not.toContain('dosely-')
  })

  // Turning it off and on again must not mean re-subscribing on the phone.
  it('keeps the same topic through a switch off and back on', async () => {
    const user = userEvent.setup()
    open()
    await turnOn(user)
    const first = reminderSettings().topic
    await user.click(group('Reminders').getByRole('radio', { name: 'Off' }))
    await turnOn(user)
    expect(reminderSettings().topic).toBe(first)
  })
})

describe('the times it offers', () => {
  it('offers none while nothing is running', async () => {
    const user = userEvent.setup()
    open()
    await turnOn(user)
    expect(screen.getByText(/there is nothing to remind you about yet/)).toBeTruthy()
  })

  // Seven pickers for a prescription that uses two is a setting the size of the
  // domain rather than the size of the person's life.
  it('offers only the slots the prescription actually uses', async () => {
    addMedicine({
      name: 'Metformin',
      slots: ['after-breakfast', 'after-dinner'],
      repeatEveryDays: 1,
      anchorDate: now,
      durationValue: 30,
      durationUnit: 'days',
    })
    const user = userEvent.setup()
    open()
    await turnOn(user)
    expect(screen.getByLabelText('After breakfast')).toBeTruthy()
    expect(screen.getByLabelText('After dinner')).toBeTruthy()
    expect(screen.queryByLabelText('Before lunch')).toBeNull()
  })

  it('does not offer a slot whose course has already finished', async () => {
    addMedicine({
      name: 'Amoxicillin',
      slots: ['before-lunch'],
      repeatEveryDays: 1,
      anchorDate: shiftKey(now, -30),
      durationValue: 5,
      durationUnit: 'days',
    })
    const user = userEvent.setup()
    open()
    await turnOn(user)
    expect(screen.queryByLabelText('Before lunch')).toBeNull()
  })
})

describe('the test notification', () => {
  it('goes to the topic on the chosen server', async () => {
    const user = userEvent.setup()
    open()
    await turnOn(user)
    await user.click(screen.getByRole('button', { name: /Send a test/ }))
    const [url] = fetched.mock.calls.at(-1) as [string]
    expect(url).toBe(`https://ntfy.sh/${reminderSettings().topic}`)
    expect(await screen.findByText(/It should arrive now/)).toBeTruthy()
  })

  it('says so when it could not be sent', async () => {
    fetched.mockRejectedValue(new TypeError('Failed to fetch'))
    const user = userEvent.setup()
    open()
    await turnOn(user)
    await user.click(screen.getByRole('button', { name: /Send a test/ }))
    expect(await screen.findByText(/Could not reach the server/)).toBeTruthy()
  })
})

describe('syncing by hand', () => {
  // The automatic sync is invisible by design — it sends nothing when nothing
  // has changed — so without this there is no way to tell a healthy sync from
  // one that has been failing quietly for days.
  it('books what is due and says how many are set', async () => {
    addMedicine({
      name: 'Metformin',
      slots: ['after-breakfast', 'after-dinner'],
      repeatEveryDays: 1,
      anchorDate: now,
      durationValue: 30,
      durationUnit: 'days',
    })
    const user = userEvent.setup()
    open()
    await turnOn(user)
    await user.click(screen.getByRole('button', { name: /Sync now/ }))
    expect(await screen.findByText(/reminders set\./)).toBeTruthy()
  })

  it('says so plainly when there is nothing due', async () => {
    const user = userEvent.setup()
    open()
    await turnOn(user)
    await user.click(screen.getByRole('button', { name: /Sync now/ }))
    expect(await screen.findByText(/Nothing due in the next three days/)).toBeTruthy()
  })

  it('says it will try again rather than pretending it worked', async () => {
    addMedicine({
      name: 'Metformin',
      slots: ['after-breakfast', 'after-dinner'],
      repeatEveryDays: 1,
      anchorDate: now,
      durationValue: 30,
      durationUnit: 'days',
    })
    const user = userEvent.setup()
    open()
    await turnOn(user)
    fetched.mockRejectedValue(new TypeError('Failed to fetch'))
    await user.click(screen.getByRole('button', { name: /Sync now/ }))
    expect(await screen.findByText(/try again next time you open the app/)).toBeTruthy()
  })

  it('is not offered while reminders are off', () => {
    open()
    expect(screen.queryByRole('button', { name: /Sync now/ })).toBeNull()
  })

  it('names the date the booked reminders run through', async () => {
    const user = userEvent.setup()
    open()
    await turnOn(user)
    expect(screen.getByText(/Reminders are set through/)).toBeTruthy()
  })
})

describe('what it says', () => {
  it('counts without naming, until asked', async () => {
    const user = userEvent.setup()
    open()
    await turnOn(user)
    expect(reminderSettings().includeNames).toBe(false)
    expect(screen.getByText(/counts the doses without naming anything/)).toBeTruthy()
  })

  it('warns about the topic once names are turned on', async () => {
    const user = userEvent.setup()
    open()
    await turnOn(user)
    await user.click(group('What it says').getByRole('radio', { name: 'Name them' }))
    expect(reminderSettings().includeNames).toBe(true)
    expect(screen.getByText(/only lock is being hard to guess/)).toBeTruthy()
  })
})
