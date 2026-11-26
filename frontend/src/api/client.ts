import type { CompanyProfile, PriceHistory, Quote, Range, SearchResult } from './types'

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
  let res: Response
  try {
    res = await fetch(path, { signal, headers: { Accept: 'application/json' } })
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err
    throw new ApiError(0, 'Backend offline', 'Cannot reach the Stodash API. Is the backend running on :5080?')
  }

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
}
