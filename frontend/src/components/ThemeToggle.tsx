import { toggleTheme, useTheme } from '../lib/themeMode'

/** The light/dark switch in the top bar. Also: THEME in the command bar, or Alt+T. */
export function ThemeToggle() {
  const mode = useTheme()
  const label = mode === 'dark' ? 'Switch to light mode (Alt T)' : 'Switch to dark mode (Alt T)'
  return (
    <button className="theme-toggle icon-btn" onClick={toggleTheme} title={label} aria-label={label}>
      {mode === 'dark' ? (
        // Sun: what you'll get.
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="8" cy="8" r="3" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path
            d="M8 1v1.8M8 13.2V15M1 8h1.8M13.2 8H15M3 3l1.3 1.3M11.7 11.7 13 13M3 13l1.3-1.3M11.7 4.3 13 3"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M13.5 9.8A5.8 5.8 0 0 1 6.2 2.5a5.8 5.8 0 1 0 7.3 7.3Z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  )
}
