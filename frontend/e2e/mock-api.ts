import type { Page, Route, WebSocketRoute } from '@playwright/test'
import type {
  CompanyProfile,
  CryptoBoard,
  EcoDashboard,
  EcoIndicator,
  EcoSeries,
  Filing,
  FilingCategory,
  FilingList,
  FinancialStatements,
  FxBoard,
  Health,
  Layout,
  NewsFeed,
  PriceHistory,
  ProviderName,
  ProviderStatus,
  Quote,
  ScreenerResult,
  ScreenerRow,
  SearchResult,
  StatementRow,
  StreamState,
  TopNewsFeed,
  Watchlist,
  YieldCurve,
} from '../src/api/types.ts'

/**
 * A fake Stodash API for the browser tests. It answers every /api request with small, hand-written data shaped like
 * the real backend's records (the types are imported from the app, so a shape change breaks the build here too).
 *
 * Tests can override any route with `mock.on(pattern, reply)`, and assert on `mock.requests`.
 */

// -------------------------------------------------------------------- data

interface Instrument {
  name: string
  type: string
  exchange: string
  currency: string
  price: number
  change: number
}

export const INSTRUMENTS: Record<string, Instrument> = {
  AAPL: { name: 'Apple Inc.', type: 'EQUITY', exchange: 'NasdaqGS', currency: 'USD', price: 355.58, change: 1.51 },
  MSFT: { name: 'Microsoft Corporation', type: 'EQUITY', exchange: 'NasdaqGS', currency: 'USD', price: 512.3, change: -2.1 },
  TSLA: { name: 'Tesla, Inc.', type: 'EQUITY', exchange: 'NasdaqGS', currency: 'USD', price: 401.2, change: 6.4 },
  JPM: { name: 'JPMorgan Chase & Co.', type: 'EQUITY', exchange: 'NYSE', currency: 'USD', price: 316.74, change: -0.36 },
  GOOGL: { name: 'Alphabet Inc.', type: 'EQUITY', exchange: 'NasdaqGS', currency: 'USD', price: 273.1, change: -5.95 },
  AMZN: { name: 'Amazon.com, Inc.', type: 'EQUITY', exchange: 'NasdaqGS', currency: 'USD', price: 244.43, change: -7.86 },
  NVDA: { name: 'NVIDIA Corporation', type: 'EQUITY', exchange: 'NasdaqGS', currency: 'USD', price: 149.3, change: -6.08 },
  META: { name: 'Meta Platforms, Inc.', type: 'EQUITY', exchange: 'NasdaqGS', currency: 'USD', price: 609.89, change: 2.2 },
  AMD: { name: 'Advanced Micro Devices, Inc.', type: 'EQUITY', exchange: 'NasdaqGS', currency: 'USD', price: 140.5, change: 1.1 },
  W: { name: 'Wayfair Inc.', type: 'EQUITY', exchange: 'NYSE', currency: 'USD', price: 97.11, change: 1.4 },
  'EURUSD=X': { name: 'EUR/USD', type: 'CURRENCY', exchange: 'CCY', currency: 'USD', price: 1.0963, change: -0.002 },
  'RY.TO': { name: 'Royal Bank of Canada', type: 'EQUITY', exchange: 'Toronto', currency: 'CAD', price: 269.26, change: -0.38 },
  '^GSPC': { name: 'S&P 500', type: 'INDEX', exchange: 'SNP', currency: 'USD', price: 7182.78, change: -18.31 },
  '^IXIC': { name: 'NASDAQ Composite', type: 'INDEX', exchange: 'Nasdaq', currency: 'USD', price: 23585.8, change: -148.2 },
  'BTC-USD': { name: 'Bitcoin USD', type: 'CRYPTOCURRENCY', exchange: 'CCC', currency: 'USD', price: 60869.69, change: 1740 },
}

export function quote(symbol: string): Quote {
  const i = INSTRUMENTS[symbol]
  const prev = i.price - i.change
  return {
    symbol,
    name: i.name,
    exchange: i.exchange,
    currency: i.currency,
    quoteType: i.type,
    price: i.price,
    change: i.change,
    changePercent: (i.change / prev) * 100,
    previousClose: prev,
    open: prev,
    dayHigh: i.price * 1.01,
    dayLow: prev * 0.99,
    volume: 41_200_000,
    marketCap: i.type === 'EQUITY' ? 3.4e12 : null,
    marketState: 'CLOSED',
    time: '2026-11-25T21:00:00Z',
    source: 'Yahoo',
  }
}

export function history(symbol: string, range: string): PriceHistory {
  const start = Date.UTC(2026, 5, 1) / 1000
  let close = INSTRUMENTS[symbol].price * 0.9
  const bars = Array.from({ length: 60 }, (_, i) => {
    const open = close
    close = open * (1 + Math.sin(i / 4) * 0.01 + 0.002)
    return {
      time: start + i * 86_400,
      open,
      high: Math.max(open, close) * 1.005,
      low: Math.min(open, close) * 0.995,
      close,
      volume: 30_000_000 + i * 100_000,
    }
  })
  return {
    symbol,
    range,
    interval: '1d',
    intraday: false,
    currency: INSTRUMENTS[symbol].currency,
    timezone: 'America/New_York',
    previousClose: bars[0].open,
    bars,
  }
}

export function profile(symbol: string): CompanyProfile {
  const i = INSTRUMENTS[symbol]
  return {
    symbol,
    name: i.name,
    exchange: i.exchange,
    currency: i.currency,
    quoteType: i.type,
    sector: 'Technology',
    industry: 'Consumer Electronics',
    country: 'United States',
    city: 'Cupertino',
    state: 'CA',
    website: 'https://www.apple.com',
    employees: 164_000,
    summary: `${i.name} designs, manufactures and markets things.`,
    officers: [{ name: 'Tim Cook', title: 'CEO & Director', age: 65 }],
    stats: {
      marketCap: 3.4e12, enterpriseValue: 3.5e12, trailingPE: 37.1, forwardPE: 32.4, pegRatio: 2.1, priceToBook: 52,
      trailingEps: 8.98, forwardEps: 10.1, dividendYield: 0.004, beta: 1.2, fiftyTwoWeekHigh: 370,
      fiftyTwoWeekLow: 240, fiftyDayAverage: 340, twoHundredDayAverage: 310, averageVolume: 50_000_000,
      sharesOutstanding: 14_700_000_000, totalRevenue: 4.79e11, revenueGrowth: 0.15, grossMargin: 0.49,
      operatingMargin: 0.33, profitMargin: 0.28, returnOnEquity: 1.18, totalCash: 6.6e10, totalDebt: 9.8e10,
      targetMeanPrice: 380, recommendation: 'buy',
    },
    source: 'Yahoo',
  }
}

const row = (id: string, label: string, values: (number | null)[], extra: Partial<StatementRow> = {}): StatementRow => ({
  id,
  label,
  unit: 'money',
  core: true,
  total: false,
  values,
  ...extra,
})

export function financials(symbol: string, period: 'annual' | 'quarterly'): FinancialStatements {
  if (INSTRUMENTS[symbol].type !== 'EQUITY')
    return {
      symbol, period, currency: 'USD', periods: [], income: [], balance: [], cashFlow: [], ratios: [],
      note: `${symbol} is an index, so it has no financial statements. FA covers individual companies.`,
      source: 'Yahoo',
    }

  const annual = period === 'annual'
  const scale = annual ? 1 : 0.25
  const s = (vals: number[]) => vals.map((v) => v * scale)
  return {
    symbol,
    period,
    currency: 'USD',
    periods: annual
      ? ['2026-09-30', '2025-09-30', '2024-09-30', '2023-09-30']
      : ['2026-09-30', '2026-06-30', '2026-03-31', '2025-12-31', '2025-09-30'],
    income: [
      row('TotalRevenue', 'Revenue', s([478.83e9, 416.16e9, 391.04e9, 383.29e9, 380e9].slice(0, annual ? 4 : 5)), { total: true }),
      row('CostOfRevenue', 'Cost of revenue', s([245.23e9, 220.96e9, 210.35e9, 214.14e9, 210e9].slice(0, annual ? 4 : 5))),
      row('GrossProfit', 'Gross profit', s([233.6e9, 195.2e9, 180.68e9, 169.15e9, 170e9].slice(0, annual ? 4 : 5)), { total: true }),
      row('OperatingExpense', 'Total operating expenses', s([75.54e9, 62.15e9, 57.47e9, 54.85e9, 54e9].slice(0, annual ? 4 : 5)), { core: false }),
      row('NetIncome', 'Net income', s([132.18e9, 112.01e9, 93.74e9, 97e9, 95e9].slice(0, annual ? 4 : 5)), { total: true }),
      row('DilutedEPS', 'EPS (diluted)', [8.98, 7.46, 6.08, 6.13, 6].slice(0, annual ? 4 : 5), { unit: 'perShare' }),
      row('BasicEPS', 'EPS (basic)', [9.01, 7.49, 6.11, 6.16, 6].slice(0, annual ? 4 : 5), { unit: 'perShare', core: false }),
    ],
    balance: [
      row('TotalAssets', 'Total assets', s([404.5e9, 365e9, 364.98e9, 352.58e9, 350e9].slice(0, annual ? 4 : 5)), { total: true }),
      row('StockholdersEquity', "Shareholders' equity", s([112.1e9, 73.7e9, 56.95e9, 62.15e9, 60e9].slice(0, annual ? 4 : 5)), { total: true }),
    ],
    cashFlow: [
      row('OperatingCashFlow', 'Operating cash flow', s([145.1e9, 118.25e9, 118.25e9, 110.54e9, 110e9].slice(0, annual ? 4 : 5)), { total: true }),
      row('CapitalExpenditure', 'Capital expenditure', s([-9.04e9, -9.45e9, -9.45e9, -10.96e9, -10e9].slice(0, annual ? 4 : 5))),
    ],
    ratios: [
      row('GrossMargin', 'Gross margin', [0.4879, 0.4691, 0.4621, 0.4413, 0.44].slice(0, annual ? 4 : 5), { unit: 'fraction' }),
      row('DebtToEquity', 'Debt / equity', [0.87, 1.45, 1.87, 1.79, 1.8].slice(0, annual ? 4 : 5), { unit: 'multiple' }),
    ],
    note: null,
    source: 'Yahoo',
  }
}

export function news(symbol: string): NewsFeed {
  const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString()
  return {
    symbol,
    providers: ['Yahoo', 'Finnhub'],
    items: [
      {
        headline: `${INSTRUMENTS[symbol].name} beats expectations`,
        url: 'https://example.com/news/beats',
        source: 'Reuters',
        published: ago(25),
        summary: 'Revenue rose 15% on strong demand.',
        tickers: [symbol, 'MSFT', 'NVDA'],
        provider: 'Finnhub',
      },
      {
        headline: 'Markets slip as tech cools',
        url: 'https://example.com/news/markets',
        source: "Investor's Business Daily",
        published: ago(3 * 60),
        summary: null,
        tickers: ['^GSPC', symbol, 'A', 'B', 'C', 'D', 'E'],
        provider: 'Yahoo',
      },
    ],
  }
}

/** 10 annual, quarterly, 8-K, proxy and other filings, plus 120 insider forms so the list needs paging. */
export function filings(symbol: string): FilingList {
  if (INSTRUMENTS[symbol].exchange === 'Toronto' || INSTRUMENTS[symbol].type !== 'EQUITY')
    return {
      symbol, cik: null, company: null, items: [], source: 'SEC EDGAR',
      note: 'No SEC filings. EDGAR only covers companies registered with the US SEC under a US ticker, so non-US listings have none.',
    }

  const spec: [FilingCategory, string, string, number][] = [
    ['annual', '10-K', 'Annual report', 3],
    ['quarterly', '10-Q', 'Quarterly report', 4],
    ['current', '8-K', 'Current report: Results of operations', 5],
    ['proxy', 'DEF 14A', 'Proxy statement', 2],
    ['other', 'S-8', 'Employee stock plan registration', 1],
    ['insider', '4', 'Insider transaction', 120],
  ]
  const items: Filing[] = []
  let n = 0
  for (const [category, form, description, count] of spec)
    for (let i = 0; i < count; i++, n++) {
      const day = new Date(Date.UTC(2026, 10, 25) - n * 86_400_000).toISOString().slice(0, 10)
      const acc = `0000320193-26-${String(n).padStart(6, '0')}`
      items.push({
        form, category, description, filingDate: day, reportDate: day,
        url: `https://www.sec.gov/Archives/edgar/data/320193/${acc.replace(/-/g, '')}/doc.htm`,
        indexUrl: `https://www.sec.gov/Archives/edgar/data/320193/${acc.replace(/-/g, '')}/${acc}-index.htm`,
        accessionNumber: acc,
      })
    }
  items.sort((a, b) => b.filingDate.localeCompare(a.filingDate))
  return { symbol, cik: 320193, company: 'Apple Inc.', items, note: null, source: 'SEC EDGAR' }
}

export function search(q: string): SearchResult[] {
  const query = q.toLowerCase()
  return Object.entries(INSTRUMENTS)
    .filter(([sym, i]) => sym.toLowerCase().startsWith(query) || i.name.toLowerCase().includes(query))
    .map(([sym, i]) => ({ symbol: sym, name: i.name, type: i.type, exchange: i.exchange }))
}

const provider = (state: ProviderStatus['state'], error = 'SEC EDGAR timed out.'): ProviderStatus => ({
  configured: state !== 'off',
  state,
  lastOk: state === 'up' ? '2026-11-26T04:00:00Z' : null,
  lastFailure: state === 'down' ? '2026-11-26T04:00:00Z' : null,
  lastError: state === 'down' ? error : null,
})

export function health(
  states: Partial<Record<ProviderName, ProviderStatus['state']>> = {},
  stream: StreamState = 'idle',
): Health {
  const defaults: Record<ProviderName, ProviderStatus['state']> = {
    yahoo: 'up',
    sec: 'up',
    finnhub: 'off',
    fred: 'up',
    treasury: 'up',
    coingecko: 'up',
    frankfurter: 'unknown',
    rss: 'up',
    indexlist: 'up',
    database: 'up',
  }
  const providers = Object.fromEntries(
    (Object.keys(defaults) as ProviderName[]).map((name) => [name, provider(states[name] ?? defaults[name])]),
  ) as Record<ProviderName, ProviderStatus>
  return { status: 'ok', providers, stream: { state: stream, error: null } }
}

// ------------------------------------------------------------- macro data

const ECO_DEFS: [id: string, label: string, series: string, unit: EcoIndicator['unit'], frequency: string, latest: number, previous: number][] = [
  ['CPI', 'CPI inflation', 'CPIAUCSL', 'percent', 'Monthly', 2.94, 3.01],
  ['PCE', 'Core PCE inflation', 'PCEPILFE', 'percent', 'Monthly', 2.71, 2.75],
  ['UNEMP', 'Unemployment', 'UNRATE', 'percent', 'Monthly', 4.3, 4.2],
  ['FEDFUNDS', 'Fed funds rate', 'DFF', 'percent', 'Daily', 3.88, 3.88],
  ['GDP', 'Real GDP growth', 'A191RL1Q225SBEA', 'percent', 'Quarterly', 2.1, 3.3],
  ['SPREAD', '10Y–2Y spread', 'T10Y2Y', 'points', 'Daily', 0.24, 0.22],
  ['MORTGAGE', '30-year mortgage rate', 'MORTGAGE30US', 'percent', 'Weekly', 6.12, 6.17],
  ['CLAIMS', 'Initial jobless claims', 'ICSA', 'count', 'Weekly', 221000, 216000],
  ['SENTIMENT', 'Consumer sentiment', 'UMCSENT', 'index', 'Monthly', 71.8, 70.1],
]

const monthly = (n: number, value: (i: number) => number) =>
  Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(2026, 9 - (n - 1 - i), 1))
    return { date: d.toISOString().slice(0, 10), value: value(i) }
  })

export function eco(configured = true): EcoDashboard {
  if (!configured)
    return {
      configured: false,
      note: 'FRED isn\'t configured. Get a free key at https://fred.stlouisfed.org/docs/api/api_key.html.',
      indicators: [],
      source: 'FRED (Federal Reserve Bank of St. Louis)',
    }
  return {
    configured: true,
    note: null,
    source: 'FRED (Federal Reserve Bank of St. Louis)',
    indicators: ECO_DEFS.map(([id, label, seriesId, unit, frequency, latest, previous]) => ({
      id, label, seriesId, unit, frequency,
      description: `${label} description.`,
      latest, previous, change: latest - previous,
      latestDate: '2026-10-01',
      sparkline: monthly(24, (i) => previous + (latest - previous) * (i / 23)),
    })),
  }
}

export function ecoSeries(id: string, range: string): EcoSeries | null {
  const d = ECO_DEFS.find((x) => x[0] === id)
  if (!d) return null
  const [, label, seriesId, unit, frequency, latest] = d
  return {
    id, label, seriesId, unit, frequency, range: range as EcoSeries['range'],
    description: `${label} description.`,
    points: monthly(60, (i) => latest + Math.sin(i / 6)),
    source: 'FRED (Federal Reserve Bank of St. Louis)',
  }
}

export function yieldCurve(inverted = false): YieldCurve {
  const maturities = [['1M', 1], ['3M', 3], ['6M', 6], ['1Y', 12], ['2Y', 24], ['5Y', 60], ['10Y', 120], ['30Y', 360]] as const
  const latest = inverted ? [4.9, 4.8, 4.7, 4.6, 4.5, 4.3, 4.2, 4.4] : [4.27, 4.34, 4.44, 4.56, 4.61, 4.65, 4.85, 5.24]
  return {
    maturities: maturities.map(([label, months]) => ({ label, months })),
    curves: [
      { label: 'Latest', date: '2026-11-25', yields: latest },
      { label: '1 month ago', date: '2026-10-23', yields: [4.11, 4.22, 4.3, 4.44, 4.69, 4.82, 5.0, 5.33] },
      { label: '1 year ago', date: '2025-11-25', yields: [4.04, 3.9, 3.75, 3.6, 3.43, 3.55, 4.01, 4.67] },
    ],
    spreads: [
      { label: '10Y–2Y', bp: Math.round((latest[6] - latest[4]) * 100) },
      { label: '10Y–3M', bp: Math.round((latest[6] - latest[1]) * 100) },
    ],
    source: 'US Treasury (daily par yield curve rates)',
  }
}

export function fx(): FxBoard {
  const pairs: [string, string, string, number, number, string][] = [
    ['EUR', 'USD', 'EURUSD=X', 1.0963, -0.16, 'Yahoo'],
    ['GBP', 'USD', 'GBPUSD=X', 1.3101, -0.11, 'Yahoo'],
    ['USD', 'JPY', 'JPY=X', 159.16, 0.02, 'Yahoo'],
    ['USD', 'CHF', 'CHF=X', 0.8321, 0.21, 'Yahoo'],
    ['USD', 'CAD', 'CAD=X', 1.4222, 0.08, 'Yahoo'],
    ['AUD', 'USD', 'AUDUSD=X', 0.6646, 0.26, 'Yahoo'],
    ['NZD', 'USD', 'NZDUSD=X', 0.5484, -0.07, 'ECB'],
    ['USD', 'CNY', 'CNY=X', 6.6626, 0.05, 'Yahoo'],
  ]
  const perUsd: Record<string, number> = { USD: 1 }
  for (const [base, q, , rate] of pairs) if (base === 'USD') perUsd[q] = rate
    else perUsd[base] = 1 / rate
  const currencies = ['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD', 'CNY']
  return {
    pairs: pairs.map(([base, q, symbol, rate, pct, source]) => ({
      pair: `${base}/${q}`, base, quote: q, symbol, rate,
      change: source === 'ECB' ? null : (rate * pct) / 100,
      changePercent: source === 'ECB' ? null : pct,
      source, time: '2026-11-25T21:00:00Z',
    })),
    currencies,
    matrix: currencies.map((from) => currencies.map((to) => perUsd[to] / perUsd[from])),
  }
}

export function crypto(): CryptoBoard {
  const coins: [string, string, string, number, number, number, number][] = [
    ['bitcoin', 'BTC', 'Bitcoin', 60892, 2.94, -3.58, 1.22e12],
    ['ethereum', 'ETH', 'Ethereum', 1698.93, 2.41, -5.12, 2.07e11],
    ['tether', 'USDT', 'Tether', 0.999, 0.01, -0.02, 1.73e11],
    ['solana', 'SOL', 'Solana', 71.13, 6.5, 4.2, 4.2e10],
  ]
  return {
    source: 'CoinGecko',
    asOf: '2026-11-26T04:00:00Z',
    coins: coins.map(([id, symbol, name, price, d24, d7, cap], i) => ({
      rank: i + 1, id, symbol, name, price, change24h: d24, change7d: d7, marketCap: cap, volume24h: cap / 30,
      sparkline: Array.from({ length: 42 }, (_, k) => price * (1 + Math.sin(k / 5) * 0.02)),
      yahooSymbol: `${symbol}-USD`,
    })),
  }
}

// ------------------------------------------------------------- TOP and EQS

export function topNews(): TopNewsFeed {
  const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString()
  const item = (headline: string, provider: string, minutes: number, source = provider, tickers: string[] = []) => ({
    headline, provider, source, tickers, published: ago(minutes), summary: null as string | null,
    url: `https://example.com/top/${headline.toLowerCase().replace(/[^a-z]+/g, '-')}`,
  })
  return {
    providers: ['CNBC', 'MarketWatch', 'Finnhub'],
    failed: [],
    asOf: ago(0),
    items: [
      item('Stocks rally as yields ease', 'CNBC', 10),
      { ...item('Fed minutes point to patience', 'Finnhub', 40, 'Reuters', ['SPY']), summary: 'Officials saw no rush to cut.' },
      item('Oil slides on supply worries', 'MarketWatch', 95),
      item('Chipmakers lead the Nasdaq higher', 'CNBC', 180),
    ],
  }
}

/** symbol, name, sector, price, change %, market cap, trailing P/E (null: losses), yield (fraction) */
const SCREEN: [string, string, string, number, number, number, number | null, number | null][] = [
  ['AAPL', 'Apple Inc.', 'Information Technology', 355.58, 0.43, 5.17e12, 39.6, 0.003],
  ['MSFT', 'Microsoft', 'Information Technology', 489.93, -1.25, 3.64e12, 25.6, 0.008],
  ['NVDA', 'Nvidia', 'Information Technology', 149.3, -3.91, 3.61e12, 16.0, 0.0067],
  ['JPM', 'JPMorgan Chase', 'Financials', 316.74, -0.11, 8.7e11, 15.2, 0.019],
  ['XOM', 'ExxonMobil', 'Energy', 118.2, 2.6, 5.1e11, 13.4, 0.034],
  ['DVN', 'Devon Energy', 'Energy', 36.1, 2.71, 2.3e10, 10.0, 0.041],
  ['INTC', 'Intel', 'Information Technology', 21.4, 3.2, 9.3e10, null, null],
  ['BRK-B', 'Berkshire Hathaway', 'Financials', 512.0, 0.2, 1.1e12, 22.1, null],
]

export const SCREEN_ROWS: ScreenerRow[] = SCREEN.map(([symbol, name, sector, price, chg, cap, pe, dy]) => ({
  symbol, name, sector, industry: null, price, changePercent: chg, marketCap: cap, trailingPE: pe,
  forwardPE: pe === null ? null : pe * 0.85, priceToBook: 4.2, dividendYield: dy,
  fiftyTwoWeekHigh: price * 1.2, fiftyTwoWeekLow: price * 0.7, volume: 1_000_000,
}))

const SORT_FIELDS: Record<string, keyof ScreenerRow> = {
  symbol: 'symbol', name: 'name', sector: 'sector', price: 'price', change: 'changePercent', marketCap: 'marketCap',
  pe: 'trailingPE', forwardPe: 'forwardPE', pb: 'priceToBook', yield: 'dividendYield', volume: 'volume',
}

/** ScreenerService's filtering and sorting, over SCREEN_ROWS. */
export function screener(params: URLSearchParams): Reply {
  const num = (k: string) => (params.has(k) ? Number(params.get(k)) : undefined)
  const inRange = (v: number | null, min?: number, max?: number) =>
    (min === undefined && max === undefined) || (v !== null && (min === undefined || v >= min) && (max === undefined || v <= max))
  const sector = params.get('sector') ?? undefined
  const sortKey = params.get('sort') ?? 'marketCap'
  const field = SORT_FIELDS[sortKey]
  if (!field) return problem(400, 'Invalid request', `Unknown sort '${sortKey}'.`)
  if (sector && !SCREEN_ROWS.some((r) => r.sector === sector)) return problem(400, 'Invalid request', `Unknown sector '${sector}'.`)
  const desc = params.has('desc') ? params.get('desc') === 'true' : !['symbol', 'name', 'sector'].includes(sortKey)

  const matches = SCREEN_ROWS.filter(
    (r) =>
      (!sector || r.sector === sector) &&
      inRange(r.marketCap, num('minCap'), num('maxCap')) &&
      inRange(r.trailingPE, num('minPe'), num('maxPe')) &&
      inRange(r.changePercent, num('minChange'), num('maxChange')),
  )
  const value = (r: ScreenerRow) => r[field] as string | number | null
  const sorted = matches
    .filter((r) => value(r) !== null)
    .sort((a, b) => {
      const av = value(a)!
      const bv = value(b)!
      return (av < bv ? -1 : av > bv ? 1 : 0) * (desc ? -1 : 1)
    })
    .concat(matches.filter((r) => value(r) === null))
  const sectors = [...new Set(SCREEN_ROWS.map((r) => r.sector))].sort()
  const body: ScreenerResult = {
    universe: 'S&P 500', total: SCREEN_ROWS.length, matched: matches.length,
    rows: sorted.slice(0, num('limit') ?? 100),
    sectors: sectors.map((s) => ({ sector: s, count: SCREEN_ROWS.filter((r) => r.sector === s).length })),
    universeAsOf: '2026-11-26T04:00:00Z', pricesAsOf: new Date().toISOString(), refreshing: false,
    source: 'S&P 500 list: github.com/datasets (from Wikipedia) · prices: Yahoo',
  }
  return ok(body)
}

// ------------------------------------------------------------------ routing

export type Reply = { status: number; body: unknown } | 'abort'

const ok = (body: unknown): Reply => ({ status: 200, body })
const problem = (status: number, title: string, detail: string): Reply => ({ status, body: { title, status, detail } })
const notFound = (symbol: string): Reply => problem(404, 'Symbol not found', `No instrument found for '${symbol}'.`)

const MAG7 = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA']
/** US stock tickers the fake stream reports as live (like the backend's rule). */
const streamable = (s: string) => /^[A-Z]{1,5}(-[A-Z])?$/.test(s)

export class MockApi {
  /** Every /api request the page made, as "METHOD path?query" for writes and "path?query" for reads, in order. */
  readonly requests: string[] = []
  /** The fake user's watchlists. Tests can read or replace them. */
  watchlists: Watchlist[] = [{ id: 1, name: 'Main', symbols: [...MAG7] }]
  /** What the fake /ws/quotes reports: the backend's stream state. */
  streamState: StreamState = 'live'
  /** Whether ECO has a FRED key. */
  ecoConfigured = true
  /** The fake user's saved layouts (LAYOUT). Tests can read or replace them. */
  layouts: Layout[] = []
  private readonly overrides: [RegExp, Reply | ((url: URL) => Reply)][] = []
  private readonly sockets = new Set<{ ws: WebSocketRoute; symbols: string[] }>()
  private nextId = 2

  /** Answer requests whose "path?query" matches `pattern` with `reply` instead of the default. Latest wins. */
  on(pattern: RegExp, reply: Reply | ((url: URL) => Reply)) {
    this.overrides.unshift([pattern, reply])
  }

  /** Drops every override, so the default answers apply again (e.g. the API comes back). */
  clear() {
    this.overrides.length = 0
  }

  async install(page: Page) {
    // Match on the path, not a "**/api/**" glob, which would also catch Vite's /src/api/*.ts modules.
    await page.route((url) => url.pathname.startsWith('/api/'), (route) => this.handle(route))
    await page.routeWebSocket(/\/ws\/quotes$/, (ws) => this.connect(ws))
  }

  /** Sends trades to every open /ws/quotes connection watching those symbols. */
  pushTrades(trades: { symbol: string; price: number }[]) {
    const time = Date.now() + 60_000 // newer than any quote, so the panel uses the trade
    for (const s of this.sockets) {
      const mine = trades.filter((t) => s.symbols.includes(t.symbol)).map((t) => ({ ...t, volume: 100, time }))
      if (mine.length) s.ws.send(JSON.stringify({ type: 'trades', trades: mine }))
    }
  }

  private connect(ws: WebSocketRoute) {
    const socket = { ws, symbols: [] as string[] }
    this.sockets.add(socket)
    ws.onClose(() => this.sockets.delete(socket))
    ws.onMessage((raw) => {
      const msg = JSON.parse(String(raw)) as { subscribe?: string[] }
      if (!msg.subscribe) return
      socket.symbols = msg.subscribe
      const live = this.streamState === 'live' ? msg.subscribe.filter(streamable) : []
      ws.send(JSON.stringify({ type: 'status', state: this.streamState, live }))
    })
  }

  private async handle(route: Route) {
    const req = route.request()
    const url = new URL(req.url())
    const key = decodeURIComponent(url.pathname + url.search)
    const method = req.method()
    this.requests.push(method === 'GET' ? key : `${method} ${key}`)

    const override = this.overrides.find(([re]) => re.test(key))
    const reply = override
      ? typeof override[1] === 'function'
        ? override[1](url)
        : override[1]
      : this.defaultReply(url, method, req.postData() ? (JSON.parse(req.postData()!) as Record<string, unknown>) : {})
    if (reply === 'abort') return route.abort('connectionrefused')

    if (reply.status === 204) return route.fulfill({ status: 204 })
    await route.fulfill({
      status: reply.status,
      contentType: reply.status >= 400 ? 'application/problem+json' : 'application/json',
      body: JSON.stringify(reply.body),
    })
  }

  /** The default answers, mirroring the real endpoints in backend/Stodash.Api/Endpoints. */
  private defaultReply(url: URL, method: string, body: Record<string, unknown>): Reply {
    const parts = url.pathname.split('/').slice(2).map(decodeURIComponent) // ['quote', 'AAPL']
    const [kind, symbol = ''] = parts
    const known = symbol in INSTRUMENTS

    switch (kind) {
      case 'health':
        return ok(health({ fred: this.ecoConfigured ? 'up' : 'off' }, this.streamState))
      case 'search':
        return ok(search(url.searchParams.get('q') ?? ''))
      case 'quotes':
        return ok((url.searchParams.get('symbols') ?? '').split(',').filter((s) => s in INSTRUMENTS).map(quote))
      case 'quote':
        return known ? ok(quote(symbol)) : notFound(symbol)
      case 'history':
        return known ? ok(history(symbol, url.searchParams.get('range') ?? '6M')) : notFound(symbol)
      case 'profile':
        return known ? ok(profile(symbol)) : notFound(symbol)
      case 'financials':
        return known
          ? ok(financials(symbol, url.searchParams.get('period') === 'quarterly' ? 'quarterly' : 'annual'))
          : notFound(symbol)
      case 'news':
        return known ? ok(news(symbol)) : notFound(symbol)
      case 'filings':
        return known ? ok(filings(symbol)) : notFound(symbol)
      case 'watchlists':
        return this.watchlistReply(parts.slice(1), method, body)
      case 'eco':
        if (parts[1]) {
          const s = ecoSeries(parts[1], url.searchParams.get('range') ?? '5Y')
          return s ? ok(s) : problem(404, 'Not found', `Unknown indicator '${parts[1]}'.`)
        }
        return ok(eco(this.ecoConfigured))
      case 'yieldcurve':
        return ok(yieldCurve())
      case 'fx':
        return ok(fx())
      case 'crypto':
        return ok(crypto())
      case 'topnews':
        return ok(topNews())
      case 'screener':
        return screener(url.searchParams)
      case 'layouts':
        return this.layoutReply(parts[1], method, body)
      default:
        return { status: 500, body: { title: `The mock API has no route for ${url.pathname}` } }
    }
  }

  /** A small in-memory version of LayoutService, with the same rules and messages. */
  private layoutReply(idPart: string | undefined, method: string, body: Record<string, unknown>): Reply {
    const name = typeof body.name === 'string' ? body.name.trim() : undefined
    const taken = (n: string, except?: number) =>
      this.layouts.some((l) => l.id !== except && l.name.toLowerCase() === n.toLowerCase())
    const checkWorkspace = (w: unknown) => {
      const panels = (w as { panels?: unknown })?.panels
      if (!Array.isArray(panels)) return 'The workspace must be an object with a "panels" array.'
      if (panels.length === 0) return 'Open at least one panel before saving a layout.'
      return null
    }
    const stamp = () => new Date().toISOString()

    if (!idPart) {
      if (method === 'GET') return ok([...this.layouts].sort((a, b) => a.name.localeCompare(b.name)))
      if (!name) return problem(400, 'Invalid request', 'Give the layout a name.')
      const bad = checkWorkspace(body.workspace)
      if (bad) return problem(400, 'Invalid request', bad)
      if (taken(name)) return problem(409, 'Conflict', `You already have a layout called "${name}".`)
      const created: Layout = { id: this.nextId++, name, workspace: body.workspace, updatedAt: stamp() }
      this.layouts.push(created)
      return { status: 201, body: created }
    }

    const layout = this.layouts.find((l) => l.id === Number(idPart))
    if (!layout) return problem(404, 'Not found', `Layout ${idPart} doesn't exist.`)
    if (method === 'DELETE') {
      this.layouts = this.layouts.filter((l) => l.id !== layout.id)
      return { status: 204, body: null }
    }
    if (method === 'PATCH') {
      if (name !== undefined && !name) return problem(400, 'Invalid request', 'Give the layout a name.')
      if (name && taken(name, layout.id)) return problem(409, 'Conflict', `You already have a layout called "${name}".`)
      if (body.workspace !== undefined) {
        const bad = checkWorkspace(body.workspace)
        if (bad) return problem(400, 'Invalid request', bad)
      }
      const updated: Layout = { ...layout, name: name ?? layout.name, workspace: body.workspace ?? layout.workspace, updatedAt: stamp() }
      this.layouts = this.layouts.map((l) => (l.id === layout.id ? updated : l))
      return ok(updated)
    }
    return { status: 500, body: { title: `The mock API has no layout route for ${method} ${idPart}` } }
  }

  /** A small in-memory version of WatchlistService, with the same rules and messages. */
  private watchlistReply(rest: string[], method: string, body: Record<string, unknown>): Reply {
    const [idPart, sub, sym] = rest
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    const taken = (n: string, except?: number) =>
      this.watchlists.some((l) => l.id !== except && l.name.toLowerCase() === n.toLowerCase())

    if (!idPart) {
      if (method === 'GET') return ok(this.watchlists)
      if (!name) return problem(400, 'Invalid request', 'Give the watchlist a name.')
      if (taken(name)) return problem(409, 'Conflict', `You already have a watchlist called "${name}".`)
      const created = { id: this.nextId++, name, symbols: [] }
      this.watchlists.push(created)
      return { status: 201, body: created }
    }

    const list = this.watchlists.find((l) => l.id === Number(idPart))
    if (!list) return problem(404, 'Not found', `Watchlist ${idPart} doesn't exist.`)
    const save = (updated: Watchlist): Reply => {
      this.watchlists = this.watchlists.map((l) => (l.id === updated.id ? updated : l))
      return ok(updated)
    }

    if (!sub) {
      if (method === 'PATCH') {
        if (!name) return problem(400, 'Invalid request', 'Give the watchlist a name.')
        if (taken(name, list.id)) return problem(409, 'Conflict', `You already have a watchlist called "${name}".`)
        return save({ ...list, name })
      }
      if (method === 'DELETE') {
        if (this.watchlists.length === 1)
          return problem(400, 'Invalid request', 'You need at least one watchlist. Create another before deleting this one.')
        this.watchlists = this.watchlists.filter((l) => l.id !== list.id)
        return { status: 204, body: null }
      }
    }
    if (sub === 'quotes') return ok(list.symbols.filter((s) => s in INSTRUMENTS).map(quote))
    if (sub === 'order') return save({ ...list, symbols: (body.symbols as string[]) ?? list.symbols })
    if (sub === 'items' && method === 'POST') {
      const s = String(body.symbol ?? '').toUpperCase()
      if (list.symbols.includes(s)) return problem(409, 'Conflict', `${s} is already in "${list.name}".`)
      if (!(s in INSTRUMENTS)) return notFound(s)
      return save({ ...list, symbols: [...list.symbols, s] })
    }
    if (sub === 'items' && method === 'DELETE') {
      const s = (sym ?? '').toUpperCase()
      if (!list.symbols.includes(s)) return problem(404, 'Not found', `${s} isn't in "${list.name}".`)
      return save({ ...list, symbols: list.symbols.filter((x) => x !== s) })
    }
    return { status: 500, body: { title: `The mock API has no watchlist route for ${method} ${rest.join('/')}` } }
  }
}
