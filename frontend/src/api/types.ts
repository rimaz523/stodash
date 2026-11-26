// Mirrors backend/Stodash.Api/Models/MarketModels.cs

export interface Quote {
  symbol: string
  name: string | null
  exchange: string | null
  currency: string | null
  quoteType: string | null
  price: number | null
  change: number | null
  /** Already a percent: 1.25 means +1.25% */
  changePercent: number | null
  previousClose: number | null
  open: number | null
  dayHigh: number | null
  dayLow: number | null
  volume: number | null
  marketCap: number | null
  marketState: string | null
  time: string | null
  source: string
}

export interface PriceBar {
  /** Unix seconds, UTC */
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface PriceHistory {
  symbol: string
  range: string
  interval: string
  intraday: boolean
  currency: string | null
  timezone: string | null
  previousClose: number | null
  bars: PriceBar[]
}

export interface CompanyOfficer {
  name: string
  title: string | null
  age: number | null
}

/** Margins, growth, yield and ROE are fractions (0.25 = 25%). */
export interface KeyStats {
  marketCap: number | null
  enterpriseValue: number | null
  trailingPE: number | null
  forwardPE: number | null
  pegRatio: number | null
  priceToBook: number | null
  trailingEps: number | null
  forwardEps: number | null
  dividendYield: number | null
  beta: number | null
  fiftyTwoWeekHigh: number | null
  fiftyTwoWeekLow: number | null
  fiftyDayAverage: number | null
  twoHundredDayAverage: number | null
  averageVolume: number | null
  sharesOutstanding: number | null
  totalRevenue: number | null
  revenueGrowth: number | null
  grossMargin: number | null
  operatingMargin: number | null
  profitMargin: number | null
  returnOnEquity: number | null
  totalCash: number | null
  totalDebt: number | null
  targetMeanPrice: number | null
  recommendation: string | null
}

export interface CompanyProfile {
  symbol: string
  name: string | null
  exchange: string | null
  currency: string | null
  quoteType: string | null
  sector: string | null
  industry: string | null
  country: string | null
  city: string | null
  state: string | null
  website: string | null
  employees: number | null
  summary: string | null
  officers: CompanyOfficer[]
  stats: KeyStats
  source: string
}

export interface SearchResult {
  symbol: string
  name: string | null
  type: string | null
  exchange: string | null
}

export const RANGES = ['1D', '5D', '1M', '3M', '6M', 'YTD', '1Y', '5Y', 'MAX'] as const
export type Range = (typeof RANGES)[number]

// Mirrors backend/Stodash.Api/Models/ResearchModels.cs

/**
 * How to read a row's numbers: money (statement currency), perShare (currency per share), shares (a count),
 * fraction (0.25 = 25%) or multiple (a plain ratio such as 1.8).
 */
export type RowUnit = 'money' | 'perShare' | 'shares' | 'fraction' | 'multiple'

export interface StatementRow {
  id: string
  label: string
  unit: RowUnit
  /** One of the key rows shown by default; the rest appear when expanded. */
  core: boolean
  /** A subtotal or total, shown in bold. */
  total: boolean
  /** Lines up with FinancialStatements.periods. */
  values: (number | null)[]
}

export const PERIODS = ['annual', 'quarterly'] as const
export type Period = (typeof PERIODS)[number]

export interface FinancialStatements {
  symbol: string
  period: Period
  currency: string | null
  /** Period end dates (yyyy-MM-dd), newest first. */
  periods: string[]
  income: StatementRow[]
  balance: StatementRow[]
  cashFlow: StatementRow[]
  ratios: StatementRow[]
  /** Why there's nothing to show (an index, currency, crypto). Null when there is data. */
  note: string | null
  source: string
}

export interface NewsItem {
  headline: string
  /** Always an absolute http(s) link (checked by the backend). */
  url: string
  source: string | null
  published: string
  summary: string | null
  tickers: string[]
  provider: string
}

export interface NewsFeed {
  symbol: string
  items: NewsItem[]
  providers: string[]
}

/** TOP. Each item's `provider` names the feed it came from ("CNBC", "Finnhub", ...). */
export interface TopNewsFeed {
  items: NewsItem[]
  /** Feeds that answered. */
  providers: string[]
  /** Feeds that failed this time. */
  failed: string[]
  asOf: string
}

export const FILING_CATEGORIES = ['annual', 'quarterly', 'current', 'proxy', 'insider', 'other'] as const
export type FilingCategory = (typeof FILING_CATEGORIES)[number]

export interface Filing {
  form: string
  category: FilingCategory
  /** yyyy-MM-dd */
  filingDate: string
  reportDate: string | null
  description: string
  url: string
  indexUrl: string
  accessionNumber: string
}

export interface FilingList {
  symbol: string
  cik: number | null
  company: string | null
  /** Newest first. */
  items: Filing[]
  /** Why there are no filings (a non-US listing, an index). Null when the company is on EDGAR. */
  note: string | null
  source: string
}

// Mirrors the anonymous object returned by GET /api/health

export interface ProviderStatus {
  configured: boolean
  state: 'off' | 'unknown' | 'up' | 'down'
  lastOk: string | null
  lastFailure: string | null
  lastError: string | null
}

export const PROVIDERS = ['yahoo', 'sec', 'finnhub', 'fred', 'treasury', 'coingecko', 'frankfurter', 'rss', 'indexlist', 'database'] as const
export type ProviderName = (typeof PROVIDERS)[number]

/** off (no Finnhub key), idle (no one watching), connecting, live or error. */
export type StreamState = 'off' | 'idle' | 'connecting' | 'live' | 'error'

/** One provider's test call from GET /api/health?check=true. */
export interface ProviderCheck {
  state: 'ok' | 'failed' | 'skipped'
  ms: number | null
  error: string | null
}

export interface Health {
  status: string
  providers: Record<ProviderName, ProviderStatus>
  stream: { state: StreamState; error: string | null }
  /** Only with ?check=true; null otherwise. */
  check?: Record<ProviderName, ProviderCheck> | null
}

// Mirrors backend/Stodash.Api/Models/WatchlistModels.cs

export interface Watchlist {
  id: number
  name: string
  /** In the user's chosen order. */
  symbols: string[]
}

// Mirrors backend/Stodash.Api/Models/MacroModels.cs

export interface EcoPoint {
  /** yyyy-MM-dd */
  date: string
  value: number
}

/** percent (4.2 = 4.2%), points (percentage points), count (e.g. jobless claims) or index. */
export type EcoUnit = 'percent' | 'points' | 'count' | 'index'

export interface EcoIndicator {
  id: string
  label: string
  seriesId: string
  unit: EcoUnit
  frequency: string
  description: string
  latest: number | null
  previous: number | null
  /** latest − previous, in the indicator's unit */
  change: number | null
  latestDate: string | null
  sparkline: EcoPoint[]
}

export interface EcoDashboard {
  configured: boolean
  note: string | null
  indicators: EcoIndicator[]
  source: string
}

export const ECO_RANGES = ['1Y', '5Y', '10Y', '20Y'] as const
export type EcoRange = (typeof ECO_RANGES)[number]

export interface EcoSeries {
  id: string
  label: string
  seriesId: string
  unit: EcoUnit
  frequency: string
  description: string
  range: EcoRange
  points: EcoPoint[]
  source: string
}

export interface YieldMaturity {
  label: string
  months: number
}

export interface YieldCurveLine {
  label: string
  date: string
  /** Percents, lined up with YieldCurve.maturities. */
  yields: (number | null)[]
}

export interface YieldCurve {
  maturities: YieldMaturity[]
  /** Latest, about 1 month ago, about 1 year ago. */
  curves: YieldCurveLine[]
  /** Basis points; negative means inverted. */
  spreads: { label: string; bp: number | null }[]
  source: string
}

export interface FxPair {
  pair: string
  base: string
  quote: string
  symbol: string
  rate: number | null
  change: number | null
  /** Already a percent: 0.25 means +0.25% */
  changePercent: number | null
  /** Yahoo, ECB (daily reference rate) or none */
  source: string
  time: string | null
}

export interface FxBoard {
  pairs: FxPair[]
  currencies: string[]
  /** matrix[i][j] = units of currencies[j] per one unit of currencies[i] */
  matrix: (number | null)[][]
}

export interface CryptoCoin {
  rank: number
  id: string
  symbol: string
  name: string
  price: number | null
  /** Percents: 3.2 means +3.2% */
  change24h: number | null
  change7d: number | null
  marketCap: number | null
  volume24h: number | null
  sparkline: number[]
  yahooSymbol: string
}

export interface CryptoBoard {
  coins: CryptoCoin[]
  source: string
  asOf: string
}

// Mirrors backend/Stodash.Api/Models/ScreenerModels.cs

export interface ScreenerRow {
  /** Yahoo's form: BRK-B. */
  symbol: string
  name: string
  /** GICS sector. */
  sector: string
  industry: string | null
  price: number | null
  /** Already a percent: 1.25 means +1.25%. */
  changePercent: number | null
  marketCap: number | null
  trailingPE: number | null
  forwardPE: number | null
  priceToBook: number | null
  /** A fraction: 0.015 means 1.5%. */
  dividendYield: number | null
  fiftyTwoWeekHigh: number | null
  fiftyTwoWeekLow: number | null
  volume: number | null
}

export interface SectorCount {
  sector: string
  count: number
}

export const SCREENER_SORTS = ['symbol', 'name', 'sector', 'price', 'change', 'marketCap', 'pe', 'forwardPe', 'pb', 'yield', 'volume'] as const
export type ScreenerSort = (typeof SCREENER_SORTS)[number]

/** GET /api/screener's filters. Market caps in dollars, changes in percent. Missing means no limit. */
export interface ScreenerQuery {
  sector?: string
  minCap?: number
  maxCap?: number
  minPe?: number
  maxPe?: number
  minChange?: number
  maxChange?: number
  sort?: ScreenerSort
  desc?: boolean
  limit?: number
}

export interface ScreenerResult {
  universe: string
  total: number
  matched: number
  rows: ScreenerRow[]
  sectors: SectorCount[]
  universeAsOf: string
  pricesAsOf: string
  /** Newer prices are being fetched in the background. */
  refreshing: boolean
  source: string
}

// Mirrors backend/Stodash.Api/Models/LayoutModels.cs

/** A saved workspace. `workspace` is whatever the app saved; App validates it before loading. */
export interface Layout {
  id: number
  name: string
  workspace: unknown
  updatedAt: string
}
