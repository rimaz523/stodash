import { api } from '../api/client'
import type { NewsItem } from '../api/types'
import { LoadError, PanelFrame } from '../components/PanelFrame'
import { staleOf, useApi } from '../hooks/useApi'
import { timeAgo } from '../lib/time'
import type { PanelProps } from './types'

const MAX_TICKERS = 4

interface Props extends PanelProps {
  /** The feed to show, or undefined for every feed. */
  source?: string
  onSourceChange: (source: string | undefined) => void
}

/** TOP: market-wide headlines from several feeds, newest first, with a chip per feed. */
export function TopPanel({ source, onSourceChange, ...frame }: Props) {
  // The backend caches headlines for 5 minutes, so polling faster would only re-read its cache.
  const feed = useApi('topnews', (s) => api.topNews(s), 300_000)
  const all = feed.data?.items ?? []
  const counts = new Map<string, number>()
  for (const i of all) counts.set(i.provider, (counts.get(i.provider) ?? 0) + 1)
  // A saved filter for a feed that has nothing right now falls back to every feed.
  const current = source && counts.has(source) ? source : undefined
  const items = current ? all.filter((i) => i.provider === current) : all

  return (
    <PanelFrame fn="TOP" title={<span>Top news</span>} stale={staleOf(feed)} {...frame}>
      {feed.loading && <TopSkeleton />}
      {feed.error && <LoadError error={feed.error} what="headlines" onRetry={feed.reload} />}
      {feed.data && (
        <div className="news top">
          <div className="toolbar" role="toolbar" aria-label="Filter by source">
            <button className={`chip${current ? '' : ' on'}`} aria-pressed={!current} onClick={() => onSourceChange(undefined)}>
              All <span className="count">{all.length}</span>
            </button>
            {[...counts].map(([name, n]) => (
              <button
                key={name}
                className={`chip${current === name ? ' on' : ''}`}
                aria-pressed={current === name}
                onClick={() => onSourceChange(current === name ? undefined : name)}
              >
                {name} <span className="count">{n}</span>
              </button>
            ))}
          </div>
          {feed.data.failed.length > 0 && (
            <p className="top-failed" role="status">
              Couldn't reach {feed.data.failed.join(', ')} this time; showing the other feeds.
            </p>
          )}
          {items.length === 0 ? (
            <div className="state">
              <strong>No headlines right now</strong>
              <span>None of the feeds had stories from the last week.</span>
            </div>
          ) : (
            <ul className="news-list">
              {items.map((item) => (
                <TopHeadline key={item.url} item={item} />
              ))}
            </ul>
          )}
          <p className="news-source">
            {all.length} headlines from {feed.data.providers.join(', ')} · links open in a new tab
          </p>
        </div>
      )}
    </PanelFrame>
  )
}

function TopHeadline({ item }: { item: NewsItem }) {
  const tickers = item.tickers.slice(0, MAX_TICKERS)
  const extra = item.tickers.length - tickers.length
  // Finnhub stories name their publisher (Reuters, CNBC, ...) separately from the feed they came through.
  const via = item.source && item.source !== item.provider ? item.source : null
  return (
    <li>
      <a className="news-item" href={item.url} target="_blank" rel="noopener noreferrer">
        <span className="headline">{item.headline}</span>
        {item.summary && <span className="news-summary">{item.summary}</span>}
        <span className="news-meta">
          <span className="news-pub">{item.provider}</span>
          {via && <span className="muted">{via}</span>}
          <time dateTime={item.published} title={new Date(item.published).toLocaleString()}>
            {timeAgo(item.published)}
          </time>
          {tickers.map((t) => (
            <span key={t} className="badge mono">
              {t}
            </span>
          ))}
          {extra > 0 && <span className="muted">+{extra}</span>}
        </span>
      </a>
    </li>
  )
}

function TopSkeleton() {
  return (
    <div style={{ display: 'grid', gap: 18, padding: '16px' }} aria-hidden="true">
      {Array.from({ length: 7 }, (_, i) => (
        <div key={i} style={{ display: 'grid', gap: 6 }}>
          <div className="skeleton" style={{ height: 15, width: `${92 - (i % 3) * 11}%` }} />
          <div className="skeleton" style={{ height: 11, width: '28%' }} />
        </div>
      ))}
    </div>
  )
}
