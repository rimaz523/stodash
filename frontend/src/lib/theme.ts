/**
 * Colors for the canvas charts, read from the CSS tokens in index.css at the moment of the call, so they follow the
 * light/dark theme. Call it again after the theme changes (charts re-read it when `useTheme()` changes).
 */
export function chartTheme() {
  const css = getComputedStyle(document.documentElement)
  const v = (name: string) => css.getPropertyValue(name).trim()
  return {
    panel: v('--panel'),
    border: v('--border'),
    grid: v('--chart-grid'),
    text: v('--text-2'),
    muted: v('--muted'),
    /** Background of the crosshair's axis labels. */
    label: v('--border-strong'),
    accent: v('--accent'),
    up: v('--up'),
    down: v('--down'),
    sma20: v('--warn'),
    sma50: v('--violet'),
    font: "Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  }
}

export type ChartTheme = ReturnType<typeof chartTheme>

/** "#rrggbb" plus an opacity, as rgba(). */
export function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '')
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
