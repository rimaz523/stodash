import { api } from '../api/client'
import type { Layout } from '../api/types'
import { isFunction } from './commands'
import { GLOBAL_KINDS, isSymbolSpec, type PanelState } from '../panels/types'

export const MAX_PANELS = 4

/** Split positions, as the first column's and first row's share of the workspace (0.5 = even). */
export interface Sizes {
  col: number
  row: number
}

export const EVEN: Sizes = { col: 0.5, row: 0.5 }
export const MIN_SHARE = 0.2
export const MAX_SHARE = 0.8

export const clampShare = (n: number) => Math.min(MAX_SHARE, Math.max(MIN_SHARE, n))

/** What App keeps in localStorage ("stodash.workspace.v1") and what a saved layout holds. */
export interface Workspace {
  panels: PanelState[]
  activeId: string | null
  /** Missing in workspaces saved before panels could be resized: even splits. */
  sizes?: Sizes
  /** The panel shown alone (Alt+M), if any. Not part of saved layouts. */
  maximizedId?: string | null
}

const isShare = (n: unknown) => typeof n === 'number' && n >= MIN_SHARE && n <= MAX_SHARE

export function isWorkspace(v: unknown): v is Workspace {
  const w = v as Workspace
  return (
    !!w &&
    typeof w === 'object' &&
    Array.isArray(w.panels) &&
    w.panels.length <= MAX_PANELS &&
    w.panels.every(
      (p) =>
        typeof p?.id === 'string' &&
        ((GLOBAL_KINDS as readonly string[]).includes(p.kind) ||
          (isFunction(p.kind) && typeof (p as { symbol?: unknown }).symbol === 'string')),
    ) &&
    (w.activeId === null || typeof w.activeId === 'string') &&
    (w.sizes === undefined || (!!w.sizes && isShare(w.sizes.col) && isShare(w.sizes.row))) &&
    (w.maximizedId === undefined || w.maximizedId === null || typeof w.maximizedId === 'string')
  )
}

/** The part of a workspace a layout saves: its panels (minus the layout manager itself), focus and sizes. */
export function toSaved(ws: Workspace): Workspace {
  const panels = ws.panels.filter((p) => p.kind !== 'LAYOUT')
  const activeId = panels.some((p) => p.id === ws.activeId) ? ws.activeId : (panels[0]?.id ?? null)
  return { panels, activeId, sizes: ws.sizes ?? EVEN }
}

/** "AAPL DES", "W Tech", "TOP": how a panel reads in a list of layouts. */
export function describePanel(p: PanelState): string {
  if (isSymbolSpec(p)) return `${p.symbol} ${p.kind}`
  if (p.kind === 'W' && p.list) return `W ${p.list}`
  return p.kind
}

const sameName = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'accent' }) === 0

export const findLayout = (layouts: Layout[], name: string) => layouts.find((l) => sameName(l.name, name))

/** Saves `ws` as `name`, replacing a layout of that name if there is one. Returns what happened, for a message. */
export async function saveLayout(name: string, ws: Workspace): Promise<{ layout: Layout; replaced: boolean }> {
  const saved = toSaved(ws)
  if (saved.panels.length === 0) throw new Error('Open at least one panel before saving a layout.')
  const existing = findLayout(await api.layouts(), name.trim())
  if (existing) return { layout: await api.updateLayout(existing.id, { workspace: saved }), replaced: true }
  return { layout: await api.createLayout(name.trim(), saved), replaced: false }
}
