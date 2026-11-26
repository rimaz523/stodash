import type { FilingCategory, Period, Range } from '../api/types'
import type { FunctionCode } from '../lib/commands'

export const STATEMENTS = ['income', 'balance', 'cashFlow', 'ratios'] as const
export type Statement = (typeof STATEMENTS)[number]

/** What a filings panel lists: every filing, or one category. */
export type FilingFilter = 'all' | FilingCategory

/**
 * What a panel shows. The optional view settings (chart range, FA period and statement, CF filter) stay on the
 * panel when it switches function or symbol, so returning to GP or FA finds them as you left them.
 */
export type PanelSpec =
  | {
      kind: FunctionCode
      symbol: string
      range?: Range
      period?: Period
      statement?: Statement
      filter?: FilingFilter
    }
  | { kind: 'HELP' }

export type PanelState = PanelSpec & { id: string }

export interface PanelProps {
  active: boolean
  onActivate: () => void
  onClose: () => void
}

export interface SymbolPanelProps extends PanelProps {
  symbol: string
  /** Switch this panel to another function for the same symbol. */
  onSwitch: (fn: FunctionCode) => void
}
