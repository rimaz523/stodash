import { useCallback, useEffect, useRef, useState } from 'react'

export interface ApiState<T> {
  data: T | undefined
  /** Set only when there's no data to show. A failed refresh keeps the data and sets `stale` instead. */
  error: Error | undefined
  /** True only while loading with nothing to show yet; background refreshes don't set it. */
  loading: boolean
  /** The last refresh failed, so `data` is older than it should be. */
  stale: boolean
  /** Why the last refresh failed, while `stale`. */
  staleError: Error | undefined
  /** When `data` was loaded (ms since epoch). */
  updatedAt: number | undefined
  /** Load again now, e.g. from a Retry button. Keeps showing the current data meanwhile. */
  reload: () => void
}

type Snapshot<T> = Omit<ApiState<T>, 'reload'> & { key: string | null }

/** Fired on window when the API answers again after being unreachable; panels with errors reload. */
export const RECONNECTED = 'stodash:reconnected'

const blank = <T,>(key: string | null): Snapshot<T> => ({
  key,
  data: undefined,
  error: undefined,
  loading: key !== null,
  stale: false,
  staleError: undefined,
  updatedAt: undefined,
})

/**
 * Runs `load` whenever `key` changes, and every `refreshMs` if given. Refreshes keep showing
 * the previous data until new data arrives, so panels never flash empty while polling.
 * Pass key = null to skip loading.
 */
export function useApi<T>(
  key: string | null,
  load: (signal: AbortSignal) => Promise<T>,
  refreshMs?: number,
): ApiState<T> {
  const [state, setState] = useState<Snapshot<T>>(() => blank<T>(null))
  const [nonce, setNonce] = useState(0)
  const loadRef = useRef(load)
  loadRef.current = load
  const reload = useCallback(() => setNonce((n) => n + 1), [])

  useEffect(() => {
    if (key === null) return
    let controller = new AbortController()
    // A reload of the same key keeps what's on screen; a new key starts blank.
    setState((s) => (s.key === key && s.data !== undefined ? s : { ...blank<T>(key), loading: true }))

    const run = async () => {
      controller = new AbortController()
      try {
        const data = await loadRef.current(controller.signal)
        setState({ key, data, error: undefined, loading: false, stale: false, staleError: undefined, updatedAt: Date.now() })
      } catch (err) {
        if ((err as Error).name === 'AbortError') return
        // A failed refresh keeps the last good data on screen and marks it stale.
        setState((s) =>
          s.key === key && s.data !== undefined
            ? { ...s, loading: false, stale: true, staleError: err as Error }
            : { ...blank<T>(key), loading: false, error: err as Error },
        )
      }
    }

    void run()
    const timer = refreshMs
      ? window.setInterval(() => {
          if (document.visibilityState === 'visible') void run()
        }, refreshMs)
      : undefined

    return () => {
      controller.abort()
      if (timer) window.clearInterval(timer)
    }
  }, [key, refreshMs, nonce])

  // When the API comes back, anything that failed or went stale loads again.
  const needsReload = state.error !== undefined || state.stale
  useEffect(() => {
    if (!needsReload) return
    window.addEventListener(RECONNECTED, reload)
    return () => window.removeEventListener(RECONNECTED, reload)
  }, [needsReload, reload])

  // Hide state that belongs to a previous key during the render before the effect runs.
  if (state.key !== key) return { ...blank<T>(key), reload }
  return { ...state, reload }
}

/** The stale state to show in a panel's header: the oldest stale result among `states`, if any. */
export function staleOf(...states: ApiState<unknown>[]): { since: number | undefined; error: Error | undefined; retry: () => void } | undefined {
  const stale = states.filter((s) => s.stale)
  if (stale.length === 0) return undefined
  const oldest = stale.reduce((a, b) => ((a.updatedAt ?? 0) <= (b.updatedAt ?? 0) ? a : b))
  return { since: oldest.updatedAt, error: oldest.staleError, retry: () => stale.forEach((s) => s.reload()) }
}
