import type {
  CompanyProfile,
  CryptoBoard,
  EcoDashboard,
  EcoRange,
  EcoSeries,
  FxBoard,
  FilingList,
  FinancialStatements,
  Health,
  NewsFeed,
  Period,
  PriceHistory,
  Quote,
  Range,
  SearchResult,
  Watchlist,
  YieldCurve,
} from './types'

export class ApiError extends Error {
  readonly status: number
  readonly title: string

  constructor(status: number, title: string, detail?: string) {
    super(detail || title)
    this.status = status
    this.title = title
  }
}

async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  return request<T>('GET', path, undefined, signal)
}

async function request<T>(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, {
      method,
      signal,
      headers: { Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err
    throw new ApiError(0, 'Backend offline', 'Cannot reach the Stodash API. Is the backend running on :5080?')
  }

  if (res.status === 204) return undefined as T
  if (res.ok) return (await res.json()) as T

  // The API returns RFC 7807 problem details; the Vite proxy returns plain text when the API is down.
  let title = res.statusText || 'Request failed'
  let detail: string | undefined
  try {
    const problem = await res.json()
    title = problem.title ?? title
    detail = problem.detail
  } catch {
    if (res.status === 502 || res.status === 504 || res.status === 500)
      detail = 'Cannot reach the Stodash API. Is the backend running on :5080?'
  }
  throw new ApiError(res.status, title, detail)
}

const enc = encodeURIComponent

export const api = {
  quote: (symbol: string, signal?: AbortSignal) => get<Quote>(`/api/quote/${enc(symbol)}`, signal),
  quotes: (symbols: string[], signal?: AbortSignal) =>
    get<Quote[]>(`/api/quotes?symbols=${symbols.map(enc).join(',')}`, signal),
  history: (symbol: string, range: Range, signal?: AbortSignal) =>
    get<PriceHistory>(`/api/history/${enc(symbol)}?range=${range}`, signal),
  profile: (symbol: string, signal?: AbortSignal) => get<CompanyProfile>(`/api/profile/${enc(symbol)}`, signal),
  search: (q: string, signal?: AbortSignal) => get<SearchResult[]>(`/api/search?q=${enc(q)}`, signal),
  financials: (symbol: string, period: Period, signal?: AbortSignal) =>
    get<FinancialStatements>(`/api/financials/${enc(symbol)}?period=${period}`, signal),
  news: (symbol: string, signal?: AbortSignal) => get<NewsFeed>(`/api/news/${enc(symbol)}`, signal),
  filings: (symbol: string, signal?: AbortSignal) => get<FilingList>(`/api/filings/${enc(symbol)}`, signal),
  health: (signal?: AbortSignal) => get<Health>('/api/health', signal),

  watchlists: (signal?: AbortSignal) => get<Watchlist[]>('/api/watchlists', signal),
  watchlistQuotes: (id: number, signal?: AbortSignal) => get<Quote[]>(`/api/watchlists/${id}/quotes`, signal),
  createWatchlist: (name: string) => request<Watchlist>('POST', '/api/watchlists', { name }),
  renameWatchlist: (id: number, name: string) => request<Watchlist>('PATCH', `/api/watchlists/${id}`, { name }),
  deleteWatchlist: (id: number) => request<void>('DELETE', `/api/watchlists/${id}`),
  addToWatchlist: (id: number, symbol: string) => request<Watchlist>('POST', `/api/watchlists/${id}/items`, { symbol }),
  removeFromWatchlist: (id: number, symbol: string) =>
    request<Watchlist>('DELETE', `/api/watchlists/${id}/items/${enc(symbol)}`),
  reorderWatchlist: (id: number, symbols: string[]) => request<Watchlist>('PUT', `/api/watchlists/${id}/order`, { symbols }),

  eco: (signal?: AbortSignal) => get<EcoDashboard>('/api/eco', signal),
  ecoSeries: (id: string, range: EcoRange, signal?: AbortSignal) =>
    get<EcoSeries>(`/api/eco/${enc(id)}?range=${range}`, signal),
  yieldCurve: (signal?: AbortSignal) => get<YieldCurve>('/api/yieldcurve', signal),
  fx: (signal?: AbortSignal) => get<FxBoard>('/api/fx', signal),
  crypto: (signal?: AbortSignal) => get<CryptoBoard>('/api/crypto', signal),
}
