import { useId, type ReactNode } from 'react'
import { timeAgo } from '../lib/time'

/** A panel's data is out of date because its last refresh failed. From `staleOf(...)` in useApi. */
export interface StaleInfo {
  since: number | undefined
  error: Error | undefined
  retry: () => void
}

interface Props {
  fn: string
  title: ReactNode
  active: boolean
  onActivate: () => void
  onClose: () => void
  maximized?: boolean
  onToggleMaximize?: () => void
  /** Shows a "stale" badge in the header that retries when clicked. */
  stale?: StaleInfo
  actions?: ReactNode
  children: ReactNode
}

export function PanelFrame({ fn, title, active, onActivate, onClose, maximized, onToggleMaximize, stale, actions, children }: Props) {
  const titleId = useId()
  const zoomLabel = maximized ? 'Restore panel (Alt M)' : 'Maximize panel (Alt M)'
  return (
    <section
      className={`panel${active ? ' active' : ''}${maximized ? ' maximized' : ''}`}
      aria-labelledby={titleId}
      onMouseDown={onActivate}
      onFocusCapture={onActivate}
    >
      <header className="panel-head" onDoubleClick={(e) => e.target === e.currentTarget && onToggleMaximize?.()}>
        <span className="fn" aria-hidden="true">{fn}</span>
        <div className="title" id={titleId}>
          <span className="sr-only">{fn}: </span>
          {title}
        </div>
        <div className="panel-actions">
          {stale && <StaleBadge stale={stale} />}
          {actions}
          {onToggleMaximize && (
            <button className="icon-btn" onClick={onToggleMaximize} title={zoomLabel} aria-label={zoomLabel} aria-pressed={maximized}>
              <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                {maximized ? (
                  <path d="M5 2v3H2M9 2v3h3M5 12V9H2M9 12V9h3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                ) : (
                  <path d="M2 5V2h3M12 5V2H9M2 9v3h3M12 9v3H9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                )}
              </svg>
            </button>
          )}
          <button className="icon-btn" onClick={onClose} title="Close panel (Alt X)" aria-label="Close panel">
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
              <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </header>
      {/* Focusable so a panel whose content scrolls can be scrolled from the keyboard (WCAG 2.1.1). */}
      <div className="panel-body" tabIndex={0} aria-labelledby={titleId} role="group">
        {children}
      </div>
    </section>
  )
}

function StaleBadge({ stale }: { stale: StaleInfo }) {
  const age = stale.since ? timeAgo(new Date(stale.since).toISOString()) : null
  const why = stale.error?.message ?? 'The last refresh failed.'
  return (
    <button
      className="chip stale"
      onClick={stale.retry}
      title={`${why} Showing data from ${age ?? 'earlier'}. Click to retry.`}
      aria-label={`Data may be out of date${age ? ` (updated ${age})` : ''}. Retry`}
    >
      <span className="stale-dot" aria-hidden="true" />
      {age ? `Updated ${age}` : 'Stale'}
    </button>
  )
}

export function LoadError({ error, what, onRetry }: { error: Error; what: string; onRetry?: () => void }) {
  return (
    <div className="state error" role="alert">
      <strong>Couldn't load {what}</strong>
      <span>{error.message}</span>
      {onRetry && (
        <button className="chip retry" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  )
}
