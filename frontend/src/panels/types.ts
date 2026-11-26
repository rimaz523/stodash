import type { EcoRange, FilingCategory, Period, Range, ScreenerSort } from '../api/types'
import type { FunctionCode } from '../lib/commands'

export const STATEMENTS = ['income', 'balance', 'cashFlow', 'ratios'] as const
export type Statement = (typeof STATEMENTS)[number]

/** What a filings panel lists: every filing, or one category. */
export type FilingFilter = 'all' | FilingCategory

/**
 * What a panel shows. The optional view settings (chart range, FA period and statement, CF filter) stay on the
 * panel when it switches function or symbol, so returning to GP or FA finds them as you left them.
 */
export type SymbolSpec = {
  kind: FunctionCode
  symbol: string
  range?: Range
  period?: Period
  statement?: Statement
  filter?: FilingFilter
}

/** Panels that aren't about one ticker. W can be open more than once (one per list); the others once each. */
export type GlobalSpec =
  | { kind: 'HELP' }
  /** list: the name of the watchlist shown; the first list when missing or no longer there. */
  | { kind: 'W'; list?: string }
  /** indicator: the ECO tile opened in detail, e.g. "CPI". */
  | { kind: 'ECO'; indicator?: string; ecoRange?: EcoRange }
  | { kind: 'YC' }
  | { kind: 'FX' }
  | { kind: 'CRYPTO' }
  /** source: the feed the list is filtered to ("CNBC", "Finnhub", ...); every feed when missing. */
  | { kind: 'TOP'; source?: string }
  | { kind: 'EQS'; screen?: ScreenFilters; sort?: ScreenerSort; desc?: boolean }
  | { kind: 'LAYOUT' }

export const GLOBAL_KINDS = ['HELP', 'W', 'ECO', 'YC', 'FX', 'CRYPTO', 'TOP', 'EQS', 'LAYOUT'] as const

/** EQS filters as the panel keeps them. Market caps are in billions of dollars here; changes in percent. */
export interface ScreenFilters {
  sector?: string
  minCap?: number
  maxCap?: number
  minPe?: number
  maxPe?: number
  minChange?: number
  maxChange?: number
}

const SCREEN_NUMBERS = ['minCap', 'maxCap', 'minPe', 'maxPe', 'minChange', 'maxChange'] as const

/** Saved EQS filters with anything unexpected dropped (they come from localStorage or a saved layout). */
export function cleanScreen(v: unknown): ScreenFilters {
  if (!v || typeof v !== 'object') return {}
  const o = v as Record<string, unknown>
  const out: ScreenFilters = {}
  if (typeof o.sector === 'string' && o.sector) out.sector = o.sector
  for (const k of SCREEN_NUMBERS) {
    const n = o[k]
    if (typeof n === 'number' && Number.isFinite(n)) out[k] = n
  }
  return out
}

export type PanelSpec = SymbolSpec | GlobalSpec

export const isSymbolSpec = (p: PanelSpec): p is SymbolSpec => 'symbol' in p

export type PanelState = PanelSpec & { id: string }

export interface PanelProps {
  active: boolean
  onActivate: () => void
  onClose: () => void
  /** This panel fills the workspace (Alt+M); the others are hidden. */
  maximized?: boolean
  /** Toggles maximized. Missing when there's only one panel. */
  onToggleMaximize?: () => void
}

/** For panels that open other views: run a command such as "AAPL GP" (Shift-click: in a new panel). */
export type OpenCommand = (command: string, newPanel: boolean) => void

export interface SymbolPanelProps extends PanelProps {
  symbol: string
  /** Switch this panel to another function for the same symbol. */
  onSwitch: (fn: FunctionCode) => void
}
