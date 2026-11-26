import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { ProviderStatus } from '../api/types'
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
      Stodash <small>phase 2</small>
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
  const providers = health.data?.providers

  return (
    <footer className="statusbar">
      <span className="status-dot">
        <span className={`dot${online ? ' live' : ''}`} style={online ? undefined : { background: 'var(--down)' }} />
        {health.loading ? 'Connecting…' : online ? 'API connected' : 'API offline: start the backend on :5080'}
      </span>
      {providers && (
        <span className="providers" aria-label="Data providers">
          Data:
          <Provider name="Yahoo" status={providers.yahoo} />
          <Provider name="SEC" status={providers.sec} />
          <Provider name="Finnhub" status={providers.finnhub} />
          <span>· delayed ~15 min</span>
        </span>
      )}
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

const STATE_TEXT: Record<ProviderStatus['state'], string> = {
  up: 'working',
  down: 'failing',
  unknown: 'not used yet',
  off: 'not configured',
}

function Provider({ name, status }: { name: string; status: ProviderStatus }) {
  const when = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString() : null)
  const title = [
    `${name}: ${STATE_TEXT[status.state]}`,
    status.lastOk && `last OK ${when(status.lastOk)}`,
    status.state === 'down' && status.lastError && `${status.lastError} (${when(status.lastFailure)})`,
  ]
    .filter(Boolean)
    .join(' · ')
  return (
    <span className={`provider ${status.state}`} title={title}>
      <span className="pdot" aria-hidden="true" />
      {name}
      <span className="sr-only"> {STATE_TEXT[status.state]}</span>
    </span>
  )
}
