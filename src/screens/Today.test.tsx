import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { Today } from '@/screens/Today'
import { formatWithYear, shiftKey, today } from '@/lib/dates'
import { loadExamples } from '@/lib/examples'
import { addMedicine, getDatabase, importDatabase } from '@/lib/store'

function reset() {
  importDatabase(JSON.stringify({ version: 1, medicines: [], log: {} }))
}

function renderToday() {
  return render(
    <MemoryRouter>
      <Today />
    </MemoryRouter>,
  )
}

/** The row's main button is labelled with the medicine name. */
function row(name: string) {
  return screen.getByRole('button', { name })
}

beforeEach(reset)

describe('the Today screen', () => {
  it('offers the example prescriptions when nothing is added', async () => {
    const user = userEvent.setup()
    renderToday()
    expect(screen.getByText('No medicines yet')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: /load a sample prescription/i }))

    expect(screen.getByText('Before breakfast')).toBeTruthy()
    expect(screen.getByText('After breakfast')).toBeTruthy()
    expect(screen.getByText('After dinner')).toBeTruthy()
    expect(screen.getByText('Anytime')).toBeTruthy()
  })

  it('lists a twice daily medicine once under each of its slots', () => {
    loadExamples()
    renderToday()
    const matches = screen.getAllByText('Multivitamin')
    expect(matches).toHaveLength(2)
  })

  it('records a dose, shows the time, and lets you undo a mis-tap', async () => {
    const user = userEvent.setup()
    loadExamples()
    renderToday()

    await user.click(row('Omeprazole 20MG'))
    expect(row('Omeprazole 20MG').getAttribute('aria-pressed')).toBe('true')
    expect(within(row('Omeprazole 20MG')).getByText(/^Taken at /)).toBeTruthy()
    expect(screen.getByText('9 left')).toBeTruthy()

    await user.click(row('Omeprazole 20MG'))
    expect(row('Omeprazole 20MG').getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByText('10 left')).toBeTruthy()
  })

  it('keeps skipped separate from taken, and swaps between them', async () => {
    const user = userEvent.setup()
    loadExamples()
    renderToday()

    await user.click(screen.getByRole('button', { name: 'Skip Calcium with D3' }))
    expect(within(row('Calcium with D3')).getByText(/^Skipped at /)).toBeTruthy()

    await user.click(row('Calcium with D3'))
    expect(within(row('Calcium with D3')).getByText(/^Taken at /)).toBeTruthy()

    const key = Object.keys(getDatabase().log).find((k) => k.endsWith('after-breakfast'))!
    expect(getDatabase().log[key].state).toBe('taken')
  })

  it('walks back through the backfill window and stops at the limit', async () => {
    const user = userEvent.setup()
    loadExamples(shiftKey(today(), -10))
    renderToday()

    const back = screen.getByRole('button', { name: /previous day/i })
    for (let i = 0; i < 3; i += 1) {
      expect(back.hasAttribute('disabled')).toBe(false)
      await user.click(back)
    }
    expect(back.hasAttribute('disabled')).toBe(true)
  })

  it('marks an untouched past dose as missed', async () => {
    const user = userEvent.setup()
    addMedicine({
      name: 'Magnesium 250MG',
      slots: ['after-dinner'],
      repeatEveryDays: 1,
      anchorDate: shiftKey(today(), -2),
      durationValue: 30,
      durationUnit: 'days',
    })
    renderToday()

    await user.click(screen.getByRole('button', { name: /previous day/i }))
    expect(within(row('Magnesium 250MG')).getByText('Missed')).toBeTruthy()

    await user.click(row('Magnesium 250MG'))
    expect(within(row('Magnesium 250MG')).getByText(/^Taken at /)).toBeTruthy()
  })

  it('walks forward into the days ahead and stops where the last course runs out', async () => {
    const user = userEvent.setup()
    addMedicine({
      name: 'Omeprazole 20MG',
      slots: ['before-breakfast'],
      repeatEveryDays: 1,
      anchorDate: today(),
      durationValue: 3,
      durationUnit: 'days',
    })
    renderToday()

    const forward = screen.getByRole('button', { name: /next day/i })
    await user.click(forward)
    expect(screen.getByText('Tomorrow')).toBeTruthy()

    // Three daily doses from today, so the last is the day after tomorrow.
    await user.click(forward)
    expect(forward.hasAttribute('disabled')).toBe(true)
  })

  it('shows a day ahead as a plan rather than something to tick', async () => {
    const user = userEvent.setup()
    loadExamples()
    renderToday()

    await user.click(screen.getByRole('button', { name: /next day/i }))

    expect(screen.getByText('Omeprazole 20MG')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Omeprazole 20MG' })).toBe(null)
    expect(screen.queryByRole('button', { name: 'Skip Omeprazole 20MG' })).toBe(null)
    expect(screen.getByText('Planned. You can tick it on the day.')).toBeTruthy()
  })

  it('counts a future day as due rather than left', async () => {
    const user = userEvent.setup()
    loadExamples()
    renderToday()
    expect(screen.getByText('10 left')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: /next day/i }))
    expect(screen.getByText('8 due')).toBeTruthy()
  })

  it('jumps to a chosen date, and refuses one past the last dose', async () => {
    const user = userEvent.setup()
    loadExamples()
    renderToday()

    await user.click(screen.getByRole('button', { name: /pick a date/i }))
    const field = screen.getByLabelText('Date') as HTMLInputElement

    fireEvent.change(field, { target: { value: shiftKey(today(), 5) } })
    expect(screen.getByText(formatWithYear(shiftKey(today(), 5)))).toBeTruthy()

    // The furthest dose is the eighth and last of Vitamin D3, seven weeks out.
    fireEvent.change(field, { target: { value: shiftKey(today(), 400) } })
    expect(screen.getByText(formatWithYear(shiftKey(today(), 49)))).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Today' }))
    expect(screen.getByRole('heading', { name: 'Today' })).toBeTruthy()
  })

  it('says nothing is due once a short course has run out', () => {
    addMedicine({
      name: 'Omeprazole 20MG',
      slots: ['before-breakfast'],
      repeatEveryDays: 1,
      anchorDate: shiftKey(today(), -7),
      durationValue: 7,
      durationUnit: 'days',
    })
    renderToday()
    expect(screen.getByText('Nothing due')).toBeTruthy()
  })
})

describe('filling a slot in one press', () => {
  /** Three after breakfast, one before it — a slot to fill and a slot that is already one press. */
  function prescription(start = today()) {
    for (const [name, slot] of [
      ['Metformin 500MG', 'after-breakfast'],
      ['Calcium with D3', 'after-breakfast'],
      ['Vitamin D3 60000', 'after-breakfast'],
      ['Omeprazole 20MG', 'before-breakfast'],
    ] as const) {
      addMedicine({
        name,
        slots: [slot],
        repeatEveryDays: 1,
        anchorDate: start,
        durationValue: 7,
        durationUnit: 'days',
      })
    }
  }

  /** The heading's own press, found by the same words it prints. */
  function fill(label: string) {
    return screen.getByRole('button', { name: `Take all of ${label}` })
  }

  function taken(name: string) {
    return row(name).getAttribute('aria-pressed') === 'true'
  }

  it('takes everything left in the slot, and nothing outside it', async () => {
    const user = userEvent.setup()
    prescription()
    renderToday()

    await user.click(fill('After breakfast'))

    expect(taken('Metformin 500MG')).toBe(true)
    expect(taken('Calcium with D3')).toBe(true)
    expect(taken('Vitamin D3 60000')).toBe(true)
    expect(taken('Omeprazole 20MG')).toBe(false)
    expect(screen.getByText('3/3')).toBeTruthy()
    expect(screen.getByText('1 left')).toBeTruthy()
  })

  it('completes a partly ticked slot without disturbing the tick already there', async () => {
    const user = userEvent.setup()
    prescription()
    renderToday()

    await user.click(row('Calcium with D3'))
    const first = Object.values(getDatabase().log)[0]

    await user.click(fill('After breakfast'))

    expect(getDatabase().log[`${first.groupId}|${first.date}|${first.slot}`]).toEqual(first)
    expect(screen.getByText('3/3')).toBeTruthy()
  })

  it('steps over a skip, and offers no clear that would leave it behind', async () => {
    const user = userEvent.setup()
    prescription()
    renderToday()

    await user.click(screen.getByRole('button', { name: 'Skip Vitamin D3 60000' }))
    await user.click(fill('After breakfast'))

    expect(within(row('Vitamin D3 60000')).getByText(/^Skipped at /)).toBeTruthy()
    expect(taken('Calcium with D3')).toBe(true)
    expect(screen.getByText('3/3')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Clear all of After breakfast' })).toBeNull()
    expect(fill('After breakfast')).toBeTruthy()
  })

  it('presses twice to the same place it pressed once', async () => {
    const user = userEvent.setup()
    prescription()
    renderToday()

    // A slot holding a skip keeps offering the fill, which is the only way to
    // press fill twice — without one, the second press is the clear.
    await user.click(screen.getByRole('button', { name: 'Skip Vitamin D3 60000' }))
    await user.click(fill('After breakfast'))
    const afterOnePress = JSON.stringify(getDatabase().log)

    await user.click(fill('After breakfast'))

    expect(JSON.stringify(getDatabase().log)).toBe(afterOnePress)
  })

  it('clears the slot back to pending on the next press', async () => {
    const user = userEvent.setup()
    prescription()
    renderToday()

    await user.click(fill('After breakfast'))
    await user.click(screen.getByRole('button', { name: 'Clear all of After breakfast' }))

    expect(taken('Metformin 500MG')).toBe(false)
    expect(taken('Calcium with D3')).toBe(false)
    expect(screen.getByText('0/3')).toBeTruthy()
    expect(screen.getByText('4 left')).toBeTruthy()
  })

  it('prints on the heading what a press will do', async () => {
    const user = userEvent.setup()
    prescription()
    renderToday()

    // A heading is the last place a thumb goes looking for a control, so the
    // press is only worth having if it can be seen without being pressed.
    expect(within(fill('After breakfast')).getByText('Take all')).toBeTruthy()

    await user.click(fill('After breakfast'))

    const clear = screen.getByRole('button', { name: 'Clear all of After breakfast' })
    expect(within(clear).getByText('Clear all')).toBeTruthy()
  })

  it('renders no bulk control on a slot that is already one press', () => {
    prescription()
    renderToday()

    expect(screen.getByText('Before breakfast')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /all of Before breakfast/ })).toBeNull()
  })

  it('renders no bulk control on a day that has not arrived', async () => {
    const user = userEvent.setup()
    prescription()
    renderToday()

    await user.click(screen.getByRole('button', { name: /next day/i }))

    expect(screen.getByText('After breakfast')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /all of After breakfast/ })).toBeNull()
  })

  it('fills the day strip for every dose in the slot', async () => {
    const user = userEvent.setup()
    prescription()
    const { container } = renderToday()
    const strip = () => container.querySelector('header')!.querySelectorAll('.bg-taken')

    expect(strip()).toHaveLength(0)
    await user.click(fill('After breakfast'))
    expect(strip()).toHaveLength(3)
  })

  it('fills a past day inside the backfill window', async () => {
    const user = userEvent.setup()
    prescription(shiftKey(today(), -1))
    renderToday()

    await user.click(screen.getByRole('button', { name: /previous day/i }))
    await user.click(fill('After breakfast'))

    expect(taken('Metformin 500MG')).toBe(true)
    expect(screen.getByText('3/3')).toBeTruthy()
  })
})
