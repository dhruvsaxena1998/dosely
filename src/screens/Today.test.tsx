import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { Today } from '@/screens/Today'
import { shiftKey, today } from '@/lib/dates'
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
