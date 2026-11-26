import { useState } from 'react'
import { api } from '../api/client'
import type { CompanyProfile, Quote } from '../api/types'
import { LoadError, PanelFrame } from '../components/PanelFrame'
import { QuoteHeader } from '../components/QuoteHeader'
import { RangeBar } from '../components/RangeBar'
import { useApi } from '../hooks/useApi'
import * as fmt from '../lib/format'
import { FunctionSwitch, PanelTitle } from './FunctionSwitch'
import type { SymbolPanelProps } from './types'

export function DescriptionPanel({ symbol, onSwitch, ...frame }: SymbolPanelProps) {
  const quote = useApi(`quote:${symbol}`, (s) => api.quote(symbol, s), 30_000)
  const profile = useApi(`profile:${symbol}`, (s) => api.profile(symbol, s))
  const name = quote.data?.name ?? profile.data?.name

  // An unknown ticker fails both calls; show one clear message instead of two.
  const fatal = quote.error && profile.error ? quote.error : undefined

  return (
    <PanelFrame
      fn="DES"
      title={<PanelTitle symbol={symbol} name={name} />}
      actions={<FunctionSwitch current="DES" onSwitch={onSwitch} />}
      {...frame}
    >
      {fatal ? (
        <LoadError error={fatal} what={symbol} />
      ) : (
        <>
          <QuoteHeader quote={quote.data} loading={quote.loading} />
          <div className="des">
            <div>
              <Trading quote={quote.data} profile={profile.data} />
              {profile.loading && <SkeletonRows rows={8} />}
              {profile.data && <Stats profile={profile.data} quote={quote.data} />}
            </div>
            <div>
              {profile.loading && <SkeletonRows rows={6} />}
              {profile.error && <LoadError error={profile.error} what="the company profile" />}
              {profile.data && <Profile profile={profile.data} />}
            </div>
          </div>
        </>
      )}
    </PanelFrame>
  )
}

function Trading({ quote, profile }: { quote?: Quote; profile?: CompanyProfile }) {
  const stats = profile?.stats
  const hasDay = fmt.isNum(quote?.dayLow) && fmt.isNum(quote?.dayHigh)
  const has52 = fmt.isNum(stats?.fiftyTwoWeekLow) && fmt.isNum(stats?.fiftyTwoWeekHigh)
  if (!hasDay && !has52) return null

  return (
    <>
      <h3 className="section-title">Trading range</h3>
      <div className="ranges">
        <RangeBar label="Day" low={quote?.dayLow} high={quote?.dayHigh} value={quote?.price} />
        <RangeBar label="52 week" low={stats?.fiftyTwoWeekLow} high={stats?.fiftyTwoWeekHigh} value={quote?.price} />
      </div>
    </>
  )
}

function Stats({ profile, quote }: { profile: CompanyProfile; quote?: Quote }) {
  const s = profile.stats
  const rows: [string, string][] = [
    ['Market cap', fmt.big(s.marketCap ?? quote?.marketCap)],
    ['Enterprise value', fmt.big(s.enterpriseValue)],
    ['P/E (TTM)', fmt.ratio(s.trailingPE)],
    ['Forward P/E', fmt.ratio(s.forwardPE)],
    ['EPS (TTM)', fmt.price(s.trailingEps)],
    ['Forward EPS', fmt.price(s.forwardEps)],
    ['PEG ratio', fmt.ratio(s.pegRatio)],
    ['Price / book', fmt.ratio(s.priceToBook)],
    ['Dividend yield', fmt.pct(s.dividendYield)],
    ['Beta', fmt.ratio(s.beta)],
    ['Open', fmt.price(quote?.open)],
    ['Prev close', fmt.price(quote?.previousClose)],
    ['Volume', fmt.big(quote?.volume)],
    ['Avg volume', fmt.big(s.averageVolume)],
    ['50-day avg', fmt.price(s.fiftyDayAverage)],
    ['200-day avg', fmt.price(s.twoHundredDayAverage)],
    ['Shares out', fmt.big(s.sharesOutstanding)],
    ['Revenue (TTM)', fmt.big(s.totalRevenue)],
    ['Revenue growth', fmt.pct(s.revenueGrowth)],
    ['Gross margin', fmt.pct(s.grossMargin)],
    ['Operating margin', fmt.pct(s.operatingMargin)],
    ['Profit margin', fmt.pct(s.profitMargin)],
    ['Return on equity', fmt.pct(s.returnOnEquity)],
    ['Total cash', fmt.big(s.totalCash)],
    ['Total debt', fmt.big(s.totalDebt)],
    ['Analyst target', fmt.price(s.targetMeanPrice)],
  ]
  // Indexes, FX and crypto have few of these; only show what exists.
  const shown = rows.filter(([, v]) => v !== '—')
  if (shown.length === 0) return null

  return (
    <>
      <h3 className="section-title">
        Key statistics
        {s.recommendation && s.recommendation !== 'none' && (
          <span className="badge rec" style={{ marginLeft: 8 }}>
            Analysts: {fmt.titleCase(s.recommendation)}
          </span>
        )}
      </h3>
      <dl className="stats">
        {shown.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </>
  )
}

function Profile({ profile }: { profile: CompanyProfile }) {
  const [expanded, setExpanded] = useState(false)
  const hq = [profile.city, profile.state, profile.country].filter(Boolean).join(', ')
  const facts: [string, string | null][] = [
    ['Type', profile.quoteType ? fmt.titleCase(profile.quoteType.toLowerCase()) : null],
    ['Exchange', profile.exchange],
    ['Sector', profile.sector],
    ['Industry', profile.industry],
    ['HQ', hq || null],
    ['Employees', profile.employees ? fmt.int(profile.employees) : null],
  ]
  const website = profile.website?.startsWith('http') ? profile.website : null
  const longSummary = (profile.summary?.length ?? 0) > 420

  return (
    <>
      <h3 className="section-title">Profile</h3>
      <div className="facts">
        {facts
          .filter((f): f is [string, string] => !!f[1])
          .map(([label, value]) => (
            <span className="fact" key={label}>
              {label} <b>{value}</b>
            </span>
          ))}
        {website && (
          <a className="fact" href={website} target="_blank" rel="noreferrer noopener">
            {new URL(website).hostname.replace(/^www\./, '')} ↗
          </a>
        )}
      </div>

      {profile.summary && (
        <>
          <h3 className="section-title">Business</h3>
          <p className={`summary${longSummary && !expanded ? ' clamped' : ''}`}>{profile.summary}</p>
          {longSummary && (
            <button className="link-btn" onClick={() => setExpanded((e) => !e)}>
              {expanded ? 'Show less' : 'Read more'}
            </button>
          )}
        </>
      )}

      {profile.officers.length > 0 && (
        <>
          <h3 className="section-title">Management</h3>
          <ul className="officers">
            {profile.officers.map((o) => (
              <li key={o.name + o.title}>
                <span>{o.name}</span>
                <span>{o.title}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  )
}

function SkeletonRows({ rows }: { rows: number }) {
  return (
    <div style={{ display: 'grid', gap: 10, marginTop: 16 }} aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton" style={{ height: 16, width: `${92 - (i % 3) * 14}%` }} />
      ))}
    </div>
  )
}
