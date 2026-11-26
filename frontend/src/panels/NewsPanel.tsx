import { api } from '../api/client'
import type { NewsItem } from '../api/types'
import { LoadError, PanelFrame } from '../components/PanelFrame'
import { QuoteHeader } from '../components/QuoteHeader'
import { staleOf, useApi } from '../hooks/useApi'
import { timeAgo } from '../lib/time'
import { FunctionSwitch, PanelTitle } from './FunctionSwitch'
import type { SymbolPanelProps } from './types'

const MAX_TICKERS = 4

export function NewsPanel({ symbol, onSwitch, ...frame }: SymbolPanelProps) {
  const quote = useApi(`quote:${symbol}`, (s) => api.quote(symbol, s), 30_000)
  // The backend caches news for 5 minutes, so refreshing faster would only re-read the cache.
  const news = useApi(`news:${symbol}`, (s) => api.news(symbol, s), 300_000)
  const fatal = quote.error && news.error ? news.error : undefined
  const items = news.data?.items ?? []

  return (
    <PanelFrame
      fn="N"
      stale={staleOf(quote, news)}
      title={<PanelTitle symbol={symbol} name={quote.data?.name} />}
      actions={<FunctionSwitch current="N" onSwitch={onSwitch} />}
      {...frame}
    >
      {fatal ? (
        <LoadError error={fatal} what={symbol} onRetry={() => { quote.reload(); news.reload() }} />
      ) : (
        <div className="news">
          <QuoteHeader quote={quote.data} loading={quote.loading} />
          {news.loading && <NewsSkeleton />}
          {news.error && <LoadError error={news.error} what="news" onRetry={news.reload} />}
          {news.data && items.length === 0 && (
            <div className="state">
              <strong>No recent headlines</strong>
              <span>Nothing was published about {symbol} lately.</span>
            </div>
          )}
          {items.length > 0 && (
            <>
              <ul className="news-list">
                {items.map((item) => (
                  <Headline key={item.url} item={item} symbol={symbol} />
                ))}
              </ul>
              <p className="news-source">
                {items.length} headlines from {news.data!.providers.join(' + ')} · links open in a new tab
              </p>
            </>
          )}
        </div>
      )}
    </PanelFrame>
  )
}

function Headline({ item, symbol }: { item: NewsItem; symbol: string }) {
  // List the panel's own ticker first, then a few others the story mentions.
  const tickers = [symbol, ...item.tickers.filter((t) => t !== symbol)]
    .filter((t) => item.tickers.includes(t))
    .slice(0, MAX_TICKERS)
  const extra = item.tickers.length - tickers.length
  const published = new Date(item.published)

  return (
    <li>
      <a className="news-item" href={item.url} target="_blank" rel="noopener noreferrer">
        <span className="headline">{item.headline}</span>
        {item.summary && <span className="news-summary">{item.summary}</span>}
        <span className="news-meta">
          {item.source && <span className="news-pub">{item.source}</span>}
          <time dateTime={item.published} title={published.toLocaleString()}>
            {timeAgo(item.published)}
          </time>
          {tickers.map((t) => (
            <span key={t} className={`badge mono${t === symbol ? ' self' : ''}`}>
              {t}
            </span>
          ))}
          {extra > 0 && <span className="muted">+{extra}</span>}
        </span>
      </a>
    </li>
  )
}

function NewsSkeleton() {
  return (
    <div style={{ display: 'grid', gap: 18, padding: '8px 16px' }} aria-hidden="true">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} style={{ display: 'grid', gap: 6 }}>
          <div className="skeleton" style={{ height: 15, width: `${90 - (i % 3) * 12}%` }} />
          <div className="skeleton" style={{ height: 11, width: '30%' }} />
        </div>
      ))}
    </div>
  )
}
