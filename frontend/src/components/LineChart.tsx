import { useEffect, useRef } from 'react'
import { AreaSeries, ColorType, CrosshairMode, createChart, type IChartApi } from 'lightweight-charts'
import { theme } from '../lib/theme'

interface Props {
  /** Dates as yyyy-MM-dd, oldest first. */
  points: { date: string; value: number }[]
  /** Formats axis and crosshair values. */
  format: (v: number) => string
}

/** A date/value area chart for economic series (ECO). Keeps the TradingView attribution the licence requires. */
export function LineChart({ points, format }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const chart = createChart(host, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: theme.panel }, textColor: theme.text, fontFamily: theme.font, fontSize: 11 },
      grid: { vertLines: { color: theme.grid }, horzLines: { color: theme.grid } },
      rightPriceScale: { borderColor: theme.border },
      timeScale: { borderColor: theme.border },
      crosshair: {
        mode: CrosshairMode.Magnet,
        vertLine: { color: theme.muted, labelBackgroundColor: '#1d2532' },
        horzLine: { color: theme.muted, labelBackgroundColor: '#1d2532' },
      },
    })
    chartRef.current = chart
    return () => {
      chartRef.current = null // first, so the series cleanup below knows the chart is gone
      chart.remove()
    }
  }, [])

  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    const series = chart.addSeries(AreaSeries, {
      lineColor: theme.accent,
      topColor: 'rgba(91, 140, 255, 0.28)',
      bottomColor: 'rgba(91, 140, 255, 0.02)',
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
  }, [points, format])

  return <div className="line-chart" ref={hostRef} />
}
