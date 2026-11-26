import { useSyncExternalStore } from 'react'

export type ThemeMode = 'dark' | 'light'

/** Also read by the inline script in index.html, which applies the theme before the first paint. */
export const THEME_KEY = 'stodash.theme.v1'

function stored(): ThemeMode {
  try {
    return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

let current: ThemeMode = stored()
const listeners = new Set<() => void>()

export const getTheme = () => current

/** Switches the theme everywhere: the <html data-theme> attribute (CSS tokens), canvas charts, and localStorage. */
export function setTheme(mode: ThemeMode) {
  current = mode
  document.documentElement.dataset.theme = mode
  try {
    localStorage.setItem(THEME_KEY, mode)
  } catch {
    /* storage disabled: the choice lasts until reload */
  }
  listeners.forEach((l) => l())
}

export const toggleTheme = () => setTheme(current === 'dark' ? 'light' : 'dark')

/** The current theme; re-renders when it changes. */
export function useTheme(): ThemeMode {
  return useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange)
      return () => listeners.delete(onChange)
    },
    getTheme,
  )
}
