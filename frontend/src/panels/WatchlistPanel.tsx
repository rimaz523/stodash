import { useEffect, useRef, useState, type DragEvent, type FormEvent } from 'react'
import { ApiError, api } from '../api/client'
import type { Quote, SearchResult, Watchlist } from '../api/types'
import { LoadError, PanelFrame } from '../components/PanelFrame'
import { RangeBar } from '../components/RangeBar'
import { useApi } from '../hooks/useApi'
import { useQuoteStream } from '../hooks/useQuoteStream'
import * as fmt from '../lib/format'
import { openRowProps } from '../lib/rows'
import type { OpenCommand, PanelProps } from './types'

/**
 * The result of an add/remove typed in the command bar ("W ADD NVDA TO Tech"). App carries out the change and hands
 * the outcome here, so the panel reloads its lists and shows the message.
 */
export interface WatchNotice {
  id: number
  text: string
  error: boolean
}

interface Props extends PanelProps {
  /** Name of the list to show; the first list when missing or not found. */
  listName?: string
  onSelectList: (name: string) => void
  onOpen: OpenCommand
  notice?: WatchNotice
}

type Editing = { mode: 'new' } | { mode: 'rename' } | { mode: 'delete' } | null

const sameName = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'accent' }) === 0
const errorText = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : 'Something went wrong.')

export function WatchlistPanel({ listName, onSelectList, onOpen, notice, ...frame }: Props) {
  const [lists, setLists] = useState<Watchlist[] | null>(null)
  const [loadError, setLoadError] = useState<Error | null>(null)
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null)
  const [editing, setEditing] = useState<Editing>(null)

  // A new notice from the command bar: show it and reload the lists (adjusting state during render, as React
  // recommends for responding to a changed prop).
  const [lastNotice, setLastNotice] = useState<number | undefined>(notice?.id)
  const [reload, setReload] = useState(0)
  if (notice && notice.id !== lastNotice) {
    setLastNotice(notice.id)
    setMessage({ text: notice.text, error: notice.error })
    if (!notice.error) setReload((r) => r + 1)
  }

  useEffect(() => {
    const controller = new AbortController()
    api
      .watchlists(controller.signal)
      .then(setLists)
      .catch((e: Error) => e.name !== 'AbortError' && setLoadError(e))
    return () => controller.abort()
  }, [reload])

  const list = lists?.find((l) => listName && sameName(l.name, listName)) ?? lists?.[0]
  const replace = (updated: Watchlist) => setLists((ls) => ls?.map((l) => (l.id === updated.id ? updated : l)) ?? null)

  const run = async (action: () => Promise<string | void>) => {
    try {
      const text = await action()
      setMessage(text ? { text, error: false } : null)
      return true
    } catch (e) {
      setMessage({ text: errorText(e), error: true })
      return false
    }
  }

  const add = (target: Watchlist, symbol: string) =>
    run(async () => {
      replace(await api.addToWatchlist(target.id, symbol))
      return `Added ${symbol.toUpperCase()} to ${target.name}.`
    })
  const remove = (target: Watchlist, symbol: string) =>
    run(async () => {
      replace(await api.removeFromWatchlist(target.id, symbol))
      return `Removed ${symbol.toUpperCase()} from ${target.name}.`
    })


  return (
    <PanelFrame fn="W" title={<span>Watchlists</span>} {...frame}>
      {loadError ? (
        <LoadError error={loadError} what="watchlists" onRetry={() => { setLoadError(null); setReload((r) => r + 1) }} />
      ) : !lists || !list ? (
        <RowsSkeleton />
      ) : (
        <div className="wl">
          <ListTabs
            lists={lists}
            current={list}
            editing={editing}
            onEdit={setEditing}
            onSelect={(l) => {
              setEditing(null)
              setMessage(null)
              onSelectList(l.name)
            }}
            onCreate={(name) =>
              run(async () => {
                const created = await api.createWatchlist(name)
                setLists((ls) => [...(ls ?? []), created])
                onSelectList(created.name)
                setEditing(null)
                return `Created ${created.name}.`
              })
            }
            onRename={(name) =>
              run(async () => {
                const renamed = await api.renameWatchlist(list.id, name)
                replace(renamed)
                onSelectList(renamed.name)
                setEditing(null)
              })
            }
            onDelete={() =>
              run(async () => {
                await api.deleteWatchlist(list.id)
                const rest = lists.filter((l) => l.id !== list.id)
                setLists(rest)
                onSelectList(rest[0].name)
                setEditing(null)
                return `Deleted ${list.name}.`
              })
            }
          />
          <AddSymbol onAdd={(s) => add(list, s)} />
          {message && (
            <div className={`wl-message${message.error ? ' error' : ''}`} role={message.error ? 'alert' : 'status'}>
              {message.text}
            </div>
          )}
          <ListTable
            key={list.id}
            list={list}
            onOpen={onOpen}
            onRemove={(s) => remove(list, s)}
            onReorder={(symbols) =>
              run(async () => {
                replace({ ...list, symbols }) // show the new order straight away
                replace(await api.reorderWatchlist(list.id, symbols))
              })
            }
          />
        </div>
      )}
    </PanelFrame>
  )
}

// ------------------------------------------------------------------ tabs

function ListTabs(props: {
  lists: Watchlist[]
  current: Watchlist
  editing: Editing
  onEdit: (e: Editing) => void
  onSelect: (l: Watchlist) => void
  onCreate: (name: string) => Promise<boolean>
  onRename: (name: string) => Promise<boolean>
  onDelete: () => Promise<boolean>
}) {
  const { lists, current, editing, onEdit } = props
  return (
    <div className="toolbar wl-tabs" role="toolbar" aria-label="Watchlists">
      {lists.map((l) => (
        <button
          key={l.id}
          className={`chip${l.id === current.id ? ' on' : ''}`}
          aria-pressed={l.id === current.id}
          onClick={() => props.onSelect(l)}
          onDoubleClick={() => l.id === current.id && onEdit({ mode: 'rename' })}
          title={l.id === current.id ? 'Double-click to rename' : undefined}
        >
          {l.name} <span className="count">{l.symbols.length}</span>
        </button>
      ))}
      {editing?.mode === 'new' ? (
        <NameInput label="New watchlist name" onSubmit={props.onCreate} onCancel={() => onEdit(null)} />
      ) : (
        <button className="chip" onClick={() => onEdit({ mode: 'new' })} title="New watchlist" aria-label="New watchlist">
          ＋
        </button>
      )}
      <span className="sep" />
      {editing?.mode === 'rename' ? (
        <NameInput label="Rename watchlist" initial={current.name} onSubmit={props.onRename} onCancel={() => onEdit(null)} />
      ) : editing?.mode === 'delete' ? (
        <span className="wl-confirm">
          Delete “{current.name}”?
          <button className="chip danger" onClick={() => void props.onDelete()}>
            Delete
          </button>
          <button className="chip" onClick={() => onEdit(null)}>
            Cancel
          </button>
        </span>
      ) : (
        <>
          <button className="chip" onClick={() => onEdit({ mode: 'rename' })}>
            Rename
          </button>
          <button className="chip" onClick={() => onEdit({ mode: 'delete' })} disabled={lists.length === 1}
            title={lists.length === 1 ? 'You need at least one watchlist' : undefined}>
            Delete
          </button>
        </>
      )}
    </div>
  )
}

function NameInput({ label, initial = '', onSubmit, onCancel }: {
  label: string
  initial?: string
  onSubmit: (name: string) => Promise<boolean>
  onCancel: () => void
}) {
  const [value, setValue] = useState(initial)
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (value.trim()) void onSubmit(value.trim())
  }
  return (
    <form className="wl-name" onSubmit={submit}>
      <input
        autoFocus
        aria-label={label}
        placeholder={label}
        value={value}
        maxLength={40}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && onCancel()}
      />
      <button className="chip on" type="submit">
        Save
      </button>
      <button className="chip" type="button" onClick={onCancel}>
        Cancel
      </button>
    </form>
  )
}

// ------------------------------------------------------------- add symbol

function AddSymbol({ onAdd }: { onAdd: (symbol: string) => Promise<boolean> }) {
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [suggestions, setSuggestions] = useState<SearchResult[]>([])

  // Debounced ticker suggestions for the datalist.
  useEffect(() => {
    const q = value.trim()
    if (q.length < 1) return
    const controller = new AbortController()
    const t = window.setTimeout(() => {
      api.search(q, controller.signal).then(setSuggestions).catch(() => {})
    }, 200)
    return () => {
      controller.abort()
      window.clearTimeout(t)
    }
  }, [value])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const symbol = value.trim().toUpperCase()
    if (!symbol || busy) return
    setBusy(true)
    if (await onAdd(symbol)) setValue('')
    setBusy(false)
  }

  return (
    <form className="wl-add" onSubmit={submit}>
      <input
        aria-label="Add symbol"
        placeholder="Add a symbol, e.g. AMD"
        value={value}
        list="wl-suggestions"
        spellCheck={false}
        autoComplete="off"
        onChange={(e) => setValue(e.target.value)}
      />
      <datalist id="wl-suggestions">
        {suggestions.map((s) => (
          <option key={s.symbol} value={s.symbol}>
            {s.name}
          </option>
        ))}
      </datalist>
      <button className="chip on" type="submit" disabled={busy || !value.trim()}>
        Add
      </button>
    </form>
  )
}

// ------------------------------------------------------------------ table

function ListTable({ list, onOpen, onRemove, onReorder }: {
  list: Watchlist
  onOpen: OpenCommand
  onRemove: (symbol: string) => void
  onReorder: (symbols: string[]) => void
}) {
  const stream = useQuoteStream(list.symbols)
  const streaming = stream.state === 'live'
  // Poll the full quotes (day range, volume) often when there's no stream, rarely when trades arrive live.
  const quotes = useApi(
    `wq:${list.id}:${list.symbols.join(',')}`,
    (s) => api.watchlistQuotes(list.id, s),
    streaming && stream.live.size > 0 ? 60_000 : 15_000,
  )

  // Keep the last good quote per symbol so adding a symbol doesn't blank the table while it reloads.
  const [known, setKnown] = useState<Record<string, Quote>>({})
  const [merged, setMerged] = useState<Quote[] | undefined>(undefined)
  if (quotes.data && quotes.data !== merged) {
    setMerged(quotes.data)
    setKnown((k) => ({ ...k, ...Object.fromEntries(quotes.data!.map((q) => [q.symbol, q])) }))
  }
  const [dragging, setDragging] = useState<string | null>(null)
  const [moved, setMoved] = useState<{ symbol: string; position: number } | null>(null)
  const tableRef = useRef<HTMLTableElement>(null)
  // After a keyboard move the row is re-rendered in its new place; put focus back on it.
  useEffect(() => {
    if (moved) tableRef.current?.querySelector<HTMLElement>(`tr[data-symbol="${CSS.escape(moved.symbol)}"]`)?.focus()
  }, [moved, list.symbols])

  if (list.symbols.length === 0)
    return (
      <div className="state">
        <strong>This list is empty</strong>
        <span>Add a symbol above, or type W ADD AAPL in the command bar.</span>
      </div>
    )
  if (quotes.error && Object.keys(known).length === 0) return <LoadError error={quotes.error} what="quotes" onRetry={quotes.reload} />

  const drop = (e: DragEvent, target: string) => {
    e.preventDefault()
    if (!dragging || dragging === target) return
    const order = list.symbols.filter((s) => s !== dragging)
    order.splice(order.indexOf(target), 0, dragging)
    setDragging(null)
    onReorder(order)
  }

  /** Keyboard reorder (Alt+↑/↓): moves a symbol one place and keeps focus on its row. */
  const move = (symbol: string, by: -1 | 1) => {
    const i = list.symbols.indexOf(symbol)
    const j = i + by
    if (j < 0 || j >= list.symbols.length) return
    const order = [...list.symbols]
    ;[order[i], order[j]] = [order[j], order[i]]
    setMoved({ symbol, position: j + 1 })
    onReorder(order)
  }

  const marketClosed = Object.values(known).some((q) => q.marketState === 'CLOSED' || q.marketState?.startsWith('POST'))

  return (
    <>
      <div className="wl-status">
        <StreamBadge state={stream.state} liveCount={list.symbols.filter((s) => stream.live.has(s)).length} total={list.symbols.length} />
        {marketClosed && <span className="muted">Market closed: prices are the last trade.</span>}
      </div>
      <div className="wl-table-wrap">
        <p className="sr-only" aria-live="polite">
          {moved ? `Moved ${moved.symbol} to position ${moved.position} of ${list.symbols.length}.` : ''}
        </p>
        <table className="wl-table num" ref={tableRef}>
          <thead>
            <tr>
              <th scope="col" className="grip" aria-label="Drag, or press Alt and an arrow key, to reorder" />
              <th scope="col">Symbol</th>
              <th scope="col" className="name">Name</th>
              <th scope="col">Last</th>
              <th scope="col">Chg</th>
              <th scope="col">Chg %</th>
              <th scope="col" className="range">Day range</th>
              <th scope="col" className="vol">Volume</th>
              <th scope="col">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {list.symbols.map((symbol) => {
              const q = known[symbol]
              const trade = stream.trades[symbol]
              const quoteTime = q?.time ? Date.parse(q.time) : 0
              const useTrade = trade && trade.time > quoteTime
              const price = useTrade ? trade.price : (q?.price ?? null)
              const prev = q?.previousClose ?? null
              const change = useTrade && fmt.isNum(prev) ? trade.price - prev : (q?.change ?? null)
              const pct = useTrade && fmt.isNum(prev) && prev !== 0 ? ((trade.price - prev) / prev) * 100 : (q?.changePercent ?? null)
              const direction = fmt.direction(change)

              return (
                <tr
                  key={symbol}
                  draggable
                  onDragStart={() => setDragging(symbol)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => drop(e, symbol)}
                  onDragEnd={() => setDragging(null)}
                  data-symbol={symbol}
                  {...openRowProps((n) => onOpen(`${symbol} DES`, n))}
                  className={`open-row${dragging === symbol ? ' dragging' : ''}`}
                  onKeyDown={(e) => {
                    if (e.target === e.currentTarget && e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
                      e.preventDefault()
                      move(symbol, e.key === 'ArrowUp' ? -1 : 1)
                    } else openRowProps((n) => onOpen(`${symbol} DES`, n)).onKeyDown(e)
                  }}
                  title={`${symbol}: click or Enter for DES, Shift for a new panel, Alt ↑↓ or drag to reorder`}
                >
                  <td className="grip" aria-hidden="true">⋮⋮</td>
                  <th scope="row" className="sym mono">
                    {symbol}
                    {stream.live.has(symbol) && <span className="live-dot" title="Streaming live" />}
                  </th>
                  <td className="name">{q?.name ?? (quotes.loading ? '…' : '')}</td>
                  <td>
                    <PriceCell price={price} />
                  </td>
                  <td className={direction}>{fmt.signed(change)}</td>
                  <td className={direction}>{fmt.signedPct(pct)}</td>
                  <td className="range">
                    <RangeBar label="" low={q?.dayLow} high={q?.dayHigh} value={price} />
                  </td>
                  <td className="vol">{fmt.big(q?.volume)}</td>
                  <td className="actions" onClick={(e) => e.stopPropagation()}>
                    {(['GP', 'FA', 'N'] as const).map((fn) => (
                      <button key={fn} className="chip mono" onClick={(e) => onOpen(`${symbol} ${fn}`, e.shiftKey)} title={`${symbol} ${fn}`}>
                        {fn}
                      </button>
                    ))}
                    <button className="icon-btn" onClick={() => onRemove(symbol)} aria-label={`Remove ${symbol}`} title={`Remove ${symbol}`}>
                      ✕
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}

/** A price that flashes green or red when it moves. */
function PriceCell({ price }: { price: number | null }) {
  const [last, setLast] = useState(price)
  const [flash, setFlash] = useState<{ dir: 'up' | 'down'; n: number } | null>(null)
  if (price !== last) {
    setLast(price)
    if (fmt.isNum(price) && fmt.isNum(last)) setFlash((f) => ({ dir: price > last ? 'up' : 'down', n: (f?.n ?? 0) + 1 }))
  }
  // A new key restarts the CSS animation on every move.
  return (
    <span key={flash?.n ?? 0} className={flash ? `flash-${flash.dir}` : undefined}>
      {fmt.price(price)}
    </span>
  )
}

function StreamBadge({ state, liveCount, total }: { state: string; liveCount: number; total: number }) {
  if (state === 'live' && liveCount > 0)
    return (
      <span className="badge stream live" title="Trades arrive as they happen, through Finnhub">
        <span className="live-dot" /> Live · {liveCount} of {total} streaming
      </span>
    )
  const why =
    state === 'off'
      ? 'no Finnhub key'
      : state === 'live'
        ? 'none of these symbols stream'
        : state === 'error'
          ? 'live stream unavailable'
          : state === 'closed'
            ? 'reconnecting'
            : 'connecting'
  return (
    <span className="badge stream" title="Quotes refresh every 15 seconds">
      Polling every 15 s · {why}
    </span>
  )
}

function RowsSkeleton() {
  return (
    <div style={{ display: 'grid', gap: 10, padding: '16px' }} aria-hidden="true">
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="skeleton" style={{ height: 16, width: `${94 - (i % 3) * 8}%` }} />
      ))}
    </div>
  )
}
