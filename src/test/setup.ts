import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

afterEach(cleanup)

// jsdom ships no matchMedia at all, and the app asks it about the colour
// scheme and about whether it is running as an installed app. Answer no to
// everything, which is what a plain browser tab would say.
if (!window.matchMedia) {
  window.matchMedia = (media: string) =>
    ({
      media,
      matches: false,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList
}

// A Radix select asks the element it is opening from about pointer capture and
// then scrolls the chosen option into view. jsdom has neither method, so the
// first press on any select throws before the list ever opens. These are the
// no-ops a browser would answer with when nothing is captured.
if (!window.HTMLElement.prototype.hasPointerCapture) {
  window.HTMLElement.prototype.hasPointerCapture = () => false
  window.HTMLElement.prototype.setPointerCapture = () => {}
  window.HTMLElement.prototype.releasePointerCapture = () => {}
  window.HTMLElement.prototype.scrollIntoView = () => {}
}
