import { useSyncExternalStore } from 'react'

/**
 * Chrome's offer to install, handed over once and withdrawn again if nobody
 * takes it. Not in lib.dom, because it is not in any spec browsers agree on.
 */
interface InstallOffer extends Event {
  prompt(): Promise<void>
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/** Which set of instructions a visitor needs, since no two platforms agree. */
export type Surface = 'ios' | 'android' | 'desktop'

export type InstallState = {
  /** Running from a home screen icon or an app window rather than a tab. */
  installed: boolean
  /** The browser has said it will install on request, so we can offer a button. */
  offerable: boolean
}

/**
 * Every display mode that means "not a browser tab". A manifest asking for
 * standalone usually gets it, but a browser is free to hand back any of these,
 * and window-controls-overlay is what a desktop install looks like.
 */
const APP_MODES = ['standalone', 'fullscreen', 'minimal-ui', 'window-controls-overlay']

function readInstalled(): boolean {
  // iOS predates display-mode by years and still answers with its own flag.
  if ((navigator as Navigator & { standalone?: boolean }).standalone) return true
  return APP_MODES.some((mode) => window.matchMedia(`(display-mode: ${mode})`).matches)
}

export function readSurface(): Surface {
  const agent = navigator.userAgent
  if (/iphone|ipod|ipad/i.test(agent)) return 'ios'
  // iPadOS calls itself a Mac and is told apart only by having a touchscreen.
  if (/macintosh/i.test(agent) && navigator.maxTouchPoints > 1) return 'ios'
  if (/android/i.test(agent)) return 'android'
  return 'desktop'
}

let offer: InstallOffer | undefined

const listeners = new Set<() => void>()

/**
 * Read fresh every time rather than cached on an event, because iOS announces
 * nothing: navigator.standalone is the only thing that ever knew, and the
 * answer can only be had by asking. The last object is handed back when the
 * answer has not moved, since useSyncExternalStore spins on a new one.
 */
let snapshot: InstallState = { installed: false, offerable: false }

function currentState(): InstallState {
  const installed = readInstalled()
  const offerable = offer !== undefined
  if (installed !== snapshot.installed || offerable !== snapshot.offerable) {
    snapshot = { installed, offerable }
  }
  return snapshot
}

function announce() {
  for (const listener of listeners) listener()
}

/**
 * The offer arrives early and unbidden, before React has mounted anything, and
 * a listener attached on mount misses it. So this binds at import instead.
 */
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    // Left alone, Chrome shows its own bar asking the question the install
    // screen is already asking, and the offer is not ours to keep.
    event.preventDefault()
    offer = event as InstallOffer
    announce()
  })
  window.addEventListener('appinstalled', () => {
    offer = undefined
    announce()
  })
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  // A tab can become an app window without reloading, and the gate has to come
  // down when it does.
  const queries = APP_MODES.map((mode) => window.matchMedia(`(display-mode: ${mode})`))
  for (const query of queries) query.addEventListener('change', announce)
  return () => {
    listeners.delete(listener)
    for (const query of queries) query.removeEventListener('change', announce)
  }
}

export function useInstallState(): InstallState {
  return useSyncExternalStore(subscribe, currentState)
}

/**
 * Takes the browser up on its offer. One offer is good for one prompt, and a
 * dismissed one is not handed back, which is why the written steps stay on
 * screen beside the button rather than behind it.
 */
export async function install(): Promise<void> {
  if (!offer) return
  const pending = offer
  offer = undefined
  announce()
  try {
    await pending.prompt()
    await pending.userChoice
  } catch {
    // A prompt the browser declined to show is not an error worth a state; the
    // steps are still on screen.
  }
  announce()
}

/**
 * Whether an uninstalled visit should be stopped at the door. The gate is a
 * stance about the shipped app: vite dev serves a desktop tab as often as a
 * phone, and a gate that blocks the dev loop is a gate that gets deleted.
 * `?gate` puts it back so it can be checked from a phone against the dev
 * server, where a service worker and a real install are not available.
 */
export function gateEnforced(): boolean {
  if (import.meta.env.PROD) return true
  return new URLSearchParams(window.location.search).has('gate')
}
