import { useCallback, useEffect } from 'react'
import { FILING_CATEGORIES, PERIODS, RANGES } from './api/types'
import { Brand, Clocks, StatusBar } from './components/Chrome'
import { CommandBar } from './components/CommandBar'
import { MarketStrip } from './components/MarketStrip'
import { useLocalStorage } from './hooks/useLocalStorage'
import { isFunction, parseCommand, type FunctionCode } from './lib/commands'
import { ChartPanel } from './panels/ChartPanel'
import { DescriptionPanel } from './panels/DescriptionPanel'
import { FilingsPanel } from './panels/FilingsPanel'
import { FinancialsPanel } from './panels/FinancialsPanel'
import { HelpPanel } from './panels/HelpPanel'
import { NewsPanel } from './panels/NewsPanel'
import { STATEMENTS, type PanelSpec, type PanelState } from './panels/types'

const MAX_PANELS = 4

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
        (p.kind === 'HELP' || (isFunction(p.kind) && typeof p.symbol === 'string')),
    )
  )
}

export default function App() {
  const [ws, setWs] = useLocalStorage<Workspace>('stodash.workspace.v1', DEFAULT_WORKSPACE, isWorkspace)
  const { panels } = ws
  const activeId = panels.some((p) => p.id === ws.activeId) ? ws.activeId : (panels[0]?.id ?? null)

  /** Put `panel` in the active slot, or in a new slot when asked (or when there is none). */
  const place = useCallback(
    (panel: PanelSpec, newPanel: boolean): string | null => {
      const wantsNew = newPanel || activeId === null
      if (wantsNew && panels.length >= MAX_PANELS)
        return `You can have up to ${MAX_PANELS} panels. Close one, or press Enter to load into the active panel.`

      setWs(() => {
        if (wantsNew) {
          const id = newId()
          return { panels: [...panels, { ...panel, id }], activeId: id }
        }
        return {
          panels: panels.map((p) => (p.id === activeId ? { ...panel, id: p.id } : p)),
          activeId,
        }
      })
      return null
    },
    [panels, activeId, setWs],
  )

  const runCommand = useCallback(
    (input: string, newPanel: boolean): string | null => {
      const cmd = parseCommand(input)
      if (!cmd) return null
      if (cmd.kind === 'error') return cmd.message
      if (cmd.kind === 'global') {
        if (cmd.command === 'CLEAR') {
          setWs({ panels: [], activeId: null })
          return null
        }
        // HELP: focus an existing help panel instead of opening a second one.
        const existing = panels.find((p) => p.kind === 'HELP')
        if (existing) {
          setWs((w) => ({ ...w, activeId: existing.id }))
          return null
        }
        return place({ kind: 'HELP' }, newPanel)
      }
      // Carry the active panel's view settings (chart range, FA statement, CF filter) over to the new view.
      const current = panels.find((p) => p.id === activeId)
      const keep = current && current.kind !== 'HELP' ? current : undefined
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
      )
    },
    [panels, activeId, place, setWs],
  )

  const update = (id: string, patch: Partial<PanelState>) =>
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
          if (p.kind === 'HELP') return <HelpPanel key={p.id} {...frame} onRun={(c) => runCommand(c, false)} />

          const onSwitch = (fn: FunctionCode) => update(p.id, { kind: fn })
          if (p.kind === 'FA')
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
          if (p.kind === 'N') return <NewsPanel key={p.id} {...frame} symbol={p.symbol} onSwitch={onSwitch} />
          if (p.kind === 'CF')
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
          if (p.kind === 'GP')
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
          return <DescriptionPanel key={p.id} {...frame} symbol={p.symbol} onSwitch={onSwitch} />
        })}
      </main>

      <StatusBar panelCount={panels.length} />
    </div>
  )
}

function EmptyState({ onRun }: { onRun: (cmd: string) => void }) {
  return (
    <div className="empty-state">
      <h2>No panels open</h2>
      <span>Type a command above, or try one of these:</span>
      <div className="examples">
        {['AAPL DES', 'NVDA GP 1Y', 'MSFT FA', 'TSLA N', 'AAPL CF', '^GSPC GP', 'HELP'].map((c) => (
          <button key={c} className="chip mono" onClick={() => onRun(c)}>
            {c}
          </button>
        ))}
      </div>
    </div>
  )
}
