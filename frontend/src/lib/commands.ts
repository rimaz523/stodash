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

/** Commands that stand alone, e.g. "HELP" or "YC". */
export const GLOBAL_COMMANDS = {
  W: { label: 'Watchlists', hint: 'Your watchlists with live prices · W ADD NVDA · W DEL NVDA' },
  ECO: { label: 'Economy', hint: 'US indicators from FRED · ECO CPI opens one' },
  YC: { label: 'Yield Curve', hint: 'US Treasury curve: now, a month ago, a year ago' },
  FX: { label: 'Currencies', hint: 'Major pairs against USD and cross rates' },
  CRYPTO: { label: 'Crypto', hint: 'Top 25 coins by market cap' },
  HELP: { label: 'Help', hint: 'Commands and keyboard shortcuts' },
  CLEAR: { label: 'Clear', hint: 'Close all panels' },
} as const
export type GlobalCommand = keyof typeof GLOBAL_COMMANDS

/** ECO indicator ids (matching the backend's EcoService), with the extra words people may type for them. */
export const ECO_INDICATORS: Record<string, string[]> = {
  CPI: ['INFLATION'],
  PCE: ['COREPCE', 'CORE'],
  UNEMP: ['UNEMPLOYMENT', 'UNRATE', 'JOBS'],
  FEDFUNDS: ['FED', 'RATES', 'DFF'],
  GDP: ['GROWTH'],
  SPREAD: ['10Y2Y', 'CURVE'],
  MORTGAGE: ['MORTGAGES'],
  CLAIMS: ['JOBLESS'],
  SENTIMENT: ['CONSUMER', 'UMCSENT'],
}

export type ParsedCommand =
  | { kind: 'function'; symbol: string; fn: FunctionCode; range?: Range; period?: Period }
  | { kind: 'global'; command: Exclude<GlobalCommand, 'W' | 'ECO'> }
  /** W, or W <list name> */
  | { kind: 'watchlist'; list?: string }
  /** W ADD NVDA [TO] [list], W DEL NVDA [FROM] [list] */
  | { kind: 'watchlist-edit'; action: 'add' | 'remove'; symbol: string; list?: string }
  /** ECO, or ECO CPI */
  | { kind: 'eco'; indicator?: string }
  | { kind: 'error'; message: string }

// Bloomberg-style "market sector" words people type out of habit: "AAPL US EQUITY GP".
const IGNORED_WORDS = new Set(['US', 'EQUITY', 'EQ', 'INDEX', 'CURNCY', 'COMDTY', 'GO', '<GO>'])
const SYMBOL = /^[A-Z0-9^][A-Z0-9.\-=^]{0,19}$/
const ADD_WORDS = new Set(['ADD', '+'])
const REMOVE_WORDS = new Set(['DEL', 'DELETE', 'REMOVE', 'RM', '-'])

export function isFunction(s: string): s is FunctionCode {
  return s in FUNCTIONS
}

export function isGlobal(s: string): s is GlobalCommand {
  return s in GLOBAL_COMMANDS
}

function isRange(s: string): s is Range {
  return (RANGES as readonly string[]).includes(s)
}

/** The ECO indicator id for a typed word ("UNEMPLOYMENT" → "UNEMP"), or undefined. */
export function ecoIndicator(word: string): string | undefined {
  const w = word.toUpperCase()
  return Object.entries(ECO_INDICATORS).find(([id, aliases]) => id === w || aliases.includes(w))?.[0]
}

const PERIOD_WORDS: Record<string, Period> = { A: 'annual', ANNUAL: 'annual', Q: 'quarterly', QUARTERLY: 'quarterly' }

/**
 * "AAPL"               → AAPL DES
 * "aapl gp"            → AAPL GP
 * "AAPL GP 1Y"         → AAPL GP, 1Y range
 * "AAPL FA Q"          → AAPL FA, quarterly
 * "msft us equity des" → MSFT DES
 * "help", "yc", "fx"   → that command
 * "w", "w tech"        → watchlists (the "tech" list)
 * "w add nvda to tech" → add NVDA to the "tech" list
 * "eco", "eco cpi"     → economy dashboard (CPI detail)
 * "w des", "w gp"      → Wayfair (ticker W): a function after a command word means it's a ticker
 */
export function parseCommand(input: string): ParsedCommand | null {
  const raw = input.trim().split(/\s+/).filter(Boolean)
  const tokens = raw.map((t) => t.toUpperCase())
  if (tokens.length === 0) return null

  const [first, ...rest] = tokens
  if (isGlobal(first)) {
    const global = parseGlobal(first, rest, raw.slice(1))
    if (global) return global
  }

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

/**
 * A command word with its arguments, or null when the words are really a ticker plus a function
 * ("W DES" is Wayfair's description, not the watchlist command).
 */
function parseGlobal(cmd: GlobalCommand, rest: string[], rawRest: string[]): ParsedCommand | null {
  if (rest.length > 0 && (isFunction(rest[0]) || IGNORED_WORDS.has(rest[0]))) return null

  switch (cmd) {
    case 'W': {
      if (rest.length === 0) return { kind: 'watchlist' }
      const verb = rest[0]
      if (ADD_WORDS.has(verb) || REMOVE_WORDS.has(verb)) {
        const action = ADD_WORDS.has(verb) ? 'add' : 'remove'
        const symbol = rest[1]
        if (!symbol || !SYMBOL.test(symbol))
          return { kind: 'error', message: `Which symbol? e.g. W ${action === 'add' ? 'ADD' : 'DEL'} NVDA` }
        // Optional "TO"/"FROM" before the list name; the name keeps its original case.
        let nameWords = rawRest.slice(2)
        if (nameWords[0] && ['TO', 'FROM', 'IN'].includes(nameWords[0].toUpperCase())) nameWords = nameWords.slice(1)
        return { kind: 'watchlist-edit', action, symbol, list: nameWords.length ? nameWords.join(' ') : undefined }
      }
      return { kind: 'watchlist', list: rawRest.join(' ') }
    }
    case 'ECO': {
      if (rest.length === 0) return { kind: 'eco' }
      const id = ecoIndicator(rest[0])
      if (!id || rest.length > 1)
        return { kind: 'error', message: `Unknown indicator "${rest.join(' ')}". Use ${Object.keys(ECO_INDICATORS).join(', ')}.` }
      return { kind: 'eco', indicator: id }
    }
    case 'HELP':
    case 'CLEAR':
      // Kept from phase 1: "HELP X" is read as a ticker so nothing changes for existing habits.
      return rest.length === 0 ? { kind: 'global', command: cmd } : null
    default:
      if (rest.length > 0) return { kind: 'error', message: `${cmd} doesn't take anything after it. Just type ${cmd}.` }
      return { kind: 'global', command: cmd }
  }
}
