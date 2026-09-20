import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ReminderLanding } from '@/screens/Reminder'
import { IPHONE, MAC, PIXEL, pretendAgent } from '@/test/agent'
import { importDatabase } from '@/lib/store'

beforeEach(() => {
  importDatabase(JSON.stringify({ version: 1, medicines: [], log: {} }))
})

describe('where a reminder lands in a browser', () => {
  // The failure this page exists to prevent: an empty medicine list reads as
  // lost data, not as the wrong window.
  it('says the data is not gone, it is in the other window', () => {
    pretendAgent(IPHONE)
    render(<ReminderLanding />)
    expect(screen.getByText(/nothing has been lost/)).toBeTruthy()
    expect(screen.getByText(/This tab cannot see your/)).toBeTruthy()
  })

  it('points at the home screen icon on an iPhone, which is the only way back', () => {
    pretendAgent(IPHONE)
    render(<ReminderLanding />)
    expect(screen.getByText(/icon on your/)).toBeTruthy()
    expect(screen.queryByRole('link', { name: /Open Dosely/ })).toBeNull()
  })

  it('offers Android the button, because Android can actually do the handover', () => {
    pretendAgent(PIXEL)
    render(<ReminderLanding />)
    const link = screen.getByRole('link', { name: /Open Dosely/ })
    expect(link.getAttribute('href')).toMatch(/^intent:\/\//)
    expect(link.getAttribute('href')).toContain('scheme=https')
  })

  it('gives Android somewhere to go when the handover does not take', () => {
    pretendAgent(PIXEL)
    render(<ReminderLanding />)
    expect(screen.getByText(/does not open the app/)).toBeTruthy()
  })

  it('treats a desktop browser like the iPhone, since neither gets the intent trick', () => {
    pretendAgent(MAC)
    render(<ReminderLanding />)
    expect(screen.queryByRole('link', { name: /Open Dosely/ })).toBeNull()
  })

  it('says why opening the app is worth the trouble', () => {
    pretendAgent(IPHONE)
    render(<ReminderLanding />)
    expect(screen.getByText(/books the next three days/)).toBeTruthy()
  })

  it('shows no medicines, because this copy has none and must not imply otherwise', () => {
    pretendAgent(IPHONE)
    render(<ReminderLanding />)
    expect(screen.queryByRole('button', { name: /Today/ })).toBeNull()
    expect(screen.queryByText(/dose due/)).toBeNull()
  })
})
