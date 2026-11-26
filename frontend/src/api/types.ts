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
