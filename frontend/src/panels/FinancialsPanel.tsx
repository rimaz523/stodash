import { useState } from 'react'
import { api } from '../api/client'
import { PERIODS, type FinancialStatements, type Period, type RowUnit, type StatementRow } from '../api/types'
import { LoadError, PanelFrame } from '../components/PanelFrame'
import { QuoteHeader } from '../components/QuoteHeader'
import { staleOf, useApi } from '../hooks/useApi'
import * as fmt from '../lib/format'
import { calendarDate } from '../lib/time'
import { FunctionSwitch, PanelTitle } from './FunctionSwitch'
import { STATEMENTS, type Statement, type SymbolPanelProps } from './types'

const STATEMENT_LABELS: Record<Statement, string> = {
  income: 'Income',
  balance: 'Balance sheet',
  cashFlow: 'Cash flow',
  ratios: 'Ratios',
}

interface Props extends SymbolPanelProps {
  period: Period
  statement: Statement
  onChange: (patch: { period?: Period; statement?: Statement }) => void
}

export function FinancialsPanel({ symbol, period, statement, onChange, onSwitch, ...frame }: Props) {
  const quote = useApi(`quote:${symbol}`, (s) => api.quote(symbol, s), 30_000)
  const fin = useApi(`financials:${symbol}:${period}`, (s) => api.financials(symbol, period, s))
  const [expanded, setExpanded] = useState(false)

  const rows = fin.data?.[statement] ?? []
  const coreCount = rows.filter((r) => r.core).length
  const hidden = rows.length - coreCount
  // If a company reports none of the key rows for this statement, show everything rather than nothing.
  const shown = expanded || coreCount === 0 ? rows : rows.filter((r) => r.core)
  const fatal = quote.error && fin.error ? fin.error : undefined

  return (
    <PanelFrame
      fn="FA"
      stale={staleOf(quote, fin)}
      title={<PanelTitle symbol={symbol} name={quote.data?.name} />}
      actions={<FunctionSwitch current="FA" onSwitch={onSwitch} />}
      {...frame}
    >
      {fatal ? (
        <LoadError error={fatal} what={symbol} onRetry={() => { quote.reload(); fin.reload() }} />
      ) : (
        <div className="fa">
          <QuoteHeader quote={quote.data} loading={quote.loading} />
          <div className="toolbar" role="toolbar" aria-label="Statement controls">
            {STATEMENTS.map((s) => (
              <button
                key={s}
                className={`chip${s === statement ? ' on' : ''}`}
                onClick={() => onChange({ statement: s })}
                aria-pressed={s === statement}
              >
                {STATEMENT_LABELS[s]}
              </button>
            ))}
            <span className="sep" />
            {PERIODS.map((p) => (
              <button
                key={p}
                className={`chip${p === period ? ' on' : ''}`}
                onClick={() => onChange({ period: p })}
                aria-pressed={p === period}
              >
                {p === 'annual' ? 'Annual' : 'Quarterly'}
              </button>
            ))}
            {hidden > 0 && coreCount > 0 && (
              <>
                <span className="sep" />
                <button
                  className={`chip${expanded ? ' on' : ''}`}
                  onClick={() => setExpanded((e) => !e)}
                  aria-pressed={expanded}
                  title={expanded ? 'Show only the key rows' : `Show all ${rows.length} rows`}
                >
                  {expanded ? 'Key rows' : `All rows (${rows.length})`}
                </button>
              </>
            )}
          </div>

          {fin.loading && <TableSkeleton />}
          {fin.error && <LoadError error={fin.error} what="financial statements" onRetry={fin.reload} />}
          {fin.data && <Statements data={fin.data} rows={shown} />}
        </div>
      )}
    </PanelFrame>
  )
}

function Statements({ data, rows }: { data: FinancialStatements; rows: StatementRow[] }) {
  if (data.periods.length === 0)
    return (
      <div className="state">
        <strong>No financial statements</strong>
        <span>{data.note ?? 'Nothing was reported for this period.'}</span>
      </div>
    )
  if (rows.length === 0)
    return (
      <div className="state">
        <span>This company doesn't report these lines.</span>
      </div>
    )

  const annual = data.period === 'annual'
  return (
    <>
      <div className="fa-table-wrap">
        <table className="fa-table num">
          <thead>
            <tr>
              <th scope="col" className="label">
                {data.currency ? `${data.currency}` : ''}
              </th>
              {data.periods.map((d) => (
                <th scope="col" key={d}>
                  <span>{annual ? `FY${d.slice(0, 4)}` : calendarDate(d, { month: 'short', year: 'numeric' })}</span>
                  <small>{calendarDate(d)}</small>
                </th>
              ))}
              <th scope="col" className="chg" title="Newest period against the one before it">
                <span>Change</span>
                <small>{annual ? 'YoY' : 'QoQ'}</small>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={r.total ? 'total' : undefined}>
                <th scope="row" className="label">
                  {r.label}
                </th>
                {r.values.map((v, i) => (
                  <td key={data.periods[i]} className={fmt.isNum(v) && v < 0 && r.unit !== 'fraction' ? 'neg' : undefined}>
                    {cell(v, r.unit)}
                  </td>
                ))}
                <td className="chg">{change(r)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="fa-source">
        Source: {data.source}
        {data.currency && ` · figures in ${data.currency}`}
        {' · fiscal periods ending on the dates shown'}
      </p>
    </>
  )
}

function cell(v: number | null, unit: RowUnit): string {
  switch (unit) {
    case 'fraction':
      return fmt.pct(v, 1)
    case 'multiple':
      return fmt.multiple(v)
    case 'perShare':
      return fmt.price(v, 2)
    default:
      return fmt.big(v)
  }
}

/** Newest value against the previous one: % for amounts, percentage points for margins, a difference for ratios. */
function change(r: StatementRow): string {
  const [a, b] = r.values
  if (!fmt.isNum(a) || !fmt.isNum(b)) return '—'
  if (r.unit === 'fraction') {
    const pts = (a - b) * 100
    return `${pts > 0 ? '+' : pts < 0 ? '−' : ''}${Math.abs(pts).toFixed(1)} pts`
  }
  if (r.unit === 'multiple') return fmt.signed(a - b, 2)
  if (b === 0) return '—'
  return fmt.signedPct(((a - b) / Math.abs(b)) * 100)
}

function TableSkeleton() {
  return (
    <div style={{ display: 'grid', gap: 10, padding: '8px 16px' }} aria-hidden="true">
      {Array.from({ length: 10 }, (_, i) => (
        <div key={i} className="skeleton" style={{ height: 16, width: `${96 - (i % 4) * 6}%` }} />
      ))}
    </div>
  )
}
