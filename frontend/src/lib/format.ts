type N = number | null | undefined

const DASH = '—'

export function isNum(n: N): n is number {
  return typeof n === 'number' && Number.isFinite(n)
}

/** Prices: 2 decimals normally, more for sub-dollar instruments and FX. */
export function price(n: N, digits?: number): string {
  if (!isNum(n)) return DASH
  const d = digits ?? (Math.abs(n) < 1 ? 4 : Math.abs(n) < 10 ? 3 : 2)
  return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
}

export function signed(n: N, digits?: number): string {
  if (!isNum(n)) return DASH
  return `${n > 0 ? '+' : n < 0 ? '−' : ''}${price(Math.abs(n), digits)}`
}

/** For values that are already percents (1.25 → "+1.25%"). */
export function signedPct(n: N): string {
  if (!isNum(n)) return DASH
  return `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(2)}%`
}

/** For fractions (0.253 → "25.30%"). */
export function pct(fraction: N, digits = 2): string {
  if (!isNum(fraction)) return DASH
  return `${(fraction * 100).toFixed(digits)}%`
}

/** 1.23T, 456.70B, 12.30M, 9.10K */
export function big(n: N): string {
  if (!isNum(n)) return DASH
  const abs = Math.abs(n)
  const sign = n < 0 ? '−' : ''
  for (const [div, unit] of [[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K']] as const)
    if (abs >= div) return `${sign}${(abs / div).toFixed(2)}${unit}`
  return `${sign}${abs.toFixed(0)}`
}

export function ratio(n: N): string {
  return isNum(n) ? n.toFixed(2) : DASH
}

export function int(n: N): string {
  return isNum(n) ? Math.round(n).toLocaleString('en-US') : DASH
}

export function direction(n: N): 'up' | 'down' | 'flat' {
  if (!isNum(n) || n === 0) return 'flat'
  return n > 0 ? 'up' : 'down'
}

export function titleCase(s: string | null | undefined): string {
  if (!s) return DASH
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

const MARKET_STATES: Record<string, string> = {
  REGULAR: 'Market open',
  PRE: 'Pre-market',
  PREPRE: 'Pre-market',
  POST: 'After hours',
  POSTPOST: 'After hours',
  CLOSED: 'Market closed',
}

export function marketState(s: string | null | undefined): string | null {
  return s ? (MARKET_STATES[s] ?? titleCase(s.toLowerCase())) : null
}

/** "1.8×" for plain ratios such as debt/equity. */
export function multiple(n: N): string {
  return isNum(n) ? `${n.toFixed(2)}×` : DASH
}
