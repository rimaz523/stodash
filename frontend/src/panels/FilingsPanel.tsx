import { useState } from 'react'
import { api } from '../api/client'
import { FILING_CATEGORIES, type FilingCategory } from '../api/types'
import { LoadError, PanelFrame } from '../components/PanelFrame'
import { QuoteHeader } from '../components/QuoteHeader'
import { staleOf, useApi } from '../hooks/useApi'
import { calendarDate } from '../lib/time'
import { FunctionSwitch, PanelTitle } from './FunctionSwitch'
import type { FilingFilter, SymbolPanelProps } from './types'

const PAGE = 100

const CATEGORY_LABELS: Record<FilingCategory, [label: string, hint: string]> = {
  annual: ['Annual', '10-K (20-F or 40-F for foreign issuers)'],
  quarterly: ['Quarterly', '10-Q'],
  current: ['8-K', 'Current reports on material events (6-K for foreign issuers)'],
  proxy: ['Proxy', 'DEF 14A and other proxy materials'],
  insider: ['Insider', 'Forms 3, 4, 5 and 144'],
  other: ['Other', 'Registrations, ownership reports, prospectuses, letters'],
}

interface Props extends SymbolPanelProps {
  filter: FilingFilter
  onFilterChange: (filter: FilingFilter) => void
}

export function FilingsPanel({ symbol, filter, onFilterChange, onSwitch, ...frame }: Props) {
  const quote = useApi(`quote:${symbol}`, (s) => api.quote(symbol, s), 30_000)
  const filings = useApi(`filings:${symbol}`, (s) => api.filings(symbol, s))
  const [limit, setLimit] = useState(PAGE)
  const fatal = quote.error && filings.error ? filings.error : undefined

  const all = filings.data?.items ?? []
  const counts = new Map<FilingCategory, number>()
  for (const f of all) counts.set(f.category, (counts.get(f.category) ?? 0) + 1)
  const matching = filter === 'all' ? all : all.filter((f) => f.category === filter)
  const shown = matching.slice(0, limit)

  const pick = (f: FilingFilter) => {
    onFilterChange(f)
    setLimit(PAGE)
  }

  return (
    <PanelFrame
      fn="CF"
      stale={staleOf(quote, filings)}
      title={<PanelTitle symbol={symbol} name={quote.data?.name ?? filings.data?.company} />}
      actions={<FunctionSwitch current="CF" onSwitch={onSwitch} />}
      {...frame}
    >
      {fatal ? (
        <LoadError error={fatal} what={symbol} onRetry={() => { quote.reload(); filings.reload() }} />
      ) : (
        <div className="cf">
          <QuoteHeader quote={quote.data} loading={quote.loading} />
          {all.length > 0 && (
            <div className="toolbar" role="toolbar" aria-label="Filter filings">
              <button className={`chip${filter === 'all' ? ' on' : ''}`} onClick={() => pick('all')} aria-pressed={filter === 'all'}>
                All <span className="count">{all.length}</span>
              </button>
              {FILING_CATEGORIES.filter((c) => counts.has(c)).map((c) => (
                <button
                  key={c}
                  className={`chip${filter === c ? ' on' : ''}`}
                  onClick={() => pick(c)}
                  aria-pressed={filter === c}
                  title={CATEGORY_LABELS[c][1]}
                >
                  {CATEGORY_LABELS[c][0]} <span className="count">{counts.get(c)}</span>
                </button>
              ))}
            </div>
          )}

          {filings.loading && <RowsSkeleton />}
          {filings.error && <LoadError error={filings.error} what="SEC filings" onRetry={filings.reload} />}
          {filings.data?.note && (
            <div className="state">
              <strong>No SEC filings</strong>
              <span>{filings.data.note.replace(/^No SEC filings\.\s*/, '')}</span>
            </div>
          )}
          {filings.data && !filings.data.note && matching.length === 0 && (
            <div className="state">
              <span>No filings in this category.</span>
            </div>
          )}

          {shown.length > 0 && (
            <>
              <table className="cf-table">
                <thead>
                  <tr>
                    <th scope="col">Filed</th>
                    <th scope="col">Form</th>
                    <th scope="col">Description</th>
                    <th scope="col" className="period">Period</th>
                    <th scope="col">
                      <span className="sr-only">Links</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((f) => (
                    <tr key={f.accessionNumber + f.url}>
                      <td className="num nowrap">{calendarDate(f.filingDate)}</td>
                      <td>
                        <span className={`badge mono form ${f.category}`}>{f.form}</span>
                      </td>
                      <td>
                        <a href={f.url} target="_blank" rel="noopener noreferrer">
                          {f.description}
                        </a>
                      </td>
                      <td className="num nowrap muted period">{f.reportDate ? calendarDate(f.reportDate) : ''}</td>
                      <td className="nowrap">
                        <a
                          className="muted"
                          href={f.indexUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Filing index: every document and exhibit"
                        >
                          index ↗
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="cf-foot">
                <span>
                  Showing {shown.length} of {matching.length}
                  {filings.data?.cik && (
                    <>
                      {' · '}
                      <a
                        href={`https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${filings.data.cik}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        All filings on EDGAR ↗
                      </a>
                    </>
                  )}
                </span>
                {shown.length < matching.length && (
                  <button className="link-btn" onClick={() => setLimit((l) => l + PAGE)}>
                    Show {Math.min(PAGE, matching.length - shown.length)} more
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </PanelFrame>
  )
}

function RowsSkeleton() {
  return (
    <div style={{ display: 'grid', gap: 10, padding: '8px 16px' }} aria-hidden="true">
      {Array.from({ length: 10 }, (_, i) => (
        <div key={i} className="skeleton" style={{ height: 16, width: `${94 - (i % 3) * 8}%` }} />
      ))}
    </div>
  )
}
