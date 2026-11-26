import { api } from '../api/client'
import type { FxBoard } from '../api/types'
import { LoadError, PanelFrame } from '../components/PanelFrame'
import { useApi } from '../hooks/useApi'
import * as fmt from '../lib/format'
import type { OpenCommand, PanelProps } from './types'

/** Yen and yuan rates are large numbers, so fewer decimals; everything else gets four. */
const rate = (v: number | null | undefined) => (fmt.isNum(v) ? v.toFixed(Math.abs(v) >= 20 ? 2 : 4) : '—')

export function FxPanel({ onOpen, ...frame }: PanelProps & { onOpen: OpenCommand }) {
  const fx = useApi('fx', (s) => api.fx(s), 60_000)

  return (
    <PanelFrame fn="FX" title={<span>Currencies</span>} {...frame}>
      {fx.loading && <div className="skeleton" style={{ height: 240, margin: 16 }} aria-hidden="true" />}
      {fx.error && <LoadError error={fx.error} what="currency rates" />}
      {fx.data && <Board data={fx.data} onOpen={onOpen} />}
    </PanelFrame>
  )
}

function Board({ data, onOpen }: { data: FxBoard; onOpen: OpenCommand }) {
  const ecb = data.pairs.some((p) => p.source === 'ECB')
  return (
    <div className="fx">
      <h3 className="section-title">Major pairs</h3>
      <table className="fx-pairs num">
        <thead>
          <tr>
            <th scope="col">Pair</th>
            <th scope="col">Rate</th>
            <th scope="col">Chg</th>
            <th scope="col">Chg %</th>
            <th scope="col">Source</th>
          </tr>
        </thead>
        <tbody>
          {data.pairs.map((p) => {
            const dir = fmt.direction(p.change)
            return (
              <tr key={p.pair} onClick={(e) => onOpen(`${p.symbol} GP`, e.shiftKey)} title={`Chart ${p.pair} (${p.symbol})`}>
                <th scope="row" className="mono">
                  {p.pair}
                </th>
                <td>{rate(p.rate)}</td>
                <td className={dir}>{fmt.isNum(p.change) ? fmt.signed(p.change, Math.abs(p.rate ?? 0) >= 20 ? 2 : 4) : '—'}</td>
                <td className={dir}>{fmt.signedPct(p.changePercent)}</td>
                <td>
                  <span className={`badge${p.source === 'ECB' ? ' ecb' : ''}`}>{p.source}</span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <h3 className="section-title">Cross rates</h3>
      <div className="fx-matrix-wrap">
        <table className="fx-matrix num" aria-label="Cross rates: one unit of the row currency in the column currency">
          <thead>
            <tr>
              <th scope="col" className="corner" title="1 unit of the row currency buys this much of the column currency">
                1 ↓ =
              </th>
              {data.currencies.map((c) => (
                <th scope="col" key={c} className="mono">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.currencies.map((from, i) => (
              <tr key={from}>
                <th scope="row" className="mono">
                  {from}
                </th>
                {data.matrix[i].map((v, j) => (
                  <td key={data.currencies[j]} className={i === j ? 'self' : undefined}>
                    {i === j ? '—' : rate(v)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="fa-source">
        Source: Yahoo Finance{ecb && ', with ECB daily reference rates where Yahoo had none'} · click a pair to chart it
      </p>
    </div>
  )
}
