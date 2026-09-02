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
import { addMedicine, deleteMedicine, getDatabase, importDatabase, setDose, stopMedicine } from '@/lib/store'

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

/** The Archive is folded until asked for, so anything in it takes a press first. */
async function openArchive(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /^Archive/ }))
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

  it('files a finished course under the archive with a restart button', async () => {
    const user = userEvent.setup()
    addMedicine({
      name: 'Omeprazole 20MG',
      slots: ['before-breakfast'],
      repeatEveryDays: 1,
      anchorDate: shiftKey(now, -10),
      durationValue: 7,
      durationUnit: 'days',
    })
    at('/medicines', <Medicines />, '/medicines')
    await openArchive(user)

    expect(screen.getByText('Archive')).toBeTruthy()
    expect(screen.getByRole('link', { name: /start again/i })).toBeTruthy()
    // A course that ran its course was not stopped, so there is no stop to undo.
    expect(screen.queryByRole('button', { name: /resume/i })).toBeNull()
  })

  it('offers Resume on a course stopped with days still left to run', async () => {
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
    await openArchive(user)

    expect(screen.getByText('Archive')).toBeTruthy()
    expect(screen.getByText('Stopped')).toBeTruthy()
    expect(screen.getByRole('button', { name: /resume/i })).toBeTruthy()
    // The two ways out of a closed course are one choice, never both offered.
    expect(screen.queryByRole('link', { name: /start again/i })).toBeNull()
  })

  it('offers Start again rather than Resume once the span has run out', async () => {
    const user = userEvent.setup()
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
    await openArchive(user)

    expect(screen.getByRole('link', { name: /start again/i })).toBeTruthy()
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
    await openArchive(user)

    // No dialog: a resume is additive, and stopping again is one press away.
    await user.click(screen.getByRole('button', { name: /resume/i }))

    expect(screen.getByText('Running')).toBeTruthy()
    expect(screen.queryByText('Archive')).toBeNull()
    expect(screen.getByRole('button', { name: 'Stop' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /resume/i })).toBeNull()
  })

  it('folds the Archive to a line with a count, and opens it on a press', async () => {
    const user = userEvent.setup()
    const id = addMedicine({
      name: 'Amoxicillin 500MG',
      slots: ['after-breakfast'],
      repeatEveryDays: 1,
      anchorDate: shiftKey(now, -5),
      durationValue: 30,
      durationUnit: 'days',
    })
    stopMedicine(id)
    at('/medicines', <Medicines />, '/medicines')

    // Shut, the count is the only thing saying there is anything in there.
    const fold = screen.getByRole('button', { name: /^Archive/ })
    expect(fold.getAttribute('aria-expanded')).toBe('false')
    expect(within(fold).getByText('1')).toBeTruthy()
    expect(screen.queryByText('Amoxicillin 500MG')).toBeNull()

    await user.click(fold)
    expect(screen.getByText('Amoxicillin 500MG')).toBeTruthy()
    expect(screen.getByRole('button', { name: /^Archive/ }).getAttribute('aria-expanded')).toBe('true')
  })

  it('does not fold the sections that cannot grow without bound', () => {
    loadExamples()
    at('/medicines', <Medicines />, '/medicines')

    expect(screen.getByText('Running')).toBeTruthy()
    expect(screen.getByText('Not started')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^Running/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Not started/ })).toBeNull()
  })

  it('filters every section by name, whatever the case it is typed in', async () => {
    const user = userEvent.setup()
    loadExamples()
    at('/medicines', <Medicines />, '/medicines')

    await user.type(screen.getByLabelText('Find a medicine'), 'vitamin')

    // A plain substring, so Multivitamin is a hit on the same footing as the
    // three medicines whose names begin with it.
    expect(screen.getByText('Multivitamin')).toBeTruthy()
    expect(screen.getByText('Vitamin B12')).toBeTruthy()
    expect(screen.queryByText('Omeprazole 20MG')).toBeNull()
    // A match still says which section it is in: Vitamin C starts in three days.
    expect(screen.getByText('Running')).toBeTruthy()
    expect(screen.getByText('Not started')).toBeTruthy()

    await user.clear(screen.getByLabelText('Find a medicine'))
    await user.type(screen.getByLabelText('Find a medicine'), 'OMEPRAZOLE')
    expect(screen.getByText('Omeprazole 20MG')).toBeTruthy()
    expect(screen.queryByText('Multivitamin')).toBeNull()
    // A section with no match draws nothing at all, heading included.
    expect(screen.queryByText('Not started')).toBeNull()
  })

  it('reveals a match inside the folded Archive, then hands the fold back', async () => {
    const user = userEvent.setup()
    loadExamples()
    stopMedicine(groupMedicines(getDatabase().medicines).find((g) => g.current.name === 'Calcium with D3')!.groupId)
    at('/medicines', <Medicines />, '/medicines')

    expect(screen.queryByText('Calcium with D3')).toBeNull()

    // A fold must never be able to swallow the thing being looked for.
    await user.type(screen.getByLabelText('Find a medicine'), 'calcium')
    expect(screen.getByText('Calcium with D3')).toBeTruthy()

    // Cleared, the section goes back to shut — which is where it was left, not
    // where the search put it.
    await user.clear(screen.getByLabelText('Find a medicine'))
    expect(screen.queryByText('Calcium with D3')).toBeNull()
    expect(screen.getByRole('button', { name: /^Archive/ }).getAttribute('aria-expanded')).toBe('false')
  })

  it('leaves the Archive open after a search when that is how it was left', async () => {
    const user = userEvent.setup()
    loadExamples()
    stopMedicine(groupMedicines(getDatabase().medicines).find((g) => g.current.name === 'Calcium with D3')!.groupId)
    at('/medicines', <Medicines />, '/medicines')

    await openArchive(user)
    await user.type(screen.getByLabelText('Find a medicine'), 'vitamin')
    await user.clear(screen.getByLabelText('Find a medicine'))

    expect(screen.getByText('Calcium with D3')).toBeTruthy()
  })

  it('says when nothing matches, and offers the way back', async () => {
    const user = userEvent.setup()
    loadExamples()
    at('/medicines', <Medicines />, '/medicines')

    await user.type(screen.getByLabelText('Find a medicine'), 'ibuprofen')

    expect(screen.getByText('Nothing found')).toBeTruthy()
    expect(screen.queryByText('Running')).toBeNull()

    await user.click(screen.getByRole('button', { name: /clear the search/i }))
    expect(screen.getByText('Multivitamin')).toBeTruthy()
  })

  it('keeps the search field away until there are enough medicines to need it', () => {
    addMedicine({
      name: 'Amoxicillin 500MG',
      slots: ['after-breakfast'],
      repeatEveryDays: 1,
      anchorDate: now,
      durationValue: 7,
      durationUnit: 'days',
    })
    const one = at('/medicines', <Medicines />, '/medicines')
    expect(screen.queryByLabelText('Find a medicine')).toBeNull()
    one.unmount()

    loadExamples()
    at('/medicines', <Medicines />, '/medicines')
    expect(screen.getByLabelText('Find a medicine')).toBeTruthy()
  })

  it('forgets the search when the screen goes away', async () => {
    const user = userEvent.setup()
    loadExamples()
    const first = at('/medicines', <Medicines />, '/medicines')

    await user.type(screen.getByLabelText('Find a medicine'), 'vitamin')
    expect(screen.queryByText('Omeprazole 20MG')).toBeNull()
    first.unmount()

    // A lens, not a setting: nothing about it outlives the screen.
    at('/medicines', <Medicines />, '/medicines')
    expect((screen.getByLabelText('Find a medicine') as HTMLInputElement).value).toBe('')
    expect(screen.getByText('Omeprazole 20MG')).toBeTruthy()
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
    // Deleting files the card in the Archive, which is shut.
    await openArchive(user)

    expect(screen.getByText('Deleted')).toBeTruthy()
    expect(screen.getByRole('button', { name: /restore/i })).toBeTruthy()
    expect(Object.keys(getDatabase().log)).toHaveLength(1)
  })

  it('deletes forever from the archive, history and all', async () => {
    const user = userEvent.setup()
    const id = addMedicine({
      name: 'Calcium with D3',
      slots: ['after-breakfast'],
      repeatEveryDays: 1,
      anchorDate: shiftKey(now, -1),
      durationValue: 30,
      durationUnit: 'days',
    })
    setDose(id, shiftKey(now, -1), 'after-breakfast', 'taken')
    deleteMedicine(id)
    at('/medicines', <Medicines />, '/medicines')
    await openArchive(user)

    expect(screen.getByRole('button', { name: /delete forever/i })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: /delete forever/i }))
    // The warning names the price before it is paid.
    expect(screen.getByText(/cannot be undone/)).toBeTruthy()
    await user.click(screen.getByRole('button', { name: /^Delete forever$/ }))

    // The card is gone from the archive — there is nothing left to restore —
    // and the History screen has nothing left to read.
    expect(screen.queryByText('Calcium with D3')).toBeNull()
    expect(getDatabase().log).toEqual({})
  })

  it('sends Start again to the add form rather than creating a course', async () => {
    const user = userEvent.setup()
    const id = finishedCourse()
    at('/medicines', <Medicines />, '/medicines')
    await openArchive(user)

    const link = screen.getByRole('link', { name: /start again/i })
    expect(link.getAttribute('href')).toBe(`/medicines/new?from=${id}`)
    // The press used to be the mutation. Nothing exists until the form is saved.
    expect(groupMedicines(getDatabase().medicines)).toHaveLength(1)
  })
})

/** What a labelled field currently holds. */
function value(label: string): string {
  return (screen.getByLabelText(label) as HTMLInputElement | HTMLTextAreaElement).value
}

/**
 * A course that ran its full length and ended two weeks back. Start again is
 * what a card offers by then, there being nothing left to resume into.
 */
function finishedCourse(): string {
  return addMedicine({
    name: 'Amoxicillin 500MG',
    note: 'With food',
    slots: ['after-breakfast', 'after-dinner'],
    repeatEveryDays: 1,
    anchorDate: shiftKey(now, -20),
    durationValue: 14,
    durationUnit: 'days',
  })
}

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

  it('opens Start again prefilled, but starting today rather than when the old course did', () => {
    const id = finishedCourse()
    at(`/medicines/new?from=${id}`, <MedicineForm />, '/medicines/new')

    // An add, not an edit: saving seals the old course under its own group.
    expect(screen.getByRole('heading', { name: /add medicine/i })).toBeTruthy()
    expect(value('Name')).toBe('Amoxicillin 500MG')
    expect(value('Note')).toBe('With food')
    expect(screen.getByRole('button', { name: 'After breakfast' }).getAttribute('data-state')).toBe('on')
    expect(screen.getByRole('button', { name: 'After dinner' }).getAttribute('data-state')).toBe('on')
    expect(screen.getByRole('radio', { name: 'Daily' }).getAttribute('data-state')).toBe('on')
    expect(value('Runs for')).toBe('14')
    // The one field that is not carried over. A repeat prescription starts when
    // the pharmacy hands it over.
    expect(value('Starts on')).toBe(now)
    expect(screen.getByText('28 doses across 14 days')).toBeTruthy()
  })

  it('does not warn that Start again duplicates the course it came from', () => {
    const id = finishedCourse()
    at(`/medicines/new?from=${id}`, <MedicineForm />, '/medicines/new')

    expect(screen.queryByText(/you already have a course called/i)).toBeNull()
  })

  it('creates nothing by opening Start again, and offers a way back out', () => {
    finishedCourse()
    at(`/medicines/new?from=${getDatabase().medicines[0].groupId}`, <MedicineForm />, '/medicines/new')

    expect(groupMedicines(getDatabase().medicines)).toHaveLength(1)
    expect(screen.getByRole('link', { name: 'Cancel' }).getAttribute('href')).toBe('/medicines')
  })

  it('takes a new duration before the course exists, and leaves the old one sealed', async () => {
    const user = userEvent.setup()
    const id = finishedCourse()
    at(`/medicines/new?from=${id}`, <MedicineForm />, '/medicines/new')

    // The length you are most likely to want to change, and the reason this is
    // a form rather than a button.
    const duration = screen.getByLabelText('Runs for')
    await user.clear(duration)
    await user.type(duration, '7')
    await user.click(screen.getByRole('button', { name: 'Add medicine' }))

    const groups = groupMedicines(getDatabase().medicines)
    expect(groups).toHaveLength(2)
    const repeat = groups.find((g) => g.groupId !== id)!
    expect(repeat.current.durationValue).toBe(7)
    expect(repeat.current.anchorDate).toBe(now)
    expect(courseStatus(repeat, now)).toBe('active')

    // The course it repeats is untouched: same single version, same span.
    const source = groups.find((g) => g.groupId === id)!
    expect(source.records).toHaveLength(1)
    expect(source.current.durationValue).toBe(14)
    expect(source.current.anchorDate).toBe(shiftKey(now, -20))
    expect(courseStatus(source, now)).toBe('finished')
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
