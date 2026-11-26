import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { api } from '../api/client'
import type { SearchResult } from '../api/types'
import { useLocalStorage } from '../hooks/useLocalStorage'
import { FUNCTIONS, GLOBAL_COMMANDS } from '../lib/commands'

interface Suggestion {
  key: string
  code: string
  name: string
  meta?: string
  /** Text the input becomes on Tab. */
  complete: string
  /** Command run on Enter. */
  run: string
}

interface Props {
  /** Runs a command. Returns an error message to show, or null on success. */
  onRun: (input: string, newPanel: boolean) => string | null
}

const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every((s) => typeof s === 'string')

export function CommandBar({ onRun }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [value, setValue] = useState('')
  const [focused, setFocused] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [selected, setSelected] = useState(-1)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<{ query: string; items: SearchResult[] } | null>(null)
  const [history, setHistory] = useLocalStorage<string[]>('stodash.history.v1', [], isStringArray)
  const historyPos = useRef(-1)

  // What is being typed: the ticker (no space yet) or the function after it.
  const trimmed = value.trimStart()
  const spaceAt = trimmed.indexOf(' ')
  const stage = trimmed === '' ? 'empty' : spaceAt === -1 ? 'symbol' : 'function'
  const symbolToken = (spaceAt === -1 ? trimmed : trimmed.slice(0, spaceAt)).toUpperCase()
  const fnToken = spaceAt === -1 ? '' : trimmed.slice(spaceAt + 1).trim().toUpperCase()

  // Debounced ticker search while typing the first word.
  useEffect(() => {
    if (stage !== 'symbol') return
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      try {
        const items = await api.search(symbolToken, controller.signal)
        setResults({ query: symbolToken, items })
      } catch {
        /* suggestions are best-effort */
      }
    }, 180)
    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [stage, symbolToken])

  const suggestions = useMemo<Suggestion[]>(() => {
    if (stage === 'symbol') {
      const globals = Object.entries(GLOBAL_COMMANDS)
        .filter(([code]) => code.startsWith(symbolToken))
        .map(([code, c]) => ({ key: `g:${code}`, code, name: c.hint, meta: 'Command', complete: code, run: code }))
      const tickers =
        results?.query === symbolToken
          ? results.items.map((r) => ({
              key: `s:${r.symbol}`,
              code: r.symbol,
              name: r.name ?? '',
              meta: [r.type, r.exchange].filter(Boolean).join(' · '),
              complete: `${r.symbol} `,
              run: `${r.symbol} DES`,
            }))
          : []
      return [...globals, ...tickers]
    }
    if (stage === 'function' && !fnToken.includes(' ')) {
      return Object.entries(FUNCTIONS)
        .filter(([code]) => code.startsWith(fnToken))
        .map(([code, f]) => ({
          key: `f:${code}`,
          code,
          name: f.label,
          meta: f.hint,
          complete: `${symbolToken} ${code}`,
          run: `${symbolToken} ${code}`,
        }))
    }
    return []
  }, [stage, symbolToken, fnToken, results])

  const open = focused && !dismissed && !error && suggestions.length > 0
  const searching = stage === 'symbol' && results?.query !== symbolToken

  // Global shortcuts: "/" or Ctrl+K focuses; typing anywhere else starts a command.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      const target = e.target as HTMLElement
      const typing = target.closest('input, textarea, select, [contenteditable="true"]')
      if ((e.key === 'k' || e.key === 'K') && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        inputRef.current?.focus()
        inputRef.current?.select()
      } else if (!typing && e.key === '/') {
        e.preventDefault()
        inputRef.current?.focus()
      } else if (!typing && !e.ctrlKey && !e.metaKey && !e.altKey && /^[a-z0-9^]$/i.test(e.key)) {
        inputRef.current?.focus() // the keystroke lands in the input
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const change = (next: string) => {
    setValue(next)
    setSelected(-1)
    setDismissed(false)
    setError(null)
    historyPos.current = -1
  }

  const run = (command: string, newPanel: boolean) => {
    if (!command.trim()) return
    const err = onRun(command, newPanel)
    if (err) {
      setError(err)
      return
    }
    const normalized = command.trim().toUpperCase().replace(/\s+/g, ' ')
    setHistory((h) => [normalized, ...h.filter((x) => x !== normalized)].slice(0, 50))
    setValue('')
    setSelected(-1)
    setError(null)
    historyPos.current = -1
  }

  /**
   * Plain Enter on a lone word that isn't a known ticker ("tesla") opens the best search match,
   * so people can type company names. Exact tickers and commands run as typed.
   */
  const resolveTyped = (): string => {
    if (stage !== 'symbol' || results?.query !== symbolToken || symbolToken in GLOBAL_COMMANDS) return value
    const items = results.items
    if (items.length === 0 || items.some((r) => r.symbol === symbolToken)) return value
    return `${items[0].symbol} DES`
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case 'Enter': {
        e.preventDefault()
        const pick = open && selected >= 0 ? suggestions[selected] : undefined
        run(pick ? pick.run : resolveTyped(), e.shiftKey)
        break
      }
      case 'Tab': {
        const pick = open ? suggestions[Math.max(0, selected)] : undefined
        if (pick) {
          e.preventDefault()
          change(pick.complete)
        }
        break
      }
      case 'ArrowDown':
        if (open) {
          e.preventDefault()
          setSelected((i) => (i + 1) % suggestions.length)
        } else if (historyPos.current > 0) {
          e.preventDefault()
          historyPos.current -= 1
          setValue(history[historyPos.current])
          setDismissed(true)
        } else if (historyPos.current === 0) {
          e.preventDefault()
          historyPos.current = -1
          setValue('')
        }
        break
      case 'ArrowUp':
        if (open && selected >= 0) {
          e.preventDefault()
          setSelected((i) => i - 1)
        } else if ((!open || value === '') && history.length > 0) {
          e.preventDefault()
          historyPos.current = Math.min(history.length - 1, historyPos.current + 1)
          setValue(history[historyPos.current])
          setDismissed(true)
          setError(null)
        }
        break
      case 'Escape':
        if (open || error) {
          setDismissed(true)
          setError(null)
        } else {
          inputRef.current?.blur()
        }
        break
    }
  }

  return (
    <div className="command">
      <div className="command-field">
        <span className="prompt" aria-hidden="true">›</span>
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => change(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="Type a ticker and function, e.g. AAPL GP — or HELP"
          spellCheck={false}
          autoComplete="off"
          autoFocus
          role="combobox"
          aria-label="Command"
          aria-expanded={open}
          aria-controls="command-suggestions"
          aria-activedescendant={open && selected >= 0 ? `sugg-${selected}` : undefined}
        />
        {searching && <span className="muted" style={{ fontSize: 12 }}>searching…</span>}
        <span className="kbd">Ctrl K</span>
      </div>

      {open && (
        <ul className="suggestions" id="command-suggestions" role="listbox">
          {suggestions.map((s, i) => (
            <li
              key={s.key}
              id={`sugg-${i}`}
              role="option"
              aria-selected={i === selected}
              onMouseEnter={() => setSelected(i)}
              // mousedown, not click, so the input doesn't blur first
              onMouseDown={(e) => {
                e.preventDefault()
                run(s.run, e.shiftKey)
              }}
            >
              <span className="s-code">{s.code}</span>
              <span className="s-name">{s.name}</span>
              <span className="s-meta">{s.meta}</span>
            </li>
          ))}
        </ul>
      )}

      {error && focused && (
        <div className="command-error" role="alert">
          {error}
        </div>
      )}
    </div>
  )
}
