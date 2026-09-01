import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from '@/App'
import { Install } from '@/screens/Install'
import { IPHONE, PIXEL, WINDOWS, pretendAgent } from '@/test/agent'

/** Chrome's offer, as far as the screen is concerned. */
function offerInstall() {
  const event = Object.assign(new Event('beforeinstallprompt'), {
    prompt: vi.fn().mockResolvedValue(undefined),
    userChoice: Promise.resolve({ outcome: 'accepted' as const }),
  })
  act(() => {
    window.dispatchEvent(event)
  })
  return event
}

beforeEach(() => {
  window.history.replaceState({}, '', '/')
})

afterEach(() => {
  // The offer is module state, and a stale one would leak into the next test.
  act(() => {
    window.dispatchEvent(new Event('appinstalled'))
  })
})

describe('the install screen', () => {
  it('gives an iPhone the share sheet steps', () => {
    pretendAgent(IPHONE)
    render(<Install />)

    expect(screen.getByText(/share button/i)).toBeTruthy()
    expect(screen.getByText(/Add to Home Screen/)).toBeTruthy()
  })

  it('gives Android the browser menu steps', () => {
    pretendAgent(PIXEL)
    render(<Install />)

    expect(screen.getByText(/browser menu/i)).toBeTruthy()
    expect(screen.getByText(/Install app/)).toBeTruthy()
  })

  it('falls back to the address bar on a desktop', () => {
    pretendAgent(WINDOWS)
    render(<Install />)

    expect(screen.getByText(/address bar/i)).toBeTruthy()
  })

  it('offers a button only once the browser says it will install', async () => {
    pretendAgent(PIXEL)
    render(<Install />)
    expect(screen.queryByRole('button', { name: /install dosely/i })).toBeNull()

    const offer = offerInstall()
    const button = screen.getByRole('button', { name: /install dosely/i })

    await userEvent.click(button)
    expect(offer.prompt).toHaveBeenCalled()
  })

  it('never hides the written steps behind that button', () => {
    pretendAgent(IPHONE)
    render(<Install />)
    offerInstall()

    expect(screen.getByText(/Add to Home Screen/)).toBeTruthy()
  })

  it('sends you to the icon once it has installed', () => {
    pretendAgent(PIXEL)
    render(<Install />)
    act(() => {
      window.dispatchEvent(new Event('appinstalled'))
    })

    expect(screen.getByText('Installed')).toBeTruthy()
    expect(screen.getByText(/this tab is not where it runs/i)).toBeTruthy()
    expect(screen.queryByText(/browser menu/i)).toBeNull()
  })
})

describe('the gate', () => {
  it('stops a tab at the door', () => {
    pretendAgent(IPHONE)
    window.history.replaceState({}, '', '/?gate')
    render(<App />)

    expect(screen.getByText(/lives on your home screen/i)).toBeTruthy()
    expect(screen.queryByRole('navigation')).toBeNull()
  })

  it('lets an installed app through', () => {
    pretendAgent(IPHONE)
    window.history.replaceState({}, '', '/?gate')
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query) =>
        ({
          matches: query.includes('display-mode: standalone'),
          media: query,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          addListener: vi.fn(),
          removeListener: vi.fn(),
          onchange: null,
          dispatchEvent: vi.fn(),
        }) as unknown as MediaQueryList,
    )
    render(<App />)

    expect(screen.queryByText(/lives on your home screen/i)).toBeNull()
    // "Today" is both the tab and the heading, so the nav is the clearer tell.
    expect(screen.getByRole('navigation')).toBeTruthy()
  })
})
