import { useEffect, useState } from 'react'
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
      Stodash <small>phase 1</small>
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

interface Health {
  status: string
  providers: { yahoo: boolean; finnhub: boolean }
}

export function StatusBar({ panelCount }: { panelCount: number }) {
  const health = useApi<Health>(
    'health',
    async (signal) => {
      const res = await fetch('/api/health', { signal })
      if (!res.ok) throw new Error('offline')
      return res.json()
    },
    30_000,
  )
  const online = !!health.data && !health.error

  return (
    <footer className="statusbar">
      <span className="status-dot">
        <span className={`dot${online ? ' live' : ''}`} style={online ? undefined : { background: 'var(--down)' }} />
        {health.loading ? 'Connecting…' : online ? 'API connected' : 'API offline: start the backend on :5080'}
      </span>
      <span>
        Data: Yahoo Finance{health.data?.providers.finnhub ? ' + Finnhub fallback' : ''} · delayed ~15 min
      </span>
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
