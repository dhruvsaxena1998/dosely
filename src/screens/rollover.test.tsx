import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { History } from '@/screens/History'
import { Medicines } from '@/screens/Medicines'
import { Today } from '@/screens/Today'
import { addMedicine, getDatabase, importDatabase } from '@/lib/store'

/**
 * A copy of Dosely left open across the 3am rollover. Everything here drives a
 * screen and asserts on what a person would see, because the bug is not that
 * the clock is wrong — it is that the screen never asked it again.
 *
 * These are the suite's only tests on fake timers, and they press with
 * `fireEvent` rather than `userEvent` for that reason: userEvent goes through
 * Testing Library's async wrapper, which drains the microtask queue behind a
 * `setTimeout(0)` it only knows how to advance when the fake timers are jest's.
 * Under vitest's, every simulated click hangs until the test times out.
 */

const MONDAY = '2026-06-01'
const TUESDAY = '2026-06-02'
/** What the header stamps under the day name. */
const MONDAY_STAMP = '1 Jun 2026'
const TUESDAY_STAMP = '2 Jun 2026'

/** Late on Monday, phone going down on the bedside table. */
const BEDTIME = new Date(2026, 5, 1, 22, 0, 0)
/** Tuesday morning, well past the rollover. */
const MORNING = new Date(2026, 5, 2, 8, 0, 0)

const HOUR = 60 * 60 * 1000

function reset() {
  importDatabase(JSON.stringify({ version: 1, medicines: [], log: {} }))
}

function daily(name: string, anchorDate: string, durationValue = 7) {
  return addMedicine({
    name,
    slots: ['after-breakfast'],
    repeatEveryDays: 1,
    anchorDate,
    durationValue,
    durationUnit: 'days',
  })
}

function renderToday() {
  return render(
    <MemoryRouter>
      <Today />
    </MemoryRouter>,
  )
}

function at(path: string, element: React.ReactNode, pattern: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={pattern} element={element} />
      </Routes>
    </MemoryRouter>,
  )
}

/** Time passes with the app awake, so the armed timer gets to fire. */
function timePasses(hours: number) {
  act(() => {
    vi.advanceTimersByTime(hours * HOUR)
  })
}

/**
 * A phone that was asleep. The clock moved and the timer never fired, which is
 * the shape of the real bug on iOS — only the resume can save it.
 */
function resumesAt(when: Date) {
  vi.setSystemTime(when)
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'))
  })
}

function header() {
  return screen.getByRole('button', { name: /pick a date/i })
}

function section(title: string) {
  // A prefix, because the Archive's heading carries its count as well.
  return screen.getByRole('heading', { name: new RegExp(`^${title}`) }).closest('section')!
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(BEDTIME)
  reset()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('the day rolling over under the Today screen', () => {
  it('follows the rollover when the screen was on today', () => {
    daily('Metformin 500MG', MONDAY)
    renderToday()

    expect(within(header()).getByText('Today')).toBeTruthy()
    expect(within(header()).getByText(MONDAY_STAMP)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Metformin 500MG' }))
    expect(within(header()).getByText('All done')).toBeTruthy()

    timePasses(6)

    expect(within(header()).getByText('Today')).toBeTruthy()
    expect(within(header()).getByText(TUESDAY_STAMP)).toBeTruthy()
    expect(within(header()).getByText('1 left')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Metformin 500MG' }).getAttribute('aria-pressed')).toBe('false')
  })

  it('ticks a dose onto the new day once the day has turned', () => {
    const groupId = daily('Metformin 500MG', MONDAY)
    renderToday()

    timePasses(6)
    fireEvent.click(screen.getByRole('button', { name: 'Metformin 500MG' }))

    const log = getDatabase().log
    expect(log[`${groupId}|${TUESDAY}|after-breakfast`]?.state).toBe('taken')
    expect(log[`${groupId}|${MONDAY}|after-breakfast`]).toBeUndefined()
  })

  it('stays on a day the user walked to, and relabels it', () => {
    daily('Metformin 500MG', '2026-05-28')
    renderToday()

    fireEvent.click(screen.getByRole('button', { name: /previous day/i }))
    expect(within(header()).getByText('Yesterday')).toBeTruthy()
    expect(within(header()).getByText('31 May 2026')).toBeTruthy()

    timePasses(6)

    // Still Sunday, because that is where they put themselves. What moved is
    // what Sunday is called now that it is two days back.
    expect(within(header()).getByText('31 May 2026')).toBeTruthy()
    expect(within(header()).queryByText('Yesterday')).toBeNull()
    expect(within(header()).getByText('Sun 31 May')).toBeTruthy()
  })

  it('moves off a day that the rollover has just locked', () => {
    daily('Metformin 500MG', '2026-05-25')
    renderToday()

    const back = screen.getByRole('button', { name: /previous day/i })
    for (let i = 0; i < 3; i += 1) fireEvent.click(back)
    expect(within(header()).getByText('29 May 2026')).toBeTruthy()
    expect(back.hasAttribute('disabled')).toBe(true)

    timePasses(6)

    // The backfill floor rolled forward with the day, so 29 May is now out of
    // reach and the screen is on the oldest day it is still allowed to edit.
    expect(within(header()).getByText('30 May 2026')).toBeTruthy()
    expect(screen.getByRole('button', { name: /previous day/i }).hasAttribute('disabled')).toBe(true)
  })

  it('corrects itself on resume, even though the timer never fired', () => {
    daily('Metformin 500MG', MONDAY)
    renderToday()
    expect(within(header()).getByText(MONDAY_STAMP)).toBeTruthy()

    resumesAt(MORNING)

    expect(within(header()).getByText(TUESDAY_STAMP)).toBeTruthy()
    expect(within(header()).getByText('Today')).toBeTruthy()
  })

  it('corrects itself when a tab comes back out of the bfcache', () => {
    daily('Metformin 500MG', MONDAY)
    renderToday()

    vi.setSystemTime(MORNING)
    act(() => {
      window.dispatchEvent(new Event('pageshow'))
    })

    expect(within(header()).getByText(TUESDAY_STAMP)).toBeTruthy()
  })

  it('changes nothing when a resume has not crossed a boundary', () => {
    daily('Metformin 500MG', MONDAY)
    renderToday()

    resumesAt(new Date(2026, 5, 1, 23, 30, 0))

    expect(within(header()).getByText('Today')).toBeTruthy()
    expect(within(header()).getByText(MONDAY_STAMP)).toBeTruthy()
  })
})

describe('the day rolling over under the other screens', () => {
  it('files a course that ended overnight under the archive', () => {
    daily('Amoxicillin 500MG', '2026-05-26')
    at('/medicines', <Medicines />, '/medicines')
    expect(within(section('Running')).getByText('Amoxicillin 500MG')).toBeTruthy()

    timePasses(6)

    // The Archive is folded, and says in its count that something arrived.
    const archive = section('Archive')
    expect(within(archive).getByText('1')).toBeTruthy()
    fireEvent.click(within(archive).getByRole('button'))
    expect(within(section('Archive')).getByText('Amoxicillin 500MG')).toBeTruthy()
  })

  it('starts a course that begins today without a reload', () => {
    daily('Vitamin D3', TUESDAY)
    at('/medicines', <Medicines />, '/medicines')
    expect(within(section('Not started')).getByText('Vitamin D3')).toBeTruthy()

    timePasses(6)

    expect(within(section('Running')).getByText('Vitamin D3')).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Not started' })).toBeNull()
  })

  it('counts a dose that was never ticked as missed once the day turns', () => {
    daily('Metformin 500MG', MONDAY)
    at('/history', <History />, '/history')
    expect(screen.queryByText(/missed/)).toBeNull()

    timePasses(6)

    expect(screen.getByText(/1 missed/)).toBeTruthy()
  })
})
