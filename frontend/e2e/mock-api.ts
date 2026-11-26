import type { Page, Route } from '@playwright/test'
import type {
  CompanyProfile,
  Filing,
  FilingCategory,
  FilingList,
  FinancialStatements,
  Health,
  NewsFeed,
  PriceHistory,
  ProviderStatus,
  Quote,
  SearchResult,
  StatementRow,
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

const provider = (state: ProviderStatus['state']): ProviderStatus => ({
  configured: state !== 'off',
  state,
  lastOk: state === 'up' ? '2026-11-26T04:00:00Z' : null,
  lastFailure: state === 'down' ? '2026-11-26T04:00:00Z' : null,
  lastError: state === 'down' ? 'SEC EDGAR timed out.' : null,
})

export function health(states: Partial<Record<keyof Health['providers'], ProviderStatus['state']>> = {}): Health {
  return {
    status: 'ok',
    providers: {
      yahoo: provider(states.yahoo ?? 'up'),
      sec: provider(states.sec ?? 'up'),
      finnhub: provider(states.finnhub ?? 'off'),
    },
  }
}

// ------------------------------------------------------------------ routing

export type Reply = { status: number; body: unknown } | 'abort'

const notFound = (symbol: string): Reply => ({
  status: 404,
  body: { title: 'Symbol not found', status: 404, detail: `No instrument found for '${symbol}'.` },
})

/** The default answers, mirroring the real endpoints in backend/Stodash.Api/Endpoints/MarketEndpoints.cs. */
function defaultReply(url: URL): Reply {
  const parts = url.pathname.split('/').slice(2).map(decodeURIComponent) // ['quote', 'AAPL']
  const [kind, symbol = ''] = parts
  const ok = (body: unknown): Reply => ({ status: 200, body })
  const known = symbol in INSTRUMENTS

  switch (kind) {
    case 'health':
      return ok(health())
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
    default:
      return { status: 500, body: { title: `The mock API has no route for ${url.pathname}` } }
  }
}

export class MockApi {
  /** Every /api request the page made, as "path?query", in order. */
  readonly requests: string[] = []
  private readonly overrides: [RegExp, Reply | ((url: URL) => Reply)][] = []

  /** Answer requests whose "path?query" matches `pattern` with `reply` instead of the default. Latest wins. */
  on(pattern: RegExp, reply: Reply | ((url: URL) => Reply)) {
    this.overrides.unshift([pattern, reply])
  }

  async install(page: Page) {
    // Match on the path, not a "**/api/**" glob, which would also catch Vite's /src/api/*.ts modules.
    await page.route((url) => url.pathname.startsWith('/api/'), (route) => this.handle(route))
  }

  private async handle(route: Route) {
    const url = new URL(route.request().url())
    const key = url.pathname + url.search
    this.requests.push(decodeURIComponent(key))

    const override = this.overrides.find(([re]) => re.test(decodeURIComponent(key)))
    const reply = override ? (typeof override[1] === 'function' ? override[1](url) : override[1]) : defaultReply(url)
    if (reply === 'abort') return route.abort('connectionrefused')

    const problem = reply.status >= 400
    await route.fulfill({
      status: reply.status,
      contentType: problem ? 'application/problem+json' : 'application/json',
      body: JSON.stringify(reply.body),
    })
  }
}
