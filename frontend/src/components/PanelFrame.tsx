import type { ReactNode } from 'react'

interface Props {
  fn: string
  title: ReactNode
  active: boolean
  onActivate: () => void
  onClose: () => void
  actions?: ReactNode
  children: ReactNode
}

export function PanelFrame({ fn, title, active, onActivate, onClose, actions, children }: Props) {
  return (
    <section className={`panel${active ? ' active' : ''}`} onMouseDown={onActivate} onFocusCapture={onActivate}>
      <header className="panel-head">
        <span className="fn">{fn}</span>
        <div className="title">{title}</div>
        <div className="panel-actions">
          {actions}
          <button className="icon-btn" onClick={onClose} title="Close panel" aria-label="Close panel">
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
