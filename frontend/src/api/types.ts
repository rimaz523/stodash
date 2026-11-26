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

export interface Health {
  status: string
  providers: { yahoo: ProviderStatus; finnhub: ProviderStatus; sec: ProviderStatus }
}
