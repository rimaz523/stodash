import type { Range } from '../api/types'
import type { FunctionCode } from '../lib/commands'

/** What a panel shows. */
export type PanelSpec = { kind: FunctionCode; symbol: string; range?: Range } | { kind: 'HELP' }

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
