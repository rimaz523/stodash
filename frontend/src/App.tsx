import { useCallback, useEffect, useState } from 'react'
import { api } from './api/client'
import { ECO_RANGES, FILING_CATEGORIES, PERIODS, RANGES } from './api/types'
import { Brand, Clocks, StatusBar } from './components/Chrome'
import { CommandBar } from './components/CommandBar'
import { MarketStrip } from './components/MarketStrip'
import { useLocalStorage } from './hooks/useLocalStorage'
import { isFunction, parseCommand, type FunctionCode } from './lib/commands'
import { ChartPanel } from './panels/ChartPanel'
import { CryptoPanel } from './panels/CryptoPanel'
import { DescriptionPanel } from './panels/DescriptionPanel'
import { EcoPanel } from './panels/EcoPanel'
import { FilingsPanel } from './panels/FilingsPanel'
import { FinancialsPanel } from './panels/FinancialsPanel'
import { FxPanel } from './panels/FxPanel'
import { HelpPanel } from './panels/HelpPanel'
import { NewsPanel } from './panels/NewsPanel'
import { WatchlistPanel, type WatchNotice } from './panels/WatchlistPanel'
import { YieldCurvePanel } from './panels/YieldCurvePanel'
import { GLOBAL_KINDS, STATEMENTS, isSymbolSpec, type PanelSpec, type PanelState } from './panels/types'

const MAX_PANELS = 4

/** Panels that make sense once: running their command again focuses the existing one. W can be open several times. */
const SINGLE_INSTANCE = new Set<string>(['HELP', 'ECO', 'YC', 'FX', 'CRYPTO'])

interface Workspace {
  panels: PanelState[]
  activeId: string | null
}

const newId = () => crypto.randomUUID()

const DEFAULT_WORKSPACE: Workspace = (() => {
  const a = newId()
  return {
    panels: [
      { id: a, kind: 'DES', symbol: 'AAPL' },
      { id: newId(), kind: 'GP', symbol: 'AAPL', range: '6M' },
    ],
    activeId: a,
  }
})()

function isWorkspace(v: unknown): v is Workspace {
  const w = v as Workspace
  return (
    !!w &&
    Array.isArray(w.panels) &&
    w.panels.length <= MAX_PANELS &&
    w.panels.every(
      (p) =>
        typeof p?.id === 'string' &&
        ((GLOBAL_KINDS as readonly string[]).includes(p.kind) ||
          (isFunction(p.kind) && typeof (p as { symbol?: unknown }).symbol === 'string')),
    )
  )
}

export default function App() {
  const [ws, setWs] = useLocalStorage<Workspace>('stodash.workspace.v1', DEFAULT_WORKSPACE, isWorkspace)
  const { panels } = ws
  const activeId = panels.some((p) => p.id === ws.activeId) ? ws.activeId : (panels[0]?.id ?? null)
  const active = panels.find((p) => p.id === activeId)
  // The outcome of the last "W ADD …" / "W DEL …", shown by the watchlist panel that it applied to.
  const [watchNotice, setWatchNotice] = useState<WatchNotice & { panelId?: string }>()

  /** Put `panel` in the active slot (or the slot `into`), or in a new slot when asked or when there is none. */
  const place = useCallback(
    (panel: PanelSpec, newPanel: boolean, into?: string): string | null => {
      const targetId = into ?? activeId
      const wantsNew = newPanel || targetId === null
      if (wantsNew && panels.length >= MAX_PANELS)
        return `You can have up to ${MAX_PANELS} panels. Close one, or press Enter to load into the active panel.`

      setWs(() => {
        if (wantsNew) {
          const id = newId()
          return { panels: [...panels, { ...panel, id }], activeId: id }
        }
        return {
          panels: panels.map((p) => (p.id === targetId ? { ...panel, id: p.id } : p)),
          activeId: targetId,
        }
      })
      return null
    },
    [panels, activeId, setWs],
  )

  /** Focus a panel and merge `patch` into it. */
  const focus = useCallback(
    (id: string, patch: Record<string, unknown> = {}) =>
      setWs((w) => ({
        activeId: id,
        panels: w.panels.map((p) => (p.id === id ? ({ ...p, ...patch } as PanelState) : p)),
      })),
    [setWs],
  )

  const runCommand = useCallback(
    (input: string, newPanel: boolean, into?: string): string | null => {
      const cmd = parseCommand(input)
      if (!cmd) return null
      switch (cmd.kind) {
        case 'error':
          return cmd.message

        case 'global': {
          if (cmd.command === 'CLEAR') {
            setWs({ panels: [], activeId: null })
            return null
          }
          const existing = SINGLE_INSTANCE.has(cmd.command) && panels.find((p) => p.kind === cmd.command)
          if (existing) {
            focus(existing.id)
            return null
          }
          return place({ kind: cmd.command }, newPanel)
        }

        case 'eco': {
          const existing = panels.find((p) => p.kind === 'ECO')
          if (existing) {
            focus(existing.id, { indicator: cmd.indicator })
            return null
          }
          return place({ kind: 'ECO', indicator: cmd.indicator }, newPanel)
        }

        case 'watchlist':
        case 'watchlist-edit': {
          const list = cmd.list || undefined
          // Use the active watchlist panel, else any open one, unless a new panel was asked for.
          const target = active?.kind === 'W' ? active : panels.find((p) => p.kind === 'W')
          let panelId = target?.id
          if (target && !newPanel) focus(target.id, list ? { list } : {})
          else {
            const err = place({ kind: 'W', list }, newPanel)
            if (err) return err
            panelId = undefined // the new panel; it becomes the active one
          }
          if (cmd.kind === 'watchlist-edit') {
            // Without a list name, change the list that panel shows (or the first list).
            const name = list ?? (target && !newPanel && target.kind === 'W' ? target.list : undefined)
            void editWatchlist(cmd.action, cmd.symbol, name).then((n) => setWatchNotice({ ...n, panelId }))
          }
          return null
        }

        case 'function': {
          // Carry the replaced panel's view settings (chart range, FA statement, CF filter) over to the new view.
          const target = into ? panels.find((p) => p.id === into) : active
          const keep = target && isSymbolSpec(target) ? target : undefined
          return place(
            {
              kind: cmd.fn,
              symbol: cmd.symbol,
              range: cmd.range ?? keep?.range,
              period: cmd.period ?? keep?.period,
              statement: keep?.statement,
              filter: keep?.filter,
            },
            newPanel,
            into,
          )
        }
      }
    },
    [panels, active, place, focus, setWs],
  )

  const update = (id: string, patch: Record<string, unknown>) =>
    setWs((w) => ({ ...w, panels: w.panels.map((p) => (p.id === id ? ({ ...p, ...patch } as PanelState) : p)) }))
  const close = (id: string) =>
    setWs((w) => {
      const idx = w.panels.findIndex((p) => p.id === id)
      const rest = w.panels.filter((p) => p.id !== id)
      const nextActive = w.activeId === id ? (rest[Math.min(idx, rest.length - 1)]?.id ?? null) : w.activeId
      return { panels: rest, activeId: nextActive }
    })
  const activate = (id: string) => setWs((w) => (w.activeId === id ? w : { ...w, activeId: id }))

  // Alt+1..4 makes that panel active.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey) return
      const n = Number(e.key)
      if (n >= 1 && n <= MAX_PANELS && panels[n - 1]) {
        e.preventDefault()
        setWs((w) => ({ ...w, activeId: panels[n - 1].id }))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [panels, setWs])

  // The panel that shows the last "W ADD …" result: the one it was run against, else the active or first W panel.
  const noticeTarget =
    (watchNotice?.panelId && panels.some((p) => p.id === watchNotice.panelId) && watchNotice.panelId) ||
    (active?.kind === 'W' ? active.id : panels.find((p) => p.kind === 'W')?.id)
  /**
   * Rows in W, FX and CRYPTO open symbols without replacing the list you clicked in: into the first other panel,
   * or a new panel when it's the only one. Shift-click always opens a new panel.
   */
  const openFrom = (sourceId: string) => (command: string, newPanel: boolean) => {
    const other = panels.find((p) => p.id !== sourceId)
    if (newPanel || !other) runCommand(command, true)
    else runCommand(command, false, other.id)
  }

  return (
    <div className="app">
      <header className="topbar">
        <Brand />
        <CommandBar onRun={runCommand} />
        <Clocks />
      </header>

      <MarketStrip onOpen={(symbol, newPanel) => runCommand(`${symbol} GP`, newPanel)} />

      <main className="workspace" data-count={Math.max(1, panels.length)}>
        {panels.length === 0 && <EmptyState onRun={(c) => runCommand(c, true)} />}
        {panels.map((p) => {
          const frame = {
            active: p.id === activeId,
            onActivate: () => activate(p.id),
            onClose: () => close(p.id),
          }

          switch (p.kind) {
            case 'HELP':
              return <HelpPanel key={p.id} {...frame} onRun={(c) => runCommand(c, false)} />
            case 'W':
              return (
                <WatchlistPanel
                  key={p.id}
                  {...frame}
                  listName={p.list}
                  onSelectList={(list) => update(p.id, { list })}
                  onOpen={openFrom(p.id)}
                  notice={p.id === noticeTarget ? watchNotice : undefined}
                />
              )
            case 'ECO':
              return (
                <EcoPanel
                  key={p.id}
                  {...frame}
                  indicator={p.indicator}
                  range={p.ecoRange && ECO_RANGES.includes(p.ecoRange) ? p.ecoRange : '5Y'}
                  onChange={(patch) => update(p.id, patch)}
                />
              )
            case 'YC':
              return <YieldCurvePanel key={p.id} {...frame} />
            case 'FX':
              return <FxPanel key={p.id} {...frame} onOpen={openFrom(p.id)} />
            case 'CRYPTO':
              return <CryptoPanel key={p.id} {...frame} onOpen={openFrom(p.id)} />
          }

          const onSwitch = (fn: FunctionCode) => update(p.id, { kind: fn })
          switch (p.kind) {
            case 'FA':
              return (
                <FinancialsPanel
                  key={p.id}
                  {...frame}
                  symbol={p.symbol}
                  period={p.period && PERIODS.includes(p.period) ? p.period : 'annual'}
                  statement={p.statement && STATEMENTS.includes(p.statement) ? p.statement : 'income'}
                  onChange={(patch) => update(p.id, patch)}
                  onSwitch={onSwitch}
                />
              )
            case 'N':
              return <NewsPanel key={p.id} {...frame} symbol={p.symbol} onSwitch={onSwitch} />
            case 'CF':
              return (
                <FilingsPanel
                  key={p.id}
                  {...frame}
                  symbol={p.symbol}
                  filter={p.filter && (FILING_CATEGORIES as readonly string[]).includes(p.filter) ? p.filter : 'all'}
                  onFilterChange={(filter) => update(p.id, { filter })}
                  onSwitch={onSwitch}
                />
              )
            case 'GP':
              return (
                <ChartPanel
                  key={p.id}
                  {...frame}
                  symbol={p.symbol}
                  range={p.range && RANGES.includes(p.range) ? p.range : '6M'}
                  onRangeChange={(range) => update(p.id, { range })}
                  onSwitch={onSwitch}
                />
              )
            default:
              return <DescriptionPanel key={p.id} {...frame} symbol={p.symbol} onSwitch={onSwitch} />
          }
        })}
      </main>

      <StatusBar panelCount={panels.length} />
    </div>
  )
}

const sameName = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'accent' }) === 0

/** Carries out "W ADD NVDA [TO list]" or "W DEL NVDA [FROM list]" and describes what happened. */
async function editWatchlist(action: 'add' | 'remove', symbol: string, listName?: string): Promise<WatchNotice> {
  const id = Date.now()
  try {
    const lists = await api.watchlists()
    const target = listName ? lists.find((l) => sameName(l.name, listName)) : lists[0]
    if (!target) return { id, text: `There's no watchlist called "${listName}".`, error: true }
    if (action === 'add') await api.addToWatchlist(target.id, symbol)
    else await api.removeFromWatchlist(target.id, symbol)
    return { id, text: `${action === 'add' ? 'Added' : 'Removed'} ${symbol} ${action === 'add' ? 'to' : 'from'} ${target.name}.`, error: false }
  } catch (e) {
    return { id, text: (e as Error).message, error: true }
  }
}

function EmptyState({ onRun }: { onRun: (cmd: string) => void }) {
  return (
    <div className="empty-state">
      <h2>No panels open</h2>
      <span>Type a command above, or try one of these:</span>
      <div className="examples">
        {['AAPL DES', 'NVDA GP 1Y', 'MSFT FA', 'W', 'ECO', 'YC', 'FX', 'CRYPTO', 'HELP'].map((c) => (
          <button key={c} className="chip mono" onClick={() => onRun(c)}>
            {c}
          </button>
        ))}
      </div>
    </div>
  )
}
