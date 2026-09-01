import { useSyncExternalStore } from 'react'

export type Theme = 'system' | 'light' | 'dark'

const STORAGE_KEY = 'dosely.theme'
const THEME_COLOR = { light: '#f7f6f3', dark: '#191d23' }

const listeners = new Set<() => void>()

function read(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY)
  return stored === 'light' || stored === 'dark' ? stored : 'system'
}

let theme: Theme = read()

export function resolveTheme(value: Theme): 'light' | 'dark' {
  if (value !== 'system') return value
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function applyTheme(value: Theme) {
  const resolved = resolveTheme(value)
  document.documentElement.classList.toggle('dark', resolved === 'dark')
  document.documentElement.style.colorScheme = resolved
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
    meta.setAttribute('content', THEME_COLOR[resolved])
  }
}

export function setTheme(value: Theme) {
  theme = value
  if (value === 'system') localStorage.removeItem(STORAGE_KEY)
  else localStorage.setItem(STORAGE_KEY, value)
  applyTheme(value)
  for (const listener of listeners) listener()
}

export function useTheme(): Theme {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    () => theme,
  )
}

/** Re-resolve when the OS flips, but only while the user is following it. */
export function startTheme() {
  applyTheme(theme)
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (theme === 'system') applyTheme(theme)
  })
}
