import { RANGES, type Period, type Range } from '../api/types'

/** Functions that act on a ticker, e.g. "AAPL GP". */
export const FUNCTIONS = {
  DES: { label: 'Description', hint: 'Company overview, key stats and profile' },
  GP: { label: 'Price Chart', hint: 'Candles or line, volume, moving averages' },
  FA: { label: 'Financials', hint: 'Income statement, balance sheet, cash flow and ratios' },
  N: { label: 'News', hint: 'Latest company headlines' },
  CF: { label: 'SEC Filings', hint: '10-K, 10-Q, 8-K and more from EDGAR' },
} as const
export type FunctionCode = keyof typeof FUNCTIONS

/** Commands that stand alone, e.g. "HELP". */
export const GLOBAL_COMMANDS = {
  HELP: { label: 'Help', hint: 'Commands and keyboard shortcuts' },
  CLEAR: { label: 'Clear', hint: 'Close all panels' },
} as const
export type GlobalCommand = keyof typeof GLOBAL_COMMANDS

export type ParsedCommand =
  | { kind: 'function'; symbol: string; fn: FunctionCode; range?: Range; period?: Period }
  | { kind: 'global'; command: GlobalCommand }
  | { kind: 'error'; message: string }

// Bloomberg-style "market sector" words people type out of habit: "AAPL US EQUITY GP".
const IGNORED_WORDS = new Set(['US', 'EQUITY', 'EQ', 'INDEX', 'CURNCY', 'COMDTY', 'GO', '<GO>'])
const SYMBOL = /^[A-Z0-9^][A-Z0-9.\-=^]{0,19}$/

export function isFunction(s: string): s is FunctionCode {
  return s in FUNCTIONS
}

function isGlobal(s: string): s is GlobalCommand {
  return s in GLOBAL_COMMANDS
}

function isRange(s: string): s is Range {
  return (RANGES as readonly string[]).includes(s)
}

const PERIOD_WORDS: Record<string, Period> = { A: 'annual', ANNUAL: 'annual', Q: 'quarterly', QUARTERLY: 'quarterly' }

/**
 * "AAPL"          → AAPL DES
 * "aapl gp"       → AAPL GP
 * "AAPL GP 1Y"    → AAPL GP, 1Y range
 * "AAPL FA Q"     → AAPL FA, quarterly
 * "msft us equity des" → MSFT DES
 * "help"          → HELP
 */
export function parseCommand(input: string): ParsedCommand | null {
  const tokens = input.trim().toUpperCase().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return null

  const [first, ...rest] = tokens
  if (rest.length === 0 && isGlobal(first)) return { kind: 'global', command: first }

  if (!SYMBOL.test(first)) return { kind: 'error', message: `"${first}" is not a valid ticker.` }

  const args = rest.filter((t) => !IGNORED_WORDS.has(t))
  const fnToken = args[0] ?? 'DES'
  if (!isFunction(fnToken)) {
    const known = Object.keys(FUNCTIONS).join(', ')
    return { kind: 'error', message: `Unknown function "${fnToken}". Available: ${known}. Type HELP for more.` }
  }

  const argToken = args[1]
  if (fnToken === 'FA') {
    if (argToken && !(argToken in PERIOD_WORDS))
      return { kind: 'error', message: `Unknown period "${argToken}". Use A (annual) or Q (quarterly).` }
    return { kind: 'function', symbol: first, fn: fnToken, period: argToken ? PERIOD_WORDS[argToken] : undefined }
  }

  const rangeToken = argToken
  if (rangeToken && !isRange(rangeToken))
    return { kind: 'error', message: `Unknown range "${rangeToken}". Use ${RANGES.join(' ')}.` }

  return { kind: 'function', symbol: first, fn: fnToken, range: rangeToken as Range | undefined }
}
