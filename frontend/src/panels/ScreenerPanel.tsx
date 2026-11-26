import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { ScreenerQuery, ScreenerResult, ScreenerRow, ScreenerSort } from '../api/types'
import { LoadError, PanelFrame } from '../components/PanelFrame'
import { staleOf, useApi } from '../hooks/useApi'
import * as fmt from '../lib/format'
import { openRowProps } from '../lib/rows'
import type { OpenCommand, PanelProps, ScreenFilters } from './types'

const PAGE = 100
/** Prices older than this mean the background refresh keeps failing (the snapshot is normally under 15 minutes old). */
const OLD_PRICES_MS = 24 * 3600_000
const ALL = 600

type NumKey = Exclude<keyof ScreenFilters, 'sector'>
const NUM_KEYS: NumKey[] = ['minCap', 'maxCap', 'minPe', 'maxPe', 'minChange', 'maxChange']

/** The range filters, each a min and max input. */
const RANGES: [label: string, min: NumKey, max: NumKey, unit: string][] = [
  ['Market cap', 'minCap', 'maxCap', '$B'],
  ['P/E', 'minPe', 'maxPe', ''],
  ['Change', 'minChange', 'maxChange', '%'],
]

const PRESETS: [label: string, screen: ScreenFilters, sort?: ScreenerSort, desc?: boolean][] = [
  ['Mega caps', { minCap: 200 }, 'marketCap', true],
  ['Value', { minPe: 0, maxPe: 15 }, 'pe', false],
  ['Gainers', { minChange: 2 }, 'change', true],
  ['Losers', { maxChange: -2 }, 'change', false],
]

const COLUMNS: [ScreenerSort, string, 'text' | 'num'][] = [
  ['symbol', 'Symbol', 'text'],
  ['name', 'Name', 'text'],
  ['sector', 'Sector', 'text'],
  ['price', 'Price', 'num'],
  ['change', 'Chg', 'num'],
  ['marketCap', 'Mkt cap', 'num'],
  ['pe', 'P/E', 'num'],
  ['forwardPe', 'Fwd P/E', 'num'],
  ['pb', 'P/B', 'num'],
  ['yield', 'Yield', 'num'],
]

/** Text columns sort A→Z first; numbers biggest first. */
const defaultDesc = (key: ScreenerSort) => !['symbol', 'name', 'sector'].includes(key)

interface Props extends PanelProps {
  screen: ScreenFilters
  sort: ScreenerSort
  desc: boolean
  onChange: (patch: { screen?: ScreenFilters; sort?: ScreenerSort; desc?: boolean }) => void
  onOpen: OpenCommand
}

/** EQS: screens the S&P 500 on the backend's snapshot. Filters apply a moment after you stop typing. */
export function ScreenerPanel({ screen, sort, desc, onChange, onOpen, ...frame }: Props) {
  const [showAll, setShowAll] = useState(false)
  // Inputs keep what's typed ("1.", "-") while the saved filters only hold numbers.
  const [draft, setDraft] = useState(() => toDraft(screen))

  const query: ScreenerQuery = {
    sector: screen.sector,
    minCap: billions(screen.minCap),
    maxCap: billions(screen.maxCap),
    minPe: screen.minPe,
    maxPe: screen.maxPe,
    minChange: screen.minChange,
    maxChange: screen.maxChange,
    sort,
    desc,
    limit: showAll ? ALL : PAGE,
  }
  const key = useDebounced(JSON.stringify(query), 300)
  // Prices in the snapshot are refreshed every 15 minutes at most, so polling every 5 is plenty.
  const result = useApi(`eqs:${key}`, (s) => api.screener(JSON.parse(key) as ScreenerQuery, s), 300_000)
  // While a changed screen loads, keep the previous rows on screen rather than flashing a skeleton.
  const [last, setLast] = useState<ScreenerResult>()
  if (result.data && result.data !== last) setLast(result.data)
  const data = result.data ?? (result.loading ? last : undefined)
  const pending = result.loading || key !== JSON.stringify(query)

  const setNum = (k: NumKey, text: string) => {
    setDraft((d) => ({ ...d, [k]: text }))
    const n = text.trim() === '' ? undefined : Number(text)
    if (n === undefined || Number.isFinite(n)) onChange({ screen: { ...screen, [k]: n } })
  }
  const apply = (next: ScreenFilters, nextSort = sort, nextDesc = desc) => {
    setDraft(toDraft(next))
    onChange({ screen: next, sort: nextSort, desc: nextDesc })
  }
  const toggleSort = (k: ScreenerSort) => onChange(k === sort ? { desc: !desc } : { sort: k, desc: defaultDesc(k) })
  const filtered = !!screen.sector || NUM_KEYS.some((k) => screen[k] !== undefined)
  const rangeError = RANGES.find(([, min, max]) => screen[min] !== undefined && screen[max] !== undefined && screen[min]! > screen[max]!)

  return (
    <PanelFrame fn="EQS" title={<span>Equity screener · {data?.universe ?? 'S&P 500'}</span>} stale={staleOf(result)} {...frame}>
      <div className="eqs">
        <div className="eqs-filters">
          <label className="eqs-field">
            <span>Sector</span>
            <select value={screen.sector ?? ''} onChange={(e) => apply({ ...screen, sector: e.target.value || undefined })}>
              <option value="">All sectors{data ? ` (${data.total})` : ''}</option>
              {data?.sectors.map((s) => (
                <option key={s.sector} value={s.sector}>
                  {s.sector} ({s.count})
                </option>
              ))}
              {/* Keep a saved sector selectable before the list loads. */}
              {screen.sector && !data?.sectors.some((s) => s.sector === screen.sector) && <option value={screen.sector}>{screen.sector}</option>}
            </select>
          </label>
          {RANGES.map(([label, min, max, unit]) => (
            <div className="eqs-field" key={label} role="group" aria-label={label}>
              <span>
                {label} {unit && <small>{unit}</small>}
              </span>
              <span className="eqs-range">
                <input inputMode="decimal" placeholder="min" value={draft[min]} onChange={(e) => setNum(min, e.target.value)}
                  aria-label={`Minimum ${label.toLowerCase()}${unit ? ` (${unit})` : ''}`} />
                <span className="muted">–</span>
                <input inputMode="decimal" placeholder="max" value={draft[max]} onChange={(e) => setNum(max, e.target.value)}
                  aria-label={`Maximum ${label.toLowerCase()}${unit ? ` (${unit})` : ''}`} />
              </span>
            </div>
          ))}
        </div>
        <div className="toolbar" role="toolbar" aria-label="Preset screens">
          {PRESETS.map(([label, preset, s, d]) => (
            <button key={label} className="chip" onClick={() => apply(preset, s, d)}>
              {label}
            </button>
          ))}
          <span className="sep" />
          <button className="chip" onClick={() => apply({}, 'marketCap', true)} disabled={!filtered}>
            Reset
          </button>
        </div>

        {rangeError ? (
          <p className="wl-message error" role="alert">The minimum {rangeError[0].toLowerCase()} is above the maximum.</p>
        ) : (
          <>
            {result.loading && !data && <div className="skeleton" style={{ height: 320, margin: '4px 12px' }} aria-hidden="true" />}
            {result.error && <LoadError error={result.error} what="the screener" onRetry={result.reload} />}
          </>
        )}
        {data && !rangeError && (
          <>
            <div className="eqs-summary" role="status">
              <strong>{data.matched}</strong> of {data.total} match
              {data.matched > data.rows.length && (
                <>
                  {' '}· showing the first {data.rows.length}{' '}
                  <button className="link-btn" onClick={() => setShowAll(true)}>
                    show all
                  </button>
                </>
              )}
              {pending && <span className="muted"> · updating…</span>}
            </div>
            {(result.updatedAt ?? 0) - Date.parse(data.pricesAsOf) > OLD_PRICES_MS && (
              <p className="eqs-old" role="status">
                These prices are from {new Date(data.pricesAsOf).toLocaleString()}. Yahoo hasn't answered since, so the
                screen uses the last good snapshot.
              </p>
            )}
            {data.rows.length === 0 ? (
              <div className="state">
                <strong>Nothing matches</strong>
                <span>Loosen a filter, or press Reset.</span>
              </div>
            ) : (
              <div className="eqs-table-wrap">
                <table className="eqs-table num">
                  <thead>
                    <tr>
                      {COLUMNS.map(([k, label, align]) => (
                        <th key={k} scope="col" className={align} aria-sort={k === sort ? (desc ? 'descending' : 'ascending') : 'none'}>
                          <button className="sort-btn" onClick={() => toggleSort(k)}>
                            {label}
                            <span className="sort-arrow" aria-hidden="true">
                              {k === sort ? (desc ? '▼' : '▲') : ''}
                            </span>
                          </button>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((r) => (
                      <Row key={r.symbol} row={r} onOpen={onOpen} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="fa-source">
              Prices as of {new Date(data.pricesAsOf).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              {data.refreshing ? ' (refreshing)' : ''} · list from {new Date(data.universeAsOf).toLocaleDateString()} · {data.source}
              {' '}· click a row for DES (Shift: new panel)
            </p>
          </>
        )}
      </div>
    </PanelFrame>
  )
}

function Row({ row: r, onOpen }: { row: ScreenerRow; onOpen: OpenCommand }) {
  return (
    <tr {...openRowProps((n) => onOpen(`${r.symbol} DES`, n))} title={`Open ${r.name} (${r.symbol})`}>
      <th scope="row" className="text mono">{r.symbol}</th>
      <td className="text name">{r.name}</td>
      <td className="text muted sector" title={r.industry ?? undefined}>{r.sector}</td>
      <td>{fmt.price(r.price)}</td>
      <td className={fmt.direction(r.changePercent)}>{fmt.signedPct(r.changePercent)}</td>
      <td>{fmt.big(r.marketCap)}</td>
      <td>{fmt.ratio(r.trailingPE)}</td>
      <td>{fmt.ratio(r.forwardPE)}</td>
      <td>{fmt.ratio(r.priceToBook)}</td>
      <td>{fmt.isNum(r.dividendYield) && r.dividendYield > 0 ? fmt.pct(r.dividendYield) : '—'}</td>
    </tr>
  )
}

const billions = (n: number | undefined) => (n === undefined ? undefined : n * 1e9)

function toDraft(s: ScreenFilters): Record<NumKey, string> {
  return Object.fromEntries(NUM_KEYS.map((k) => [k, s[k] === undefined ? '' : String(s[k])])) as Record<NumKey, string>
}

/** `value`, once it has stopped changing for `ms`. */
function useDebounced<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const t = window.setTimeout(() => setSettled(value), ms)
    return () => window.clearTimeout(t)
  }, [value, ms])
  return settled
}
