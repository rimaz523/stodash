import type { ReactNode } from 'react'
import type { Quote } from '../api/types'
import * as fmt from '../lib/format'

export function QuoteHeader({ quote, loading, extra }: { quote?: Quote; loading: boolean; extra?: ReactNode }) {
  if (!quote) {
    return (
      <div className="quote-head" aria-busy={loading}>
        {loading && (
          <>
            <div className="skeleton" style={{ width: 150, height: 30 }} />
            <div className="skeleton" style={{ width: 120, height: 24 }} />
          </>
        )}
      </div>
    )
  }

  const dir = fmt.direction(quote.change)
  const state = fmt.marketState(quote.marketState)
  const asOf = quote.time
    ? new Date(quote.time).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : null

  return (
    <div className="quote-head">
      <div>
        <span className="last num">{fmt.price(quote.price)}</span>
        {quote.currency && <span className="ccy">{quote.currency}</span>}
      </div>
      <span className={`pill num ${dir}`}>
        {fmt.signed(quote.change)} ({fmt.signedPct(quote.changePercent)})
      </span>
      {extra}
      <div className="meta">
        {state && (
          <>
            <span className={`dot${quote.marketState === 'REGULAR' ? ' live' : ''}`} />
            <span>{state}</span>
          </>
        )}
        {asOf && <span>· as of {asOf}</span>}
      </div>
    </div>
  )
}
