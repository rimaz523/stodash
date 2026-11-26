import { useEffect, useRef, useState } from 'react'
import type { StreamState } from '../api/types'

export interface LiveTrade {
  price: number
  /** Unix milliseconds */
  time: number
}

export interface QuoteStreamState {
  /** The backend's connection to Finnhub, or "closed" when this tab can't reach /ws/quotes. */
  state: StreamState | 'closed'
  /** Symbols currently streaming. Everything else has to be polled. */
  live: Set<string>
  /** Latest trade per symbol since this hook started. */
  trades: Record<string, LiveTrade>
}

type ServerMessage =
  | { type: 'status'; state: StreamState; live: string[]; error?: string | null }
  | { type: 'trades'; trades: { symbol: string; price: number; time: number }[] }

/**
 * Live prices for `symbols` from the backend relay at /ws/quotes (one WebSocket per hook). Reconnects with growing
 * delays if the connection drops. Only US stock tickers stream; check `live` to know which.
 */
export function useQuoteStream(symbols: string[]): QuoteStreamState {
  const [status, setStatus] = useState<{ state: QuoteStreamState['state']; live: string[] }>({ state: 'connecting', live: [] })
  const [trades, setTrades] = useState<Record<string, LiveTrade>>({})
  const socketRef = useRef<WebSocket | null>(null)
  // The symbols to (re)subscribe with when the socket opens; kept in sync by the effect below.
  const symbolsRef = useRef(symbols)
  const key = symbols.join(',')

  // One connection for the hook's lifetime; reconnect after drops.
  useEffect(() => {
    let closed = false
    let retry = 1000
    let timer: number | undefined

    const connect = () => {
      const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws/quotes`
      const ws = new WebSocket(url)
      socketRef.current = ws
      ws.onopen = () => {
        retry = 1000
        ws.send(JSON.stringify({ subscribe: symbolsRef.current }))
      }
      ws.onmessage = (e) => {
        let msg: ServerMessage
        try {
          msg = JSON.parse(e.data as string) as ServerMessage
        } catch {
          return
        }
        if (msg.type === 'status') setStatus({ state: msg.state, live: msg.live })
        else if (msg.type === 'trades')
          setTrades((t) => {
            const next = { ...t }
            for (const tr of msg.trades)
              if (!next[tr.symbol] || tr.time >= next[tr.symbol].time) next[tr.symbol] = { price: tr.price, time: tr.time }
            return next
          })
      }
      ws.onclose = () => {
        if (closed) return
        setStatus({ state: 'closed', live: [] })
        timer = window.setTimeout(connect, retry)
        retry = Math.min(30_000, retry * 2)
      }
    }

    connect()
    return () => {
      closed = true
      window.clearTimeout(timer)
      socketRef.current?.close()
      socketRef.current = null
    }
  }, [])

  // Tell the server whenever the list changes.
  useEffect(() => {
    symbolsRef.current = key ? key.split(',') : []
    const ws = socketRef.current
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ subscribe: symbolsRef.current }))
  }, [key])

  return { state: status.state, live: new Set(status.live), trades }
}
