import * as fmt from '../lib/format'

interface Props {
  label: string
  low: number | null | undefined
  high: number | null | undefined
  value: number | null | undefined
}

/** A low–high track with a marker for where the current price sits. */
export function RangeBar({ label, low, high, value }: Props) {
  if (!fmt.isNum(low) || !fmt.isNum(high) || high <= low) return null
  const pos = fmt.isNum(value) ? Math.min(1, Math.max(0, (value - low) / (high - low))) * 100 : null

  return (
    <div className="range-bar">
      <span className="label">{label}</span>
      <div>
        <div
          className="range-track"
          role="meter"
          aria-label={`${label}: ${fmt.price(value)} between ${fmt.price(low)} and ${fmt.price(high)}`}
          aria-valuemin={low}
          aria-valuemax={high}
          aria-valuenow={value ?? undefined}
        >
          <div className="range-fill" style={{ width: '100%' }} />
          {pos !== null && <div className="range-marker" style={{ left: `${pos}%` }} />}
        </div>
        <div className="range-ends num">
          <span>{fmt.price(low)}</span>
          <span>{fmt.price(high)}</span>
        </div>
      </div>
    </div>
  )
}
