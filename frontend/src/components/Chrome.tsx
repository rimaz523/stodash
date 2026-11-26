import { useEffect, useState } from 'react'
import { api } from '../api/client'
import { PROVIDERS, type Health, type ProviderName, type ProviderStatus } from '../api/types'
import { clock } from '../lib/time'
import { useApi } from '../hooks/useApi'

const CLOCKS: [label: string, tz: string][] = [
  ['NEW YORK', 'America/New_York'],
  ['LONDON', 'Europe/London'],
  ['TOKYO', 'Asia/Tokyo'],
]

export function Brand() {
  return (
    <div className="brand">
      <svg className="brand-mark" viewBox="0 0 32 32" aria-hidden="true">
        <rect width="32" height="32" rx="7" fill="#131923" stroke="#2a3444" />
        <path d="M6 22l6-7 5 4 9-10" fill="none" stroke="#5b8cff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      Stodash <small>phase 3</small>
    </div>
  )
}

export function Clocks() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(t)
  }, [])

  return (
    <div className="clocks" aria-label="World clocks">
      {CLOCKS.map(([label, tz]) => (
        <div className="clock" key={tz}>
          <span>{label}</span>
          <span>{clock(tz, now)}</span>
        </div>
      ))}
    </div>
  )
}

export function StatusBar({ panelCount }: { panelCount: number }) {
  const health = useApi('health', (signal) => api.health(signal), 30_000)
  const online = !!health.data && !health.error

  return (
    <footer className="statusbar">
      <span className="status-dot">
        <span className={`dot${online ? ' live' : ''}`} style={online ? undefined : { background: 'var(--down)' }} />
        {health.loading ? 'Connecting…' : online ? 'API connected' : 'API offline: start the backend on :5080'}
      </span>
      {health.data && <Providers health={health.data} />}
      <span>{panelCount}/4 panels</span>
      <span className="right">
        <span><span className="kbd">/</span>command</span>
        <span><span className="kbd">Enter</span>active panel</span>
        <span><span className="kbd">Shift Enter</span>new panel</span>
        <span><span className="kbd">Alt 1–4</span>switch panel</span>
      </span>
    </footer>
  )
}

const NAMES: Record<ProviderName, string> = {
  yahoo: 'Yahoo',
  sec: 'SEC',
  finnhub: 'Finnhub',
  fred: 'FRED',
  treasury: 'Treasury',
  coingecko: 'CoinGecko',
  frankfurter: 'ECB',
  database: 'Database',
}

const STATE_TEXT: Record<ProviderStatus['state'], string> = {
  up: 'working',
  down: 'failing',
  unknown: 'not used yet',
  off: 'not configured',
}

/**
 * "Data: ● 7/8 ok" with every provider's state on hover. Failing providers are also named in red, and a live
 * indicator shows when watchlist prices are streaming.
 */
function Providers({ health }: { health: Health }) {
  const when = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString() : null)
  const entries = PROVIDERS.map((name) => [name, health.providers[name]] as const).filter(([, s]) => !!s)
  const configured = entries.filter(([, s]) => s.state !== 'off')
  const failing = entries.filter(([, s]) => s.state === 'down')
  const ok = configured.length - failing.length
  const detail = entries
    .map(([name, s]) =>
      [
        `${NAMES[name]}: ${STATE_TEXT[s.state]}`,
        s.lastOk && `last OK ${when(s.lastOk)}`,
        s.state === 'down' && s.lastError && `${s.lastError} (${when(s.lastFailure)})`,
      ]
        .filter(Boolean)
        .join(' · '),
    )
    .join('\n')

  return (
    <span className="providers" aria-label="Data providers">
      <span className={`provider-summary${failing.length ? ' down' : ''}`} title={detail}>
        Data: <span className="pdot" aria-hidden="true" /> {ok}/{configured.length} ok
      </span>
      {failing.map(([name, s]) => (
        <span key={name} className="provider down" title={s.lastError ?? undefined}>
          {NAMES[name]} failing
        </span>
      ))}
      {health.stream.state === 'live' && (
        <span className="provider live" title="Watchlist prices stream live through Finnhub">
          <span className="live-dot" aria-hidden="true" /> Live
        </span>
      )}
      <span>· delayed ~15 min</span>
    </span>
  )
}
