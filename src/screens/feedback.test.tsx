import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { Settings } from '@/screens/Settings'
import { Today } from '@/screens/Today'
import { shiftKey, today } from '@/lib/dates'
import { feedbackMode } from '@/lib/feedback'
import { addMedicine, importDatabase } from '@/lib/store'

/**
 * The wiring, not the decision. Whether a tick asks for the light preset is
 * settled at the module seam; what these pin is that pressing a pocket reaches
 * the feedback module at all, and that the one branch living on the screen —
 * whether this press completed the day — is the screen's to get right.
 */
const stub = vi.hoisted(() => ({ trigger: vi.fn(), setDebug: vi.fn() }))

vi.mock('web-haptics', async (importOriginal) => {
  const actual = await importOriginal<typeof import('web-haptics')>()
  return {
    ...actual,
    WebHaptics: class {
      trigger = stub.trigger
      setDebug = stub.setDebug
    },
  }
})

const now = today()

function renderToday() {
  return render(
    <MemoryRouter>
      <Today />
    </MemoryRouter>,
  )
}

function daily(name: string, anchorDate = now, durationValue = 7) {
  return addMedicine({
    name,
    slots: ['after-breakfast'],
    repeatEveryDays: 1,
    anchorDate,
    durationValue,
    durationUnit: 'days',
  })
}

beforeEach(() => {
  importDatabase(JSON.stringify({ version: 1, medicines: [], log: {} }))
  localStorage.removeItem('dosely.feedback')
  stub.trigger.mockReset().mockReturnValue(Promise.resolve())
  stub.setDebug.mockReset()
})

describe('the feedback setting', () => {
  it('offers three positions and shows which one is on', () => {
    render(
      <MemoryRouter>
        <Settings />
      </MemoryRouter>,
    )

    const group = screen.getByRole('radiogroup', { name: 'Feedback' })
    expect(screen.getByRole('radio', { name: 'Off' })).toBeTruthy()
    expect(screen.getByRole('radio', { name: 'Haptic' })).toBeTruthy()
    expect(screen.getByRole('radio', { name: 'And sound' })).toBeTruthy()
    // jsdom has no Vibration API, which is the device the default is written for.
    expect(within(group).getByRole('radio', { name: 'And sound' }).getAttribute('aria-checked')).toBe('true')
  })

  it('changes the setting, and answers as it is chosen', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <Settings />
      </MemoryRouter>,
    )

    await user.click(screen.getByRole('radio', { name: 'Haptic' }))

    expect(feedbackMode()).toBe('haptic')
    expect(screen.getByRole('radio', { name: 'Haptic' }).getAttribute('aria-checked')).toBe('true')
    expect(stub.trigger).toHaveBeenCalled()
  })

  it('goes silent when it is turned off', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <Settings />
      </MemoryRouter>,
    )

    await user.click(screen.getByRole('radio', { name: 'Off' }))

    expect(feedbackMode()).toBe('off')
    expect(stub.trigger).not.toHaveBeenCalled()
  })
})

describe('answering a press on the Today screen', () => {
  it('answers a dose that was ticked', async () => {
    const user = userEvent.setup()
    daily('Metformin 500MG')
    daily('Vitamin D3')
    renderToday()

    await user.click(screen.getByRole('button', { name: 'Metformin 500MG' }))

    expect(stub.trigger).toHaveBeenCalledWith('selection')
  })

  it('answers a skip differently from a tick', async () => {
    const user = userEvent.setup()
    daily('Metformin 500MG')
    daily('Vitamin D3')
    renderToday()

    await user.click(screen.getByRole('button', { name: 'Skip Metformin 500MG' }))

    expect(stub.trigger).not.toHaveBeenCalledWith('selection')
    expect(stub.trigger).toHaveBeenCalledTimes(1)
  })

  it('answers more fully when the press completed the day', async () => {
    const user = userEvent.setup()
    daily('Metformin 500MG')
    daily('Vitamin D3')
    renderToday()

    await user.click(screen.getByRole('button', { name: 'Metformin 500MG' }))
    expect(stub.trigger).not.toHaveBeenCalledWith('success')

    await user.click(screen.getByRole('button', { name: 'Vitamin D3' }))
    expect(stub.trigger).toHaveBeenCalledWith('success')
  })

  it('does not celebrate the day when a dose is un-ticked', async () => {
    const user = userEvent.setup()
    daily('Metformin 500MG')
    renderToday()

    await user.click(screen.getByRole('button', { name: 'Metformin 500MG' }))
    expect(stub.trigger).toHaveBeenCalledWith('success')

    stub.trigger.mockClear()
    await user.click(screen.getByRole('button', { name: 'Metformin 500MG' }))
    expect(stub.trigger).toHaveBeenCalledWith('selection')
  })

  it('answers a slot filled in one press once, not once per dose', async () => {
    const user = userEvent.setup()
    daily('Metformin 500MG')
    daily('Vitamin D3')
    daily('Calcium with D3')
    // A dose left open elsewhere, so the fill is a tick rather than the day.
    addMedicine({
      name: 'Omeprazole 20MG',
      slots: ['after-dinner'],
      repeatEveryDays: 1,
      anchorDate: now,
      durationValue: 7,
      durationUnit: 'days',
    })
    renderToday()

    await user.click(screen.getByRole('button', { name: 'Take all of After breakfast' }))

    expect(stub.trigger).toHaveBeenCalledTimes(1)
    expect(stub.trigger).toHaveBeenCalledWith('selection')
  })

  it('celebrates once when the press completed the day', async () => {
    const user = userEvent.setup()
    daily('Metformin 500MG')
    daily('Vitamin D3')
    daily('Calcium with D3')
    renderToday()

    await user.click(screen.getByRole('button', { name: 'Take all of After breakfast' }))

    expect(stub.trigger).toHaveBeenCalledTimes(1)
    expect(stub.trigger).toHaveBeenCalledWith('success')
  })

  it('answers a slot cleared in one press once', async () => {
    const user = userEvent.setup()
    daily('Metformin 500MG')
    daily('Vitamin D3')
    renderToday()

    await user.click(screen.getByRole('button', { name: 'Take all of After breakfast' }))
    stub.trigger.mockClear()
    await user.click(screen.getByRole('button', { name: 'Clear all of After breakfast' }))

    expect(stub.trigger).toHaveBeenCalledTimes(1)
    expect(stub.trigger).toHaveBeenCalledWith('selection')
  })

  it('says nothing when the press had nothing left to record', async () => {
    const user = userEvent.setup()
    daily('Metformin 500MG')
    daily('Vitamin D3')
    renderToday()

    // A skip keeps the fill on offer after the slot is full, and a press that
    // writes nothing must not confirm a tick it did not take.
    await user.click(screen.getByRole('button', { name: 'Skip Vitamin D3' }))
    await user.click(screen.getByRole('button', { name: 'Take all of After breakfast' }))
    stub.trigger.mockClear()

    await user.click(screen.getByRole('button', { name: 'Take all of After breakfast' }))

    expect(stub.trigger).not.toHaveBeenCalled()
  })

  it('has nothing to answer on a day that has not arrived', async () => {
    const user = userEvent.setup()
    daily('Metformin 500MG', shiftKey(now, -1), 5)
    renderToday()

    await user.click(screen.getByRole('button', { name: /next day/i }))

    // The row reads rather than presses on a planned day, so there is no
    // handler to reach and nothing that could confirm a tick it did not record.
    expect(screen.queryByRole('button', { name: 'Metformin 500MG' })).toBeNull()
    expect(stub.trigger).not.toHaveBeenCalled()
  })
})
