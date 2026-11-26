import { useCallback } from 'react'
import { api } from '../api/client'
import { ECO_RANGES, type EcoIndicator, type EcoRange, type EcoUnit } from '../api/types'
import { LineChart } from '../components/LineChart'
import { LoadError, PanelFrame } from '../components/PanelFrame'
import { Sparkline } from '../components/Sparkline'
import { staleOf, useApi } from '../hooks/useApi'
import * as fmt from '../lib/format'
import { calendarDate } from '../lib/time'
import type { PanelProps } from './types'

interface Props extends PanelProps {
  /** The indicator shown in detail (e.g. "CPI"), or none for the tile grid. */
  indicator?: string
  range: EcoRange
  onChange: (patch: { indicator?: string; ecoRange?: EcoRange }) => void
}

/** "4.21%", "0.24 pp", "221,000", "71.8" */
function ecoValue(v: number | null | undefined, unit: EcoUnit): string {
  if (!fmt.isNum(v)) return '—'
  switch (unit) {
    case 'percent':
      return `${v.toFixed(2)}%`
    case 'points':
      return `${v.toFixed(2)} pp`
    case 'count':
      return fmt.int(v)
    default:
      return v.toFixed(1)
  }
}

/** Change in the indicator's own unit: "+0.10 pp" for rates, "+5,000" for counts. */
function ecoChange(v: number | null | undefined, unit: EcoUnit): string {
  if (!fmt.isNum(v)) return '—'
  const sign = v > 0 ? '+' : v < 0 ? '−' : ''
  const abs = Math.abs(v)
  if (unit === 'count') return `${sign}${fmt.int(abs)}`
  if (unit === 'index') return `${sign}${abs.toFixed(1)}`
  return `${sign}${abs.toFixed(2)} pp`
}

/** "Oct 2026" for monthly data, "Q3 2026" for quarterly, "Nov 21, 2026" for daily and weekly. */
function periodLabel(date: string | null, frequency: string): string {
  if (!date) return ''
  if (frequency === 'Monthly') return calendarDate(date, { month: 'short', year: 'numeric' })
  if (frequency === 'Quarterly') return `Q${Math.floor((Number(date.slice(5, 7)) - 1) / 3) + 1} ${date.slice(0, 4)}`
  return calendarDate(date)
}

export function EcoPanel({ indicator, range, onChange, ...frame }: Props) {
  const dash = useApi('eco', (s) => api.eco(s), 3_600_000)
  const selected = dash.data?.indicators.find((i) => i.id === indicator)

  return (
    <PanelFrame fn="ECO" title={<span>US economy</span>} stale={staleOf(dash)} {...frame}>
      {dash.loading && <TilesSkeleton />}
      {dash.error && <LoadError error={dash.error} what="economic data" onRetry={dash.reload} />}
      {dash.data && !dash.data.configured && (
        <div className="state">
          <strong>FRED key not configured</strong>
          <span>ECO uses free data from the St. Louis Fed (FRED), which needs a free API key.</span>
          <span>
            Get one at{' '}
            <a href="https://fred.stlouisfed.org/docs/api/api_key.html" target="_blank" rel="noopener noreferrer">
              fred.stlouisfed.org
            </a>
            , then run:
          </span>
          <code className="setup">dotnet user-secrets set "Fred:ApiKey" "YOUR_KEY" --project backend/Stodash.Api</code>
          <span className="muted">and restart the API.</span>
        </div>
      )}
      {dash.data?.configured && (
        <div className="eco">
          {selected ? (
            <Detail ind={selected} range={range} onRange={(r) => onChange({ ecoRange: r })} onBack={() => onChange({ indicator: undefined })} />
          ) : (
            <div className="eco-grid">
              {dash.data.indicators.map((ind) => (
                <Tile key={ind.id} ind={ind} onOpen={() => onChange({ indicator: ind.id })} />
              ))}
            </div>
          )}
          <p className="fa-source">Source: {dash.data.source}</p>
        </div>
      )}
    </PanelFrame>
  )
}

function Tile({ ind, onOpen }: { ind: EcoIndicator; onOpen: () => void }) {
  const dir = fmt.direction(ind.change)
  return (
    <button className="eco-tile" onClick={onOpen} title={ind.description}>
      <span className="eco-label">{ind.label}</span>
      <span className="eco-value num">{ecoValue(ind.latest, ind.unit)}</span>
      <span className="eco-meta">
        <span className={dir === 'flat' ? 'muted' : dir}>{ecoChange(ind.change, ind.unit)}</span>
        <span className="muted">{periodLabel(ind.latestDate, ind.frequency)}</span>
      </span>
      <Sparkline values={ind.sparkline.map((p) => p.value)} width={180} height={34} color="var(--accent)" />
    </button>
  )
}

function Detail({ ind, range, onRange, onBack }: {
  ind: EcoIndicator
  range: EcoRange
  onRange: (r: EcoRange) => void
  onBack: () => void
}) {
  const series = useApi(`eco:${ind.id}:${range}`, (s) => api.ecoSeries(ind.id, range, s))
  const format = useCallback((v: number) => ecoValue(v, ind.unit), [ind.unit])

  return (
    <div className="eco-detail">
      <div className="toolbar" role="toolbar" aria-label="Indicator controls">
        <button className="chip" onClick={onBack}>
          ← All indicators
        </button>
        <span className="sep" />
        {ECO_RANGES.map((r) => (
          <button key={r} className={`chip mono${r === range ? ' on' : ''}`} aria-pressed={r === range} onClick={() => onRange(r)}>
            {r}
          </button>
        ))}
      </div>
      <div className="eco-head">
        <div>
          <h3>{ind.label}</h3>
          <p className="muted">{ind.description}</p>
        </div>
        <div className="eco-now">
          <span className="eco-value num">{ecoValue(ind.latest, ind.unit)}</span>
          <span className="muted">
            {periodLabel(ind.latestDate, ind.frequency)} · {ind.frequency} · FRED {ind.seriesId}
          </span>
        </div>
      </div>
      <div className="eco-chart">
        {series.error && <LoadError error={series.error} what={ind.label} onRetry={series.reload} />}
        {series.data && <LineChart points={series.data.points} format={format} />}
      </div>
    </div>
  )
}

function TilesSkeleton() {
  return (
    <div className="eco-grid" aria-hidden="true">
      {Array.from({ length: 9 }, (_, i) => (
        <div key={i} className="skeleton" style={{ height: 112 }} />
      ))}
    </div>
  )
}
