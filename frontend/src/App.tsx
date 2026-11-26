import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { api } from './api/client'
import { ECO_RANGES, FILING_CATEGORIES, PERIODS, RANGES, SCREENER_SORTS, type Layout } from './api/types'
import { Brand, Clocks, StatusBar } from './components/Chrome'
import { CommandBar } from './components/CommandBar'
import { MarketStrip } from './components/MarketStrip'
import { Splitters } from './components/Splitters'
import { ThemeToggle } from './components/ThemeToggle'
import { RECONNECTED, useApi } from './hooks/useApi'
import { useLocalStorage } from './hooks/useLocalStorage'
import { parseCommand, type FunctionCode } from './lib/commands'
import { setTheme, toggleTheme } from './lib/themeMode'
import { EVEN, MAX_PANELS, findLayout, isWorkspace, saveLayout, type Sizes, type Workspace } from './lib/workspace'
import { ChartPanel } from './panels/ChartPanel'
import { CryptoPanel } from './panels/CryptoPanel'
import { DescriptionPanel } from './panels/DescriptionPanel'
import { EcoPanel } from './panels/EcoPanel'
import { FilingsPanel } from './panels/FilingsPanel'
import { FinancialsPanel } from './panels/FinancialsPanel'
import { FxPanel } from './panels/FxPanel'
import { HelpPanel } from './panels/HelpPanel'
import { LayoutPanel } from './panels/LayoutPanel'
import { NewsPanel } from './panels/NewsPanel'
import { ScreenerPanel } from './panels/ScreenerPanel'
import { TopPanel } from './panels/TopPanel'
import { WatchlistPanel, type WatchNotice } from './panels/WatchlistPanel'
import { YieldCurvePanel } from './panels/YieldCurvePanel'
import { STATEMENTS, cleanScreen, isSymbolSpec, type PanelProps, type PanelSpec, type PanelState } from './panels/types'

/** Panels that make sense once: running their command again focuses the existing one. W can be open several times. */
const SINGLE_INSTANCE = new Set<string>(['HELP', 'ECO', 'YC', 'FX', 'CRYPTO', 'TOP', 'EQS', 'LAYOUT'])

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

/** A short message after a command that has no panel of its own to report in (LAYOUT SAVE, Alt+Shift+1). */
interface Toast {
  id: number
  text: string
  error: boolean
}

export default function App() {
  const [ws, setWs] = useLocalStorage<Workspace>('stodash.workspace.v1', DEFAULT_WORKSPACE, isWorkspace)
  const { panels } = ws
  const activeId = panels.some((p) => p.id === ws.activeId) ? ws.activeId : (panels[0]?.id ?? null)
  const active = panels.find((p) => p.id === activeId)
  const sizes = ws.sizes ?? EVEN
  // Maximizing only means something with two or more panels, and only for a panel that's still open.
  const maximizedId = panels.length > 1 && panels.some((p) => p.id === ws.maximizedId) ? ws.maximizedId! : null
  // The outcome of the last "W ADD …" / "W DEL …", shown by the watchlist panel that it applied to.
  const [watchNotice, setWatchNotice] = useState<WatchNotice & { panelId?: string }>()
  const [toast, setToast] = useState<Toast>()
  // Bumped when a LAYOUT command changes the saved layouts, so an open LAYOUT panel reloads its list.
  const [layoutsVersion, setLayoutsVersion] = useState(0)
  // One health poll drives the status bar and the offline banner: every 5 s while the API is unreachable, else 30 s.
  const [offline, setOffline] = useState(false)
  const health = useApi('health', (signal) => api.health(signal), offline ? 5_000 : 30_000)
  const unreachable = !!health.error || health.stale
  if (unreachable !== offline && !health.loading) setOffline(unreachable)
  // Back online: panels that failed or went stale meanwhile load again.
  useEffect(() => {
    if (!offline && health.updatedAt) window.dispatchEvent(new Event(RECONNECTED))
  }, [offline]) // eslint-disable-line react-hooks/exhaustive-deps
  const notify = useCallback((text: string, error = false) => setToast({ id: Date.now(), text, error }), [])

  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(undefined), 4500)
    return () => window.clearTimeout(t)
  }, [toast])

  /** Put `panel` in the active slot (or the slot `into`), or in a new slot when asked or when there is none. */
  const place = useCallback(
    (panel: PanelSpec, newPanel: boolean, into?: string): string | null => {
      const targetId = into ?? activeId
      const wantsNew = newPanel || targetId === null
      if (wantsNew && panels.length >= MAX_PANELS)
        return `You can have up to ${MAX_PANELS} panels. Close one, or press Enter to load into the active panel.`

      setWs((w) => {
        if (wantsNew) {
          const id = newId()
          return { ...w, panels: [...panels, { ...panel, id }], activeId: id, maximizedId: null }
        }
        return {
          ...w,
          panels: panels.map((p) => (p.id === targetId ? { ...panel, id: p.id } : p)),
          activeId: targetId,
        }
      })
      return null
    },
    [panels, activeId, setWs],
  )

  /** Focus a panel and merge `patch` into it. A maximized workspace switches to that panel. */
  const focus = useCallback(
    (id: string, patch: Record<string, unknown> = {}) =>
      setWs((w) => ({
        ...w,
        activeId: id,
        maximizedId: w.maximizedId ? id : w.maximizedId,
        panels: w.panels.map((p) => (p.id === id ? ({ ...p, ...patch } as PanelState) : p)),
      })),
    [setWs],
  )

  /** Replaces the open panels with a saved layout. Returns an error message, or null. */
  const applyLayout = useCallback(
    (layout: Layout): string | null => {
      if (!isWorkspace(layout.workspace) || layout.workspace.panels.length === 0)
        return `"${layout.name}" can't be loaded: it was saved in a format this version doesn't understand.`
      const saved = layout.workspace
      setWs({ panels: saved.panels, activeId: saved.activeId, sizes: saved.sizes ?? EVEN, maximizedId: null })
      return null
    },
    [setWs],
  )

  const loadLayoutAt = useCallback(
    async (pick: (layouts: Layout[]) => Layout | undefined, missing: string) => {
      try {
        const layout = pick(await api.layouts())
        if (!layout) return notify(missing, true)
        const err = applyLayout(layout)
        notify(err ?? `Loaded layout "${layout.name}".`, !!err)
      } catch (e) {
        notify((e as Error).message, true)
      }
    },
    [applyLayout, notify],
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
            setWs((w) => ({ ...w, panels: [], activeId: null, maximizedId: null }))
            return null
          }
          const existing = SINGLE_INSTANCE.has(cmd.command) && panels.find((p) => p.kind === cmd.command)
          if (existing) {
            focus(existing.id)
            return null
          }
          return place({ kind: cmd.command }, newPanel)
        }

        case 'layout': {
          if (cmd.action === 'manage') {
            const existing = panels.find((p) => p.kind === 'LAYOUT')
            if (existing) {
              focus(existing.id)
              return null
            }
            return place({ kind: 'LAYOUT' }, newPanel)
          }
          const name = cmd.name
          if (cmd.action === 'load') {
            void loadLayoutAt((ls) => findLayout(ls, name), `There's no layout called "${name}". Type LAYOUT to see them.`)
            return null
          }
          if (cmd.action === 'save') {
            void saveLayout(name, ws)
              .then(({ layout, replaced }) => {
                notify(`${replaced ? 'Updated' : 'Saved'} layout "${layout.name}".`)
                setLayoutsVersion((v) => v + 1)
              })
              .catch((e: Error) => notify(e.message, true))
            return null
          }
          void api
            .layouts()
            .then(async (ls) => {
              const layout = findLayout(ls, name)
              if (!layout) return notify(`There's no layout called "${name}".`, true)
              await api.deleteLayout(layout.id)
              notify(`Deleted layout "${layout.name}".`)
              setLayoutsVersion((v) => v + 1)
            })
            .catch((e: Error) => notify(e.message, true))
          return null
        }

        case 'theme':
          if (cmd.mode) setTheme(cmd.mode)
          else toggleTheme()
          return null

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
    [panels, active, ws, place, focus, setWs, loadLayoutAt, notify],
  )

  const update = (id: string, patch: Record<string, unknown>) =>
    setWs((w) => ({ ...w, panels: w.panels.map((p) => (p.id === id ? ({ ...p, ...patch } as PanelState) : p)) }))
  const close = useCallback(
    (id: string) =>
      setWs((w) => {
        const idx = w.panels.findIndex((p) => p.id === id)
        const rest = w.panels.filter((p) => p.id !== id)
        const nextActive = w.activeId === id ? (rest[Math.min(idx, rest.length - 1)]?.id ?? null) : w.activeId
        return { ...w, panels: rest, activeId: nextActive, maximizedId: w.maximizedId === id ? null : w.maximizedId }
      }),
    [setWs],
  )
  const activate = (id: string) => setWs((w) => (w.activeId === id ? w : { ...w, activeId: id }))
  const toggleMaximize = useCallback(
    (id: string) => setWs((w) => ({ ...w, activeId: id, maximizedId: w.maximizedId === id ? null : id })),
    [setWs],
  )
  /** Moves a panel one slot earlier (-1) or later (+1) in the layout. */
  const move = useCallback(
    (id: string, by: -1 | 1) =>
      setWs((w) => {
        const i = w.panels.findIndex((p) => p.id === id)
        const j = i + by
        if (i < 0 || j < 0 || j >= w.panels.length) return w
        const next = [...w.panels]
        ;[next[i], next[j]] = [next[j], next[i]]
        return { ...w, panels: next }
      }),
    [setWs],
  )
  const setSizes = (next: Sizes) => setWs((w) => ({ ...w, sizes: next }))

  // Keyboard shortcuts. Matched on e.code so they work on any keyboard layout and with Option on a Mac.
  const shortcuts = useRef<(e: KeyboardEvent) => void>(() => {})
  const onShortcut = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement
    const typing = !!target.closest?.('input, textarea, select, [contenteditable="true"]')
    if (!e.altKey && !e.ctrlKey && !e.metaKey && e.key === '?' && !typing) {
      e.preventDefault()
      runCommand('HELP', panels.length < MAX_PANELS)
      return
    }
    if (!e.altKey || e.ctrlKey || e.metaKey) return

    const digit = /^Digit([1-9])$/.exec(e.code)
    if (digit && e.shiftKey) {
      // Alt+Shift+1–9: load the nth saved layout (in the LAYOUT panel's order).
      e.preventDefault()
      const n = Number(digit[1])
      void loadLayoutAt((ls) => ls[n - 1], `There's no saved layout ${n}. Type LAYOUT to save one.`)
      return
    }
    if (digit) {
      const n = Number(digit[1])
      if (n <= MAX_PANELS && panels[n - 1]) {
        e.preventDefault()
        focus(panels[n - 1].id)
      }
      return
    }
    if (e.shiftKey) return

    const id = activeId
    const order = panels.findIndex((p) => p.id === id)
    switch (e.code) {
      case 'KeyM':
        if (id && panels.length > 1) toggleMaximize(id)
        break
      case 'KeyX':
        if (id) close(id)
        break
      case 'BracketLeft':
        if (id) move(id, -1)
        break
      case 'BracketRight':
        if (id) move(id, 1)
        break
      case 'Comma':
      case 'Period': {
        if (panels.length < 2) break
        const step = e.code === 'Period' ? 1 : -1
        focus(panels[(order + step + panels.length) % panels.length].id)
        break
      }
      case 'KeyL':
        runCommand('LAYOUT', panels.length < MAX_PANELS)
        break
      case 'KeyT':
        toggleTheme()
        break
      default:
        return
    }
    e.preventDefault()
  }
  // The listener is added once and always calls the latest handler, which sees the current panels.
  useEffect(() => {
    shortcuts.current = onShortcut
  })
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => shortcuts.current(e)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // The panel that shows the last "W ADD …" result: the one it was run against, else the active or first W panel.
  const noticeTarget =
    (watchNotice?.panelId && panels.some((p) => p.id === watchNotice.panelId) && watchNotice.panelId) ||
    (active?.kind === 'W' ? active.id : panels.find((p) => p.kind === 'W')?.id)
  /**
   * Rows in W, FX, CRYPTO and EQS open symbols without replacing the list you clicked in: into the first other panel,
   * or a new panel when it's the only one. Shift-click always opens a new panel.
   */
  const openFrom = (sourceId: string) => (command: string, newPanel: boolean) => {
    const other = panels.find((p) => p.id !== sourceId)
    if (newPanel || !other) runCommand(command, true)
    else {
      runCommand(command, false, other.id)
      // From a maximized list, show where the row opened.
      if (maximizedId) setWs((w) => ({ ...w, maximizedId: null }))
    }
  }

  const shown = maximizedId ? 1 : panels.length
  const gridVars = {
    '--c1': `${sizes.col}fr`,
    '--c2': `${1 - sizes.col}fr`,
    '--r1': `${sizes.row}fr`,
    '--r2': `${1 - sizes.row}fr`,
  } as CSSProperties

  return (
    <div className="app">
      <header className="topbar">
        <Brand />
        <CommandBar onRun={runCommand} />
        <Clocks />
        <ThemeToggle />
      </header>

      <MarketStrip onOpen={(symbol, newPanel) => runCommand(`${symbol} GP`, newPanel)} />

      {offline && (
        <div className="offline-banner" role="alert">
          <strong>Can't reach the Stodash API.</strong> Start it with <code>{'scripts\\start.cmd'}</code> (or{' '}
          <code>dotnet run --project backend/Stodash.Api</code>). Panels reload by themselves when it's back.
          <button className="chip" onClick={health.reload}>
            Try now
          </button>
        </div>
      )}

      <main className="workspace" data-count={Math.max(1, shown)} style={gridVars}>
        {panels.length === 0 && <EmptyState onRun={(c) => runCommand(c, true)} />}
        {panels.map((p) => {
          const hidden = maximizedId !== null && p.id !== maximizedId
          const frame = {
            active: p.id === activeId,
            onActivate: () => activate(p.id),
            onClose: () => close(p.id),
            maximized: p.id === maximizedId,
            onToggleMaximize: panels.length > 1 ? () => toggleMaximize(p.id) : undefined,
          }
          // Hidden (not unmounted) while another panel is maximized, so it keeps its scroll position and data.
          return (
            <div key={p.id} className={`slot${hidden ? ' hidden' : ''}`}>
              {renderPanel(p, frame)}
            </div>
          )
        })}
        {!maximizedId && <Splitters count={panels.length} sizes={sizes} onChange={setSizes} />}
      </main>

      {toast && (
        <div key={toast.id} className={`toast${toast.error ? ' error' : ''}`} role={toast.error ? 'alert' : 'status'}>
          {toast.text}
        </div>
      )}

      <StatusBar panelCount={panels.length} health={health} />
    </div>
  )

  function renderPanel(p: PanelState, frame: PanelProps) {
    switch (p.kind) {
      case 'HELP':
        return <HelpPanel {...frame} onRun={(c) => runCommand(c, false)} />
      case 'W':
        return (
          <WatchlistPanel
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
            {...frame}
            indicator={p.indicator}
            range={p.ecoRange && ECO_RANGES.includes(p.ecoRange) ? p.ecoRange : '5Y'}
            onChange={(patch) => update(p.id, patch)}
          />
        )
      case 'YC':
        return <YieldCurvePanel {...frame} />
      case 'FX':
        return <FxPanel {...frame} onOpen={openFrom(p.id)} />
      case 'CRYPTO':
        return <CryptoPanel {...frame} onOpen={openFrom(p.id)} />
      case 'TOP':
        return (
          <TopPanel
            {...frame}
            source={typeof p.source === 'string' ? p.source : undefined}
            onSourceChange={(source) => update(p.id, { source })}
          />
        )
      case 'EQS':
        return (
          <ScreenerPanel
            {...frame}
            screen={cleanScreen(p.screen)}
            sort={p.sort && SCREENER_SORTS.includes(p.sort) ? p.sort : 'marketCap'}
            desc={typeof p.desc === 'boolean' ? p.desc : true}
            onChange={(patch) => update(p.id, patch)}
            onOpen={openFrom(p.id)}
          />
        )
      case 'LAYOUT':
        return <LayoutPanel {...frame} current={ws} onLoad={applyLayout} reloadKey={layoutsVersion} />
    }

    const onSwitch = (fn: FunctionCode) => update(p.id, { kind: fn })
    switch (p.kind) {
      case 'FA':
        return (
          <FinancialsPanel
            {...frame}
            symbol={p.symbol}
            period={p.period && PERIODS.includes(p.period) ? p.period : 'annual'}
            statement={p.statement && STATEMENTS.includes(p.statement) ? p.statement : 'income'}
            onChange={(patch) => update(p.id, patch)}
            onSwitch={onSwitch}
          />
        )
      case 'N':
        return <NewsPanel {...frame} symbol={p.symbol} onSwitch={onSwitch} />
      case 'CF':
        return (
          <FilingsPanel
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
            {...frame}
            symbol={p.symbol}
            range={p.range && RANGES.includes(p.range) ? p.range : '6M'}
            onRangeChange={(range) => update(p.id, { range })}
            onSwitch={onSwitch}
          />
        )
      default:
        return <DescriptionPanel {...frame} symbol={p.symbol} onSwitch={onSwitch} />
    }
  }
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
        {['AAPL DES', 'NVDA GP 1Y', 'MSFT FA', 'W', 'TOP', 'EQS', 'ECO', 'YC', 'FX', 'CRYPTO', 'LAYOUT', 'HELP'].map((c) => (
          <button key={c} className="chip mono" onClick={() => onRun(c)}>
            {c}
          </button>
        ))}
      </div>
    </div>
  )
}
