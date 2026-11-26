import type { ReactNode } from 'react'

interface Props {
  fn: string
  title: ReactNode
  active: boolean
  onActivate: () => void
  onClose: () => void
  maximized?: boolean
  onToggleMaximize?: () => void
  actions?: ReactNode
  children: ReactNode
}

export function PanelFrame({ fn, title, active, onActivate, onClose, maximized, onToggleMaximize, actions, children }: Props) {
  const zoomLabel = maximized ? 'Restore panel (Alt M)' : 'Maximize panel (Alt M)'
  return (
    <section
      className={`panel${active ? ' active' : ''}${maximized ? ' maximized' : ''}`}
      onMouseDown={onActivate}
      onFocusCapture={onActivate}
    >
      <header className="panel-head" onDoubleClick={(e) => e.target === e.currentTarget && onToggleMaximize?.()}>
        <span className="fn">{fn}</span>
        <div className="title">{title}</div>
        <div className="panel-actions">
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
      <div className="panel-body">{children}</div>
    </section>
  )
}

export function LoadError({ error, what }: { error: Error; what: string }) {
  return (
    <div className="state error" role="alert">
      <strong>Couldn't load {what}</strong>
      <span>{error.message}</span>
    </div>
  )
}
