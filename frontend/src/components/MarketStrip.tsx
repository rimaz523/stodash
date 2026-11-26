import { api } from '../api/client'
import { useApi } from '../hooks/useApi'
import * as fmt from '../lib/format'

const WATCH: [symbol: string, label: string][] = [
  ['^GSPC', 'S&P 500'],
  ['^IXIC', 'Nasdaq'],
  ['^DJI', 'Dow Jones'],
  ['^RUT', 'Russell 2000'],
  ['^VIX', 'VIX'],
  ['^TNX', 'US 10Y yield'],
  ['EURUSD=X', 'EUR/USD'],
  ['JPY=X', 'USD/JPY'],
  ['GC=F', 'Gold'],
  ['CL=F', 'WTI crude'],
  ['BTC-USD', 'Bitcoin'],
]
const SYMBOLS = WATCH.map(([s]) => s)

export function MarketStrip({ onOpen }: { onOpen: (symbol: string, newPanel: boolean) => void }) {
  const { data } = useApi('strip', (s) => api.quotes(SYMBOLS, s), 60_000)
  const bySymbol = new Map(data?.map((q) => [q.symbol, q]))

  return (
    <nav className="strip" aria-label="Markets overview">
      {WATCH.map(([symbol, label]) => {
        const q = bySymbol.get(symbol)
        const dir = fmt.direction(q?.change)
        return (
          <button
            key={symbol}
            className="strip-item"
            onClick={(e) => onOpen(symbol, e.shiftKey)}
            title={`${symbol} — open chart (Shift-click for a new panel)`}
          >
            <span className="si-label">{label}</span>
            <span className="si-row num">
              {q ? (
                <>
                  <span>{fmt.price(q.price)}</span>
                  <span className={dir}>{fmt.signedPct(q.changePercent)}</span>
                </>
              ) : (
                <span className="skeleton" style={{ width: 90, height: 14, marginTop: 2 }} />
              )}
            </span>
          </button>
        )
      })}
    </nav>
  )
}
