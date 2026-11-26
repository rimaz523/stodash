import { useState } from 'react'
import { api } from '../api/client'
import type { YieldCurve } from '../api/types'
import { LoadError, PanelFrame } from '../components/PanelFrame'
import { useApi } from '../hooks/useApi'
import * as fmt from '../lib/format'
import { calendarDate } from '../lib/time'
import type { PanelProps } from './types'

const COLORS = ['var(--accent)', 'var(--warn)', '#b78cff']

/** "+12 bp", "−3 bp" */
const bp = (v: number | null | undefined) =>
  fmt.isNum(v) ? `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(Math.round(v))} bp` : '—'

export function YieldCurvePanel(frame: PanelProps) {
  const yc = useApi('yieldcurve', (s) => api.yieldCurve(s), 3_600_000)

  return (
    <PanelFrame fn="YC" title={<span>US Treasury yield curve</span>} {...frame}>
      {yc.loading && <div className="skeleton" style={{ height: 260, margin: 16 }} aria-hidden="true" />}
      {yc.error && <LoadError error={yc.error} what="the yield curve" />}
      {yc.data && <Curve data={yc.data} />}
    </PanelFrame>
  )
}

function Curve({ data }: { data: YieldCurve }) {
  const latest = data.curves[0]
  const delta = (i: number, against: number) => {
    const a = latest?.yields[i]
    const b = data.curves[against]?.yields[i]
    return fmt.isNum(a) && fmt.isNum(b) ? (a - b) * 100 : null
  }

  return (
    <div className="yc">
      <div className="yc-spreads">
        {data.spreads.map((s) => (
          <span key={s.label} className={`badge${fmt.isNum(s.bp) && s.bp < 0 ? ' inverted' : ''}`}>
            {s.label} {bp(s.bp)}
            {fmt.isNum(s.bp) && s.bp < 0 && ' · inverted'}
          </span>
        ))}
        <span className="muted">As of {latest ? calendarDate(latest.date) : '—'}</span>
      </div>
      <CurveChart data={data} />
      <div className="yc-table-wrap">
        <table className="yc-table num">
          <thead>
            <tr>
              <th scope="col">Maturity</th>
              {data.curves.map((c) => (
                <th scope="col" key={c.label}>
                  <span>{c.label}</span>
                  <small>{calendarDate(c.date)}</small>
                </th>
              ))}
              {data.curves[1] && <th scope="col">vs 1M</th>}
              {data.curves[2] && <th scope="col">vs 1Y</th>}
            </tr>
          </thead>
          <tbody>
            {data.maturities.map((m, i) => (
              <tr key={m.label}>
                <th scope="row" className="mono">
                  {m.label}
                </th>
                {data.curves.map((c) => (
                  <td key={c.label}>{fmt.isNum(c.yields[i]) ? `${c.yields[i]!.toFixed(2)}%` : '—'}</td>
                ))}
                {data.curves[1] && <td className={fmt.direction(delta(i, 1))}>{bp(delta(i, 1))}</td>}
                {data.curves[2] && <td className={fmt.direction(delta(i, 2))}>{bp(delta(i, 2))}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="fa-source">Source: {data.source}</p>
    </div>
  )
}

/** Maturities on a log scale (so 1M–2Y isn't squashed), one line per date. */
function CurveChart({ data }: { data: YieldCurve }) {
  const [hover, setHover] = useState<number | null>(null)
  const W = 720
  const H = 260
  const pad = { l: 44, r: 16, t: 14, b: 28 }

  const all = data.curves.flatMap((c) => c.yields).filter(fmt.isNum)
  if (all.length === 0) return null
  const lo = Math.floor((Math.min(...all) - 0.1) * 4) / 4
  const hi = Math.ceil((Math.max(...all) + 0.1) * 4) / 4
  const logMin = Math.log(data.maturities[0].months)
  const logMax = Math.log(data.maturities.at(-1)!.months)
  const x = (months: number) => pad.l + ((Math.log(months) - logMin) / (logMax - logMin || 1)) * (W - pad.l - pad.r)
  const y = (v: number) => pad.t + ((hi - v) / (hi - lo || 1)) * (H - pad.t - pad.b)
  const ticks = Array.from({ length: Math.round((hi - lo) / 0.25) + 1 }, (_, i) => lo + i * 0.25).filter((_, i, a) =>
    a.length > 9 ? i % 2 === 0 : true,
  )
  // Label the common maturities only, so the axis stays readable.
  const labelled = new Set(['1M', '3M', '6M', '1Y', '2Y', '5Y', '10Y', '20Y', '30Y'])

  return (
    <figure className="yc-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Yield curve chart" onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} className="grid" />
            <text x={pad.l - 6} y={y(t) + 4} textAnchor="end">
              {t.toFixed(2)}%
            </text>
          </g>
        ))}
        {data.maturities.map((m, i) => (
          <g key={m.label}>
            {labelled.has(m.label) && (
              <text x={x(m.months)} y={H - 8} textAnchor="middle">
                {m.label}
              </text>
            )}
            <rect
              x={x(m.months) - 12}
              y={pad.t}
              width={24}
              height={H - pad.t - pad.b}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
            />
          </g>
        ))}
        {hover !== null && <line className="cursor" x1={x(data.maturities[hover].months)} x2={x(data.maturities[hover].months)} y1={pad.t} y2={H - pad.b} />}
        {[...data.curves].reverse().map((c) => {
          const idx = data.curves.indexOf(c)
          const pts = data.maturities
            .map((m, i) => (fmt.isNum(c.yields[i]) ? `${x(m.months).toFixed(1)},${y(c.yields[i]!).toFixed(1)}` : null))
            .filter(Boolean)
            .join(' ')
          return (
            <polyline
              key={c.label}
              points={pts}
              fill="none"
              stroke={COLORS[idx]}
              strokeWidth={idx === 0 ? 2.5 : 1.5}
              strokeDasharray={idx === 0 ? undefined : '5 4'}
            />
          )
        })}
        {data.maturities.map((m, i) =>
          fmt.isNum(data.curves[0]?.yields[i]) ? (
            <circle key={m.label} cx={x(m.months)} cy={y(data.curves[0].yields[i]!)} r={hover === i ? 4.5 : 2.5} fill={COLORS[0]} />
          ) : null,
        )}
      </svg>
      <figcaption className="yc-legend">
        {data.curves.map((c, i) => (
          <span key={c.label}>
            <span className="swatch" style={{ background: COLORS[i] }} />
            {c.label}
            {hover !== null && fmt.isNum(c.yields[hover]) && (
              <b className="num">
                {' '}
                {data.maturities[hover].label} {c.yields[hover]!.toFixed(2)}%
              </b>
            )}
          </span>
        ))}
      </figcaption>
    </figure>
  )
}
