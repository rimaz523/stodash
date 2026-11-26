import { useState } from 'react'
import { api } from '../api/client'
import type { CryptoCoin } from '../api/types'
import { LoadError, PanelFrame } from '../components/PanelFrame'
import { Sparkline } from '../components/Sparkline'
import { useApi } from '../hooks/useApi'
import * as fmt from '../lib/format'
import type { OpenCommand, PanelProps } from './types'

type SortKey = 'rank' | 'price' | 'change24h' | 'change7d' | 'marketCap' | 'volume24h'

const COLUMNS: [SortKey, string][] = [
  ['rank', '#'],
  ['price', 'Price'],
  ['change24h', '24h'],
  ['change7d', '7d'],
  ['marketCap', 'Market cap'],
  ['volume24h', 'Volume 24h'],
]

export function CryptoPanel({ onOpen, ...frame }: PanelProps & { onOpen: OpenCommand }) {
  const board = useApi('crypto', (s) => api.crypto(s), 120_000)
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'rank', desc: false })

  const coins = [...(board.data?.coins ?? [])].sort((a, b) => {
    const av = a[sort.key] ?? -Infinity
    const bv = b[sort.key] ?? -Infinity
    return (av < bv ? -1 : av > bv ? 1 : 0) * (sort.desc ? -1 : 1)
  })
  // Rank sorts ascending first; everything else (bigger is more interesting) descending first.
  const toggle = (key: SortKey) => setSort((s) => (s.key === key ? { key, desc: !s.desc } : { key, desc: key !== 'rank' }))

  return (
    <PanelFrame fn="CRYPTO" title={<span>Crypto · top {board.data?.coins.length ?? 25}</span>} {...frame}>
      {board.loading && <div className="skeleton" style={{ height: 300, margin: 16 }} aria-hidden="true" />}
      {board.error && <LoadError error={board.error} what="crypto prices" />}
      {board.data && (
        <div className="crypto">
          <div className="crypto-table-wrap">
            <table className="crypto-table num">
              <thead>
                <tr>
                  {COLUMNS.slice(0, 1).map(([key, label]) => (
                    <SortHeader key={key} id={key} label={label} sort={sort} onSort={toggle} />
                  ))}
                  <th scope="col" className="coin">
                    Coin
                  </th>
                  {COLUMNS.slice(1).map(([key, label]) => (
                    <SortHeader key={key} id={key} label={label} sort={sort} onSort={toggle} />
                  ))}
                  <th scope="col" className="spark">
                    7 days
                  </th>
                </tr>
              </thead>
              <tbody>
                {coins.map((c) => (
                  <Row key={c.id} coin={c} onOpen={onOpen} />
                ))}
              </tbody>
            </table>
          </div>
          <p className="fa-source">Source: {board.data.source} · prices in USD · click a coin to chart it (Yahoo {'<SYMBOL>'}-USD)</p>
        </div>
      )}
    </PanelFrame>
  )
}

function SortHeader({ id, label, sort, onSort }: {
  id: SortKey
  label: string
  sort: { key: SortKey; desc: boolean }
  onSort: (k: SortKey) => void
}) {
  const active = sort.key === id
  return (
    <th scope="col" aria-sort={active ? (sort.desc ? 'descending' : 'ascending') : 'none'}>
      <button className="sort-btn" onClick={() => onSort(id)}>
        {label}
        <span className="sort-arrow" aria-hidden="true">
          {active ? (sort.desc ? '▼' : '▲') : ''}
        </span>
      </button>
    </th>
  )
}

function Row({ coin, onOpen }: { coin: CryptoCoin; onOpen: OpenCommand }) {
  const d24 = fmt.direction(coin.change24h)
  const d7 = fmt.direction(coin.change7d)
  return (
    <tr onClick={(e) => onOpen(`${coin.yahooSymbol} GP`, e.shiftKey)} title={`Chart ${coin.name} (${coin.yahooSymbol})`}>
      <td className="muted">{coin.rank}</td>
      <th scope="row" className="coin">
        <span className="mono">{coin.symbol}</span> <span className="muted">{coin.name}</span>
      </th>
      <td>{fmt.price(coin.price)}</td>
      <td className={d24}>{fmt.signedPct(coin.change24h)}</td>
      <td className={d7}>{fmt.signedPct(coin.change7d)}</td>
      <td>{fmt.big(coin.marketCap)}</td>
      <td>{fmt.big(coin.volume24h)}</td>
      <td className="spark">
        <Sparkline values={coin.sparkline} label={`${coin.symbol} over 7 days`} />
      </td>
    </tr>
  )
}
