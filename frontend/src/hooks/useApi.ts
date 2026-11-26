import { useEffect, useRef, useState } from 'react'

export interface ApiState<T> {
  data: T | undefined
  error: Error | undefined
  loading: boolean
}

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
  const [state, setState] = useState<ApiState<T> & { key: string | null }>({
    key: null,
    data: undefined,
    error: undefined,
    loading: key !== null,
  })
  const loadRef = useRef(load)
  loadRef.current = load

  useEffect(() => {
    if (key === null) return
    let controller = new AbortController()
    setState({ key, data: undefined, error: undefined, loading: true })

    const run = async (isRefresh: boolean) => {
      controller = new AbortController()
      try {
        const data = await loadRef.current(controller.signal)
        setState({ key, data, error: undefined, loading: false })
      } catch (err) {
        if ((err as Error).name === 'AbortError') return
        // A failed background refresh keeps the last good data on screen.
        setState((s) => (isRefresh && s.data !== undefined ? s : { key, data: undefined, error: err as Error, loading: false }))
      }
    }

    void run(false)
    const timer = refreshMs
      ? window.setInterval(() => {
          if (document.visibilityState === 'visible') void run(true)
        }, refreshMs)
      : undefined

    return () => {
      controller.abort()
      if (timer) window.clearInterval(timer)
    }
  }, [key, refreshMs])

  // Hide state that belongs to a previous key during the render before the effect runs.
  if (state.key !== key) return { data: undefined, error: undefined, loading: key !== null }
  return state
}
