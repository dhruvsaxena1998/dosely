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
import { courseStatus, groupMedicines } from '@/lib/schedule'
import { addMedicine, getDatabase, importDatabase, setDose, stopMedicine } from '@/lib/store'

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
    // A course that ran its course was not stopped, so there is no stop to undo.
    expect(screen.queryByRole('button', { name: /resume/i })).toBeNull()
  })

  it('offers Resume on a course stopped with days still left to run', () => {
    const id = addMedicine({
      name: 'Calcium with D3',
      slots: ['after-breakfast'],
      repeatEveryDays: 1,
      anchorDate: shiftKey(now, -5),
      durationValue: 30,
      durationUnit: 'days',
    })
    stopMedicine(id)
    at('/medicines', <Medicines />, '/medicines')

    expect(screen.getByText('Archive')).toBeTruthy()
    expect(screen.getByText('Stopped')).toBeTruthy()
    expect(screen.getByRole('button', { name: /resume/i })).toBeTruthy()
    // The two ways out of a closed course are one choice, never both offered.
    expect(screen.queryByRole('button', { name: /start again/i })).toBeNull()
  })

  it('offers Start again rather than Resume once the span has run out', () => {
    // Stopped a week ago, and the fortnight it was prescribed for ended two days
    // ago. Resuming would open a version with no days in it.
    importDatabase(
      JSON.stringify({
        version: 1,
        log: {},
        medicines: [
          {
            id: 'rec-1',
            groupId: 'grp-lapsed',
            name: 'Amoxicillin 500MG',
            slots: ['after-breakfast'],
            repeatEveryDays: 1,
            anchorDate: shiftKey(now, -16),
            effectiveFrom: shiftKey(now, -16),
            durationValue: 14,
            durationUnit: 'days',
            closedOn: shiftKey(now, -7),
            closedBy: 'stopped',
            createdAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      }),
    )
    at('/medicines', <Medicines />, '/medicines')

    expect(screen.getByRole('button', { name: /start again/i })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /resume/i })).toBeNull()
  })

  it('moves a resumed course out of the archive and back into Running', async () => {
    const user = userEvent.setup()
    const id = addMedicine({
      name: 'Calcium with D3',
      slots: ['after-breakfast'],
      repeatEveryDays: 1,
      anchorDate: shiftKey(now, -5),
      durationValue: 30,
      durationUnit: 'days',
    })
    stopMedicine(id)
    at('/medicines', <Medicines />, '/medicines')

    // No dialog: a resume is additive, and stopping again is one press away.
    await user.click(screen.getByRole('button', { name: /resume/i }))

    expect(screen.getByText('Running')).toBeTruthy()
    expect(screen.queryByText('Archive')).toBeNull()
    expect(screen.getByRole('button', { name: 'Stop' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /resume/i })).toBeNull()
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
    await user.click(screen.getByRole('button', { name: /^Anytime/ }))
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

  it('leaves a stopped course in the archive after a schedule change', async () => {
    const user = userEvent.setup()
    const id = addMedicine({
      name: 'Calcium with D3',
      slots: ['after-breakfast'],
      repeatEveryDays: 1,
      anchorDate: shiftKey(now, -5),
      durationValue: 30,
      durationUnit: 'days',
    })
    stopMedicine(id)
    // The card hides Edit on a stopped course, but the route answers for any
    // group id, so a bookmarked link gets here anyway.
    at(`/medicines/${id}/edit`, <MedicineForm />, '/medicines/:groupId/edit')

    await user.click(screen.getByRole('button', { name: 'After dinner' }))
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    expect(courseStatus(groupMedicines(getDatabase().medicines)[0], now)).toBe('stopped')
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

  it('fills the usual slots for a twice-a-day prescription in one press', async () => {
    const user = userEvent.setup()
    at('/medicines/new', <MedicineForm />, '/medicines/new')

    await user.type(screen.getByLabelText('Name'), 'Paracetamol 500MG or Crocin')
    await user.click(screen.getByRole('button', { name: 'Twice a day' }))

    expect(screen.getByRole('button', { name: 'After breakfast' }).getAttribute('data-state')).toBe('on')
    expect(screen.getByRole('button', { name: 'After dinner' }).getAttribute('data-state')).toBe('on')
    expect(screen.getByText('14 doses across 7 days')).toBeTruthy()
  })

  it('names what is still missing instead of only disabling the button', async () => {
    const user = userEvent.setup()
    at('/medicines/new', <MedicineForm />, '/medicines/new')

    expect(screen.getByText('Needs a name and at least one slot.')).toBeTruthy()

    await user.type(screen.getByLabelText('Name'), 'Vitamin D3 60000')
    expect(screen.getByText('Needs at least one slot.')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: /^Anytime/ }))
    expect(screen.queryByText(/^Needs /)).toBeNull()
  })

  it('keeps the schedule when adding the next medicine of the same prescription', async () => {
    const user = userEvent.setup()
    at('/medicines/new', <MedicineForm />, '/medicines/new')

    await user.type(screen.getByLabelText('Name'), 'Omeprazole 20MG')
    await user.click(screen.getByRole('button', { name: 'Before breakfast' }))
    await user.click(screen.getByRole('radio', { name: '1 month' }))
    await user.click(screen.getByRole('button', { name: 'Save and add another' }))

    expect(screen.getByText(/Added Omeprazole 20MG/)).toBeTruthy()
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('')
    expect(screen.getByRole('button', { name: 'Before breakfast' }).getAttribute('data-state')).toBe('off')

    // The second medicine of a prescription only needs a name and its slots.
    await user.type(screen.getByLabelText('Name'), 'Cetirizine 10MG')
    await user.click(screen.getByRole('button', { name: 'After dinner' }))
    await user.click(screen.getByRole('button', { name: 'Add medicine' }))

    const groups = groupMedicines(getDatabase().medicines)
    expect(groups.map((g) => g.current.name)).toEqual(['Cetirizine 10MG', 'Omeprazole 20MG'])
    for (const g of groups) {
      expect(g.current.durationValue).toBe(1)
      expect(g.current.durationUnit).toBe('months')
    }
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
