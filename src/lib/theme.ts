import { useSyncExternalStore } from 'react'
import { isPaletteId, paletteById, type PaletteId } from '@/lib/palettes'

/** Whether the lights are on. Independent of which palette is printing. */
export type Mode = 'system' | 'light' | 'dark'

/** Kept for the settings screen and anything that wants both axes at once. */
export interface ThemeState {
  mode: Mode
  palette: PaletteId
}

const MODE_KEY = 'dosely.theme'
const PALETTE_KEY = 'dosely.palette'

const listeners = new Set<() => void>()

function readMode(): Mode {
  const stored = localStorage.getItem(MODE_KEY)
  return stored === 'light' || stored === 'dark' ? stored : 'system'
}

function readPalette(): PaletteId {
  const stored = localStorage.getItem(PALETTE_KEY)
  return isPaletteId(stored) ? stored : 'foil'
}

let state: ThemeState = { mode: readMode(), palette: readPalette() }

/** The snapshot must be referentially stable or useSyncExternalStore will spin. */
let snapshot: ThemeState = state

export function resolveMode(value: Mode): 'light' | 'dark' {
  if (value !== 'system') return value
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/**
 * The address bar and the iOS status bar have to match whatever the palette
 * turned out to be, and nine palettes is too many to keep a table of. Read the
 * background back off the document instead, so it can never drift.
 */
function syncBrowserChrome() {
  const background = getComputedStyle(document.documentElement).backgroundColor
  if (!background) return
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
    meta.setAttribute('content', background)
  }
}

export function applyTheme({ mode, palette }: ThemeState) {
  const resolved = resolveMode(mode)
  const root = document.documentElement
  root.classList.toggle('dark', resolved === 'dark')
  root.dataset.palette = palette
  root.style.colorScheme = resolved
  syncBrowserChrome()
}

function commit(next: ThemeState) {
  state = next
  snapshot = next
  applyTheme(next)
  for (const listener of listeners) listener()
}

export function setMode(mode: Mode) {
  if (mode === 'system') localStorage.removeItem(MODE_KEY)
  else localStorage.setItem(MODE_KEY, mode)
  commit({ ...state, mode })
}

export function setPalette(palette: PaletteId) {
  if (palette === 'foil') localStorage.removeItem(PALETTE_KEY)
  else localStorage.setItem(PALETTE_KEY, palette)
  // Paint the colours now and let the type swap in behind them. Blocking the
  // switch on a font download would make the picker feel broken on a slow
  // connection, and @font-face already renders a fallback in the meantime.
  commit({ ...state, palette })
  void loadPaletteFonts(palette)
}

/** Fetches a palette's typefaces. Safe to call repeatedly; imports are cached. */
export function loadPaletteFonts(palette: PaletteId): Promise<unknown> {
  return paletteById(palette).loadFonts().then(syncBrowserChrome, () => undefined)
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useThemeState(): ThemeState {
  return useSyncExternalStore(subscribe, () => snapshot)
}

export function useMode(): Mode {
  return useSyncExternalStore(subscribe, () => snapshot.mode)
}

export function usePalette(): PaletteId {
  return useSyncExternalStore(subscribe, () => snapshot.palette)
}

/**
 * Light or dark after 'system' has been resolved. Subscribes to the OS query
 * as well as the store, so anything previewing a surface stays correct when
 * the machine flips at sunset and the user never touched a setting.
 */
export function useResolvedMode(): 'light' | 'dark' {
  return useSyncExternalStore(
    (listener) => {
      const query = window.matchMedia('(prefers-color-scheme: dark)')
      query.addEventListener('change', listener)
      const unsubscribe = subscribe(listener)
      return () => {
        query.removeEventListener('change', listener)
        unsubscribe()
      }
    },
    () => resolveMode(snapshot.mode),
  )
}

/** Re-resolve when the OS flips, but only while the user is following it. */
export function startTheme() {
  applyTheme(state)
  void loadPaletteFonts(state.palette)
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (state.mode === 'system') applyTheme(state)
  })
}
