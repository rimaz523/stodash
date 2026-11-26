import { useEffect, useRef } from 'react'
import { AreaSeries, ColorType, CrosshairMode, createChart, type IChartApi } from 'lightweight-charts'
import { chartTheme, withAlpha } from '../lib/theme'
import { useTheme } from '../lib/themeMode'

interface Props {
  /** Dates as yyyy-MM-dd, oldest first. */
  points: { date: string; value: number }[]
  /** Formats axis and crosshair values. */
  format: (v: number) => string
}

/** A date/value area chart for economic series (ECO). Keeps the TradingView attribution the licence requires. */
export function LineChart({ points, format }: Props) {
  const mode = useTheme()
  const hostRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const chart = createChart(host, { autoSize: true, crosshair: { mode: CrosshairMode.Magnet } })
    chartRef.current = chart
    return () => {
      chartRef.current = null // first, so the series cleanup below knows the chart is gone
      chart.remove()
    }
  }, [])

  // Colors come from the theme: set them now and whenever it changes.
  useEffect(() => {
    const theme = chartTheme()
    chartRef.current?.applyOptions({
      layout: { background: { type: ColorType.Solid, color: theme.panel }, textColor: theme.text, fontFamily: theme.font, fontSize: 11 },
      grid: { vertLines: { color: theme.grid }, horzLines: { color: theme.grid } },
      rightPriceScale: { borderColor: theme.border },
      timeScale: { borderColor: theme.border },
      crosshair: {
        vertLine: { color: theme.muted, labelBackgroundColor: theme.label },
        horzLine: { color: theme.muted, labelBackgroundColor: theme.label },
      },
    })
  }, [mode])

  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    const theme = chartTheme()
    const series = chart.addSeries(AreaSeries, {
      lineColor: theme.accent,
      topColor: withAlpha(theme.accent, 0.28),
      bottomColor: withAlpha(theme.accent, 0.02),
      lineWidth: 2,
      priceFormat: { type: 'custom', formatter: format, minMove: 0.01 },
    })
    series.setData(points.map((p) => ({ time: p.date, value: p.value })))
    chart.timeScale().fitContent()
    return () => {
      // React may tear the chart down first (e.g. StrictMode's double mount); removing a series from a removed
      // chart throws.
      if (chartRef.current === chart) chart.removeSeries(series)
    }
  }, [points, format, mode])

  return <div className="line-chart" ref={hostRef} />
}
