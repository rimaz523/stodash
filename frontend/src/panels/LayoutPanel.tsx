import { useEffect, useState, type FormEvent } from 'react'
import { api } from '../api/client'
import type { Layout } from '../api/types'
import { LoadError, PanelFrame } from '../components/PanelFrame'
import { timeAgo } from '../lib/time'
import { describePanel, findLayout, isWorkspace, saveLayout, toSaved, type Workspace } from '../lib/workspace'
import type { PanelProps } from './types'

interface Props extends PanelProps {
  /** The workspace as it is now, for "save" and "update". */
  current: Workspace
  /** Replaces the workspace with a saved one. Returns an error message, or null. */
  onLoad: (layout: Layout) => string | null
  /** Bumped by App when a LAYOUT command changed the saved layouts, so the list reloads. */
  reloadKey: number
}

type Editing = { id: number; mode: 'rename' | 'delete' | 'replace' } | null

const errorText = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong.')

/** LAYOUT: save the current panels under a name, and load, update, rename or delete saved layouts. */
export function LayoutPanel({ current, onLoad, reloadKey, ...frame }: Props) {
  const [layouts, setLayouts] = useState<Layout[] | null>(null)
  const [loadError, setLoadError] = useState<Error | null>(null)
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)
  const [name, setName] = useState('')
  const [editing, setEditing] = useState<Editing>(null)
  const [newName, setNewName] = useState('')
  const [reload, setReload] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    api
      .layouts(controller.signal)
      .then((ls) => {
        setLayouts(ls)
        setLoadError(null)
      })
      .catch((e: Error) => e.name !== 'AbortError' && setLoadError(e))
    return () => controller.abort()
  }, [reload, reloadKey])

  const saveable = toSaved(current).panels.length > 0
  const run = async (action: () => Promise<string>) => {
    try {
      setMessage({ text: await action(), error: false })
      setEditing(null)
      setReload((r) => r + 1)
    } catch (e) {
      setMessage({ text: errorText(e), error: true })
    }
  }

  const save = (e: FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed || !layouts) return
    const existing = findLayout(layouts, trimmed)
    // Replacing a layout by typing its name asks first; the Update button doesn't.
    if (existing && editing?.mode !== 'replace') {
      setEditing({ id: existing.id, mode: 'replace' })
      return
    }
    void run(async () => {
      const { layout, replaced } = await saveLayout(trimmed, current)
      setName('')
      return `${replaced ? 'Updated' : 'Saved'} layout "${layout.name}".`
    })
  }

  const load = (l: Layout) => {
    const err = onLoad(l)
    if (err) setMessage({ text: err, error: true })
  }

  return (
    <PanelFrame fn="LAYOUT" title={<span>Saved layouts</span>} {...frame}>
      <div className="layouts">
        <form className="wl-add layout-save" onSubmit={save}>
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              if (editing?.mode === 'replace') setEditing(null)
            }}
            placeholder="Save current panels as…"
            aria-label="Layout name"
            maxLength={40}
          />
          <button className="chip on" type="submit" disabled={!name.trim() || !saveable || !layouts}>
            {editing?.mode === 'replace' ? 'Replace' : 'Save'}
          </button>
          {editing?.mode === 'replace' && (
            <>
              <span className="muted">A layout with that name exists. Replace it?</span>
              <button className="chip" type="button" onClick={() => setEditing(null)}>
                Cancel
              </button>
            </>
          )}
        </form>
        {!saveable && <p className="muted layout-hint">Open some panels, then save them here.</p>}
        {message && (
          <p className={`wl-message${message.error ? ' error' : ''}`} role={message.error ? 'alert' : 'status'}>
            {message.text}
          </p>
        )}

        {loadError && <LoadError error={loadError} what="saved layouts" onRetry={() => setReload((r) => r + 1)} />}
        {!layouts && !loadError && <div className="skeleton" style={{ height: 120, margin: '4px 12px' }} aria-hidden="true" />}
        {layouts?.length === 0 && (
          <div className="state">
            <strong>No saved layouts yet</strong>
            <span>
              Arrange your panels, then save them above or type <code>LAYOUT SAVE Morning</code>.
            </span>
          </div>
        )}
        {layouts && layouts.length > 0 && (
          <ul className="layout-list">
            {layouts.map((l, i) => {
              const ws = isWorkspace(l.workspace) ? l.workspace : null
              const mode = editing?.id === l.id ? editing.mode : null
              return (
                <li key={l.id} className="layout-item">
                  <div className="layout-main">
                    {mode === 'rename' ? (
                      <form
                        className="wl-name"
                        onSubmit={(e) => {
                          e.preventDefault()
                          void run(async () => `Renamed to "${(await api.updateLayout(l.id, { name: newName })).name}".`)
                        }}
                      >
                        <input value={newName} onChange={(e) => setNewName(e.target.value)} aria-label="New layout name" maxLength={40} autoFocus />
                        <button className="chip on" type="submit" disabled={!newName.trim()}>
                          Rename
                        </button>
                        <button className="chip" type="button" onClick={() => setEditing(null)}>
                          Cancel
                        </button>
                      </form>
                    ) : (
                      <button className="layout-name" onClick={() => load(l)} title={`Load "${l.name}"`} disabled={!ws}>
                        {l.name}
                      </button>
                    )}
                    <span className="layout-panels">
                      {ws ? ws.panels.map((p) => <span key={p.id} className="badge mono">{describePanel(p)}</span>) : (
                        <span className="down">This layout was saved by a newer version and can't be loaded.</span>
                      )}
                    </span>
                    <span className="muted layout-meta">
                      {i < 9 && <span className="kbd" title={`Alt Shift ${i + 1} loads this layout`}>⇧{i + 1}</span>}
                      saved {timeAgo(l.updatedAt)}
                    </span>
                  </div>
                  <div className="layout-actions">
                    {mode === 'delete' ? (
                      <>
                        <span className="muted">Delete?</span>
                        <button className="chip danger" onClick={() => void run(async () => {
                          await api.deleteLayout(l.id)
                          return `Deleted layout "${l.name}".`
                        })}>
                          Delete
                        </button>
                        <button className="chip" onClick={() => setEditing(null)}>
                          Cancel
                        </button>
                      </>
                    ) : (
                      mode !== 'rename' && (
                        <>
                          <button className="chip on" onClick={() => load(l)} disabled={!ws}>
                            Load
                          </button>
                          <button
                            className="chip"
                            disabled={!saveable}
                            title="Replace this layout with the panels open now"
                            onClick={() => void run(async () => {
                              await api.updateLayout(l.id, { workspace: toSaved(current) })
                              return `Updated layout "${l.name}".`
                            })}
                          >
                            Update
                          </button>
                          <button className="chip" onClick={() => { setNewName(l.name); setEditing({ id: l.id, mode: 'rename' }) }}>
                            Rename
                          </button>
                          <button className="chip" onClick={() => setEditing({ id: l.id, mode: 'delete' })}>
                            Delete
                          </button>
                        </>
                      )
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
        <p className="fa-source">
          Layouts are stored in the Stodash database, so they're kept across browsers. Loading one replaces the open
          panels. Alt Shift 1–9 loads the first nine.
        </p>
      </div>
    </PanelFrame>
  )
}
