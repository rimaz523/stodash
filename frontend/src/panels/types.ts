import type { EcoRange, FilingCategory, Period, Range } from '../api/types'
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

export const GLOBAL_KINDS = ['HELP', 'W', 'ECO', 'YC', 'FX', 'CRYPTO'] as const

export type PanelSpec = SymbolSpec | GlobalSpec

export const isSymbolSpec = (p: PanelSpec): p is SymbolSpec => 'symbol' in p

export type PanelState = PanelSpec & { id: string }

export interface PanelProps {
  active: boolean
  onActivate: () => void
  onClose: () => void
}

/** For panels that open other views: run a command such as "AAPL GP" (Shift-click: in a new panel). */
export type OpenCommand = (command: string, newPanel: boolean) => void

export interface SymbolPanelProps extends PanelProps {
  symbol: string
  /** Switch this panel to another function for the same symbol. */
  onSwitch: (fn: FunctionCode) => void
}
