import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import App from '@/App'
import { History } from '@/screens/History'
import { MedicineForm } from '@/screens/MedicineForm'
import { MedicineHistory } from '@/screens/MedicineHistory'
import { Medicines } from '@/screens/Medicines'
import { shiftKey, today } from '@/lib/dates'
import { loadExamples } from '@/lib/examples'
import { groupMedicines } from '@/lib/schedule'
import { addMedicine, getDatabase, importDatabase, setDose } from '@/lib/store'

const now = today()

function at(path: string, element: React.ReactNode, pattern: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={pattern} element={element} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  importDatabase(JSON.stringify({ version: 1, medicines: [], log: {} }))
})

describe('the Medicines screen', () => {
  it('shows each course with its schedule and next due date', () => {
    loadExamples()
    at('/medicines', <Medicines />, '/medicines')

    expect(screen.getByText('Running')).toBeTruthy()
    const card = screen.getByText('Vitamin B12').closest('article')!
    expect(within(card).getByText('Weekly')).toBeTruthy()
    expect(within(card).getByText('5 weeks')).toBeTruthy()
    expect(within(card).getAllByText('Anytime').length).toBeGreaterThan(0)
  })

  it('files a finished course under the archive with a restart button', () => {
    addMedicine({
      name: 'Omeprazole 20MG',
      slots: ['before-breakfast'],
      repeatEveryDays: 1,
      anchorDate: shiftKey(now, -10),
      durationValue: 7,
      durationUnit: 'days',
    })
    at('/medicines', <Medicines />, '/medicines')

    expect(screen.getByText('Archive')).toBeTruthy()
    expect(screen.getByRole('button', { name: /start again/i })).toBeTruthy()
  })

  it('soft deletes behind a confirmation and offers a restore', async () => {
    const user = userEvent.setup()
    const id = addMedicine({
      name: 'Calcium with D3',
      slots: ['after-breakfast'],
      repeatEveryDays: 1,
      anchorDate: now,
      durationValue: 30,
      durationUnit: 'days',
    })
    setDose(id, now, 'after-breakfast', 'taken')
    at('/medicines', <Medicines />, '/medicines')

    await user.click(screen.getByRole('button', { name: /delete/i }))
    await user.click(screen.getByRole('button', { name: /^Delete$/ }))

    expect(screen.getByText('Deleted')).toBeTruthy()
    expect(screen.getByRole('button', { name: /restore/i })).toBeTruthy()
    expect(Object.keys(getDatabase().log)).toHaveLength(1)
  })
})

describe('the medicine form', () => {
  it('previews the exact dose count before saving', async () => {
    const user = userEvent.setup()
    at('/medicines/new', <MedicineForm />, '/medicines/new')

    await user.type(screen.getByLabelText('Name'), 'Vitamin B12')
    await user.click(screen.getByRole('button', { name: 'Anytime' }))
    await user.click(screen.getByRole('radio', { name: 'Weekly' }))
    const duration = screen.getByLabelText('Runs for')
    await user.clear(duration)
    await user.type(duration, '35')

    // 35 days of a weekly medicine is 5 doses, not 6. The span is half-open.
    expect(screen.getByText('5 doses across 5 days')).toBeTruthy()
  })

  it('counts two slots a day as two doses a day', async () => {
    const user = userEvent.setup()
    at('/medicines/new', <MedicineForm />, '/medicines/new')

    await user.type(screen.getByLabelText('Name'), 'Paracetamol 500MG or Crocin')
    await user.click(screen.getByRole('button', { name: 'After breakfast' }))
    await user.click(screen.getByRole('button', { name: 'After dinner' }))

    expect(screen.getByText('14 doses across 7 days')).toBeTruthy()
  })

  it('warns that a schedule change only applies from today', async () => {
    const user = userEvent.setup()
    const id = addMedicine({
      name: 'Calcium with D3',
      slots: ['after-breakfast'],
      repeatEveryDays: 1,
      anchorDate: shiftKey(now, -5),
      durationValue: 30,
      durationUnit: 'days',
    })
    at(`/medicines/${id}/edit`, <MedicineForm />, '/medicines/:groupId/edit')

    expect(screen.queryByText(/takes effect from today/i)).toBeNull()
    await user.click(screen.getByRole('button', { name: 'After dinner' }))
    expect(screen.getByText(/takes effect from today/i)).toBeTruthy()
  })
})

describe('the History screens', () => {
  it('counts taken, skipped and missed against the whole course', () => {
    const id = addMedicine({
      name: 'Magnesium 250MG',
      slots: ['after-dinner'],
      repeatEveryDays: 1,
      anchorDate: shiftKey(now, -3),
      durationValue: 30,
      durationUnit: 'days',
    })
    setDose(id, shiftKey(now, -3), 'after-dinner', 'taken')
    setDose(id, shiftKey(now, -2), 'after-dinner', 'skipped')
    // The day before yesterday is left untouched, so it counts as missed.

    at('/history', <History />, '/history')
    expect(screen.getByText(/1 taken/)).toBeTruthy()
    expect(screen.getByText(/1 skipped/)).toBeTruthy()
    expect(screen.getByText(/1 missed/)).toBeTruthy()
    expect(screen.getByText(/of 30/)).toBeTruthy()
  })

  it('lists every day of the course newest first', () => {
    const id = addMedicine({
      name: 'Magnesium 250MG',
      slots: ['after-dinner'],
      repeatEveryDays: 1,
      anchorDate: shiftKey(now, -2),
      durationValue: 3,
      durationUnit: 'days',
    })
    setDose(id, now, 'after-dinner', 'taken')

    const groupId = groupMedicines(getDatabase().medicines)[0].groupId
    at(`/history/${groupId}`, <MedicineHistory />, '/history/:groupId')

    const days = screen.getAllByRole('listitem')
    expect(days).toHaveLength(3)
    expect(within(days[0]).getByText('Today')).toBeTruthy()
    expect(within(days[0]).getByText(/^Taken /)).toBeTruthy()
    expect(within(days[1]).getByText('Yesterday')).toBeTruthy()
    expect(within(days[1]).getByText('Missed')).toBeTruthy()
    expect(within(days[2]).getByText('Missed')).toBeTruthy()
  })
})

describe('the app shell', () => {
  it('moves between the three tabs', async () => {
    const user = userEvent.setup()
    loadExamples()
    render(<App />)

    expect(screen.getByText('Before breakfast')).toBeTruthy()

    await user.click(screen.getByRole('link', { name: 'Medicines' }))
    expect(screen.getByRole('heading', { name: 'Medicines' })).toBeTruthy()

    await user.click(screen.getByRole('link', { name: 'History' }))
    expect(screen.getByRole('heading', { name: 'History' })).toBeTruthy()
  })
})
