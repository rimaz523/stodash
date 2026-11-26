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
