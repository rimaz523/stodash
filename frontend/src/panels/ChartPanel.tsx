import { api } from '../api/client'
import { RANGES, type Range } from '../api/types'
import { LoadError, PanelFrame } from '../components/PanelFrame'
import { PriceChart, type ChartOptions } from '../components/PriceChart'
import { QuoteHeader } from '../components/QuoteHeader'
import { staleOf, useApi } from '../hooks/useApi'
import { useLocalStorage } from '../hooks/useLocalStorage'
import * as fmt from '../lib/format'
import { FunctionSwitch, PanelTitle } from './FunctionSwitch'
import type { SymbolPanelProps } from './types'

const DEFAULT_OPTIONS: ChartOptions = { type: 'candle', sma20: false, sma50: false, volume: true }

function isChartOptions(v: unknown): v is ChartOptions {
  const o = v as ChartOptions
  return !!o && (o.type === 'candle' || o.type === 'area') && typeof o.volume === 'boolean'
}

interface Props extends SymbolPanelProps {
  range: Range
  onRangeChange: (range: Range) => void
}

export function ChartPanel({ symbol, range, onRangeChange, onSwitch, ...frame }: Props) {
  // Display preferences are shared by every chart panel and remembered across reloads.
  const [options, setOptions] = useLocalStorage('stodash.chart.v1', DEFAULT_OPTIONS, isChartOptions)
  const quote = useApi(`quote:${symbol}`, (s) => api.quote(symbol, s), 30_000)
  const history = useApi(
    `history:${symbol}:${range}`,
    (s) => api.history(symbol, range, s),
    range === '1D' ? 60_000 : range === '5D' ? 300_000 : undefined,
  )

  const bars = history.data?.bars ?? []
  const first = range === '1D' ? (history.data?.previousClose ?? bars[0]?.close) : bars[0]?.close
  const last = bars.at(-1)?.close
  const periodChange = fmt.isNum(first) && fmt.isNum(last) && first !== 0 ? ((last - first) / first) * 100 : null

  const toggle = (key: 'sma20' | 'sma50' | 'volume') => setOptions((o) => ({ ...o, [key]: !o[key] }))
  const fatal = quote.error && history.error ? history.error : undefined

  return (
    <PanelFrame
      fn="GP"
      stale={staleOf(quote, history)}
      title={<PanelTitle symbol={symbol} name={quote.data?.name} />}
      actions={<FunctionSwitch current="GP" onSwitch={onSwitch} />}
      {...frame}
    >
      {fatal ? (
        <LoadError error={fatal} what={symbol} onRetry={() => { quote.reload(); history.reload() }} />
      ) : (
        <div className="gp">
          <QuoteHeader
            quote={quote.data}
            loading={quote.loading}
            extra={
              periodChange !== null && range !== '1D' ? (
                <span className="muted num" style={{ fontSize: 13 }}>
                  {range}{' '}
                  <span className={fmt.direction(periodChange)}>{fmt.signedPct(periodChange)}</span>
                </span>
              ) : null
            }
          />
          <div className="toolbar" role="toolbar" aria-label="Chart controls">
            {RANGES.map((r) => (
              <button
                key={r}
                className={`chip mono${r === range ? ' on' : ''}`}
                onClick={() => onRangeChange(r)}
                aria-pressed={r === range}
              >
                {r}
              </button>
            ))}
            <span className="sep" />
            <button
              className={`chip${options.type === 'candle' ? ' on' : ''}`}
              onClick={() => setOptions((o) => ({ ...o, type: 'candle' }))}
              aria-pressed={options.type === 'candle'}
            >
              Candles
            </button>
            <button
              className={`chip${options.type === 'area' ? ' on' : ''}`}
              onClick={() => setOptions((o) => ({ ...o, type: 'area' }))}
              aria-pressed={options.type === 'area'}
            >
              Line
            </button>
            <span className="sep" />
            <button className={`chip${options.sma20 ? ' on' : ''}`} onClick={() => toggle('sma20')} aria-pressed={options.sma20}>
              SMA 20
            </button>
            <button className={`chip${options.sma50 ? ' on' : ''}`} onClick={() => toggle('sma50')} aria-pressed={options.sma50}>
              SMA 50
            </button>
            <button className={`chip${options.volume ? ' on' : ''}`} onClick={() => toggle('volume')} aria-pressed={options.volume}>
              Volume
            </button>
          </div>

          {history.error ? (
            <LoadError error={history.error} what="price history" onRetry={history.reload} />
          ) : history.data && history.data.bars.length === 0 ? (
            <div className="state">
              <strong>No prices for {range}</strong>
              <span>{symbol} has no trading data in this range. Try a longer one.</span>
            </div>
          ) : history.data ? (
            <PriceChart history={history.data} options={options} />
          ) : (
            <div className="chart-wrap">
              <div className="skeleton" style={{ position: 'absolute', inset: '8px 12px 12px' }} />
            </div>
          )}
        </div>
      )}
    </PanelFrame>
  )
}
