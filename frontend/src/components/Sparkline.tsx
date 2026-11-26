interface Props {
  values: number[]
  width?: number
  height?: number
  /** Colour by direction (last vs first) unless a fixed colour is given. */
  color?: string
  label?: string
}

/** A tiny line chart for table rows and tiles. */
export function Sparkline({ values, width = 96, height = 26, color, label }: Props) {
  const points = values.filter((v) => Number.isFinite(v))
  if (points.length < 2) return <svg className="sparkline" width={width} height={height} aria-hidden="true" />

  const min = Math.min(...points)
  const max = Math.max(...points)
  const span = max - min || 1
  const pad = 2
  const d = points
    .map((v, i) => {
      const x = (i / (points.length - 1)) * (width - pad * 2) + pad
      const y = height - pad - ((v - min) / span) * (height - pad * 2)
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
  const stroke = color ?? (points.at(-1)! >= points[0] ? 'var(--up)' : 'var(--down)')

  return (
    <svg
      className="sparkline"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <path d={d} fill="none" stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}
