const formatters = new Map<string, Intl.DateTimeFormat>()

function formatterFor(timeZone: string) {
  let f = formatters.get(timeZone)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    formatters.set(timeZone, f)
  }
  return f
}

/** Seconds to add to a UTC timestamp to get wall-clock time in `timeZone` (handles DST). */
export function tzOffsetSeconds(unixSeconds: number, timeZone: string): number {
  try {
    const parts = formatterFor(timeZone).formatToParts(new Date(unixSeconds * 1000))
    const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value ?? 0)
    const wallAsUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
    return Math.round(wallAsUtc / 1000 - unixSeconds)
  } catch {
    return 0 // unknown time zone: show UTC
  }
}

export function clock(timeZone: string, date: Date): string {
  return date.toLocaleTimeString('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

/** "just now", "12m ago", "5h ago", "3d ago", then a date such as "Oct 4" (or "Oct 4, 2025" in another year). */
export function timeAgo(iso: string, now = new Date()): string {
  const then = new Date(iso)
  const seconds = Math.max(0, (now.getTime() - then.getTime()) / 1000)
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ago`
  if (seconds < 7 * 86_400) return `${Math.floor(seconds / 86_400)}d ago`
  return then.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: then.getFullYear() === now.getFullYear() ? undefined : 'numeric',
  })
}

/** "2026-09-30" → "Sep 30, 2026", read as a calendar date (no time zone shift). */
export function calendarDate(ymd: string, opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }) {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { ...opts, timeZone: 'UTC' })
}
