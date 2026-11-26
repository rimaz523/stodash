import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AreaSeries,
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  LineStyle,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type MouseEventParams,
  type SeriesType,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts'
import type { PriceBar, PriceHistory } from '../api/types'
import * as fmt from '../lib/format'
import { chartTheme, type ChartTheme } from '../lib/theme'
import { useTheme } from '../lib/themeMode'
import { tzOffsetSeconds } from '../lib/time'

export type ChartType = 'candle' | 'area'

export interface ChartOptions {
  type: ChartType
  sma20: boolean
  sma50: boolean
  volume: boolean
}

interface Props {
  history: PriceHistory
  options: ChartOptions
}

/** Moving average of closes; undefined until there are `n` bars. */
function sma(bars: PriceBar[], n: number): (number | undefined)[] {
  const out: (number | undefined)[] = new Array(bars.length)
  let sum = 0
  for (let i = 0; i < bars.length; i++) {
    sum += bars[i].close
    if (i >= n) sum -= bars[i - n].close
    out[i] = i >= n - 1 ? sum / n : undefined
  }
  return out
}

function precisionFor(bars: PriceBar[]) {
  const last = bars.at(-1)?.close ?? 100
  return Math.abs(last) < 1 ? 4 : Math.abs(last) < 10 ? 3 : 2
}

function legendTime(t: number, intraday: boolean) {
  // Times are already shifted to exchange wall-clock, so format them as UTC.
  return new Date(t * 1000).toLocaleString('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    ...(intraday ? { hour: '2-digit', minute: '2-digit', hour12: false } : { year: 'numeric' }),
  })
}

/** The theme-dependent chart options, applied at creation and again whenever the theme changes. */
function themeOptions(theme: ChartTheme) {
  return {
    layout: { background: { type: ColorType.Solid, color: theme.panel }, textColor: theme.text, fontFamily: theme.font, fontSize: 11 },
    grid: { vertLines: { color: theme.grid }, horzLines: { color: theme.grid } },
    rightPriceScale: { borderColor: theme.border },
    timeScale: { borderColor: theme.border },
    crosshair: {
      vertLine: { color: theme.muted, labelBackgroundColor: theme.label },
      horzLine: { color: theme.muted, labelBackgroundColor: theme.label },
    },
  }
}

export function PriceChart({ history, options }: Props) {
  const mode = useTheme()
  const hostRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<SeriesType>[]>([])
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)

  // Shift UTC bar times to the exchange's wall clock so the axis reads 09:30–16:00 for NYSE,
  // whatever the viewer's own time zone is.
  const prepared = useMemo(() => {
    const tz = history.timezone
    const times = history.bars.map((b) => (tz ? b.time + tzOffsetSeconds(b.time, tz) : b.time) as UTCTimestamp)
    const indexByTime = new Map(times.map((t, i) => [t as number, i]))
    return {
      times,
      indexByTime,
      sma20: sma(history.bars, 20),
      sma50: sma(history.bars, 50),
      hasVolume: history.bars.some((b) => b.volume > 0),
    }
  }, [history])

  // Create the chart once.
  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const base = themeOptions(chartTheme())
    const chart = createChart(host, {
      autoSize: true,
      ...base,
      timeScale: { ...base.timeScale, rightOffset: 3, secondsVisible: false },
      crosshair: { ...base.crosshair, mode: CrosshairMode.Normal },
    })
    chartRef.current = chart
    return () => {
      chart.remove()
      chartRef.current = null
      seriesRef.current = []
    }
  }, [])

  // Recolor the chart itself when the theme changes (the series effect below recolors the series).
  useEffect(() => {
    chartRef.current?.applyOptions(themeOptions(chartTheme()))
  }, [mode])

  // Rebuild series whenever data, display options or the theme change.
  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    const theme = chartTheme()
    for (const s of seriesRef.current) chart.removeSeries(s)
    seriesRef.current = []

    const { bars, intraday, previousClose } = history
    const { times } = prepared
    const precision = precisionFor(bars)
    const priceFormat = { type: 'price' as const, precision, minMove: 10 ** -precision }
    const showVolume = options.volume && prepared.hasVolume

    chart.applyOptions({ timeScale: { timeVisible: intraday } })

    const first = bars[0]?.close
    const last = bars.at(-1)?.close
    const baseline = history.range === '1D' && fmt.isNum(previousClose) ? previousClose : first
    const rising = fmt.isNum(last) && fmt.isNum(baseline) ? last >= baseline : true

    let main: ISeriesApi<SeriesType>
    if (options.type === 'candle') {
      const s = chart.addSeries(CandlestickSeries, {
        upColor: theme.up,
        downColor: theme.down,
        borderVisible: false,
        wickUpColor: theme.up,
        wickDownColor: theme.down,
        priceFormat,
      })
      s.setData(bars.map((b, i) => ({ time: times[i], open: b.open, high: b.high, low: b.low, close: b.close })))
      main = s
    } else {
      const color = rising ? theme.up : theme.down
      const s = chart.addSeries(AreaSeries, {
        lineColor: color,
        topColor: `${color}40`,
        bottomColor: `${color}00`,
        lineWidth: 2,
        priceFormat,
      })
      s.setData(bars.map((b, i) => ({ time: times[i], value: b.close })))
      main = s
    }
    main.priceScale().applyOptions({ scaleMargins: { top: 0.08, bottom: showVolume ? 0.24 : 0.06 } })
    seriesRef.current.push(main)

    if (history.range === '1D' && fmt.isNum(previousClose)) {
      main.createPriceLine({
        price: previousClose,
        color: theme.muted,
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: 'Prev close',
      })
    }

    const addSma = (values: (number | undefined)[], color: string) => {
      const s = chart.addSeries(LineSeries, {
        color,
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
        priceFormat,
      })
      s.setData(values.flatMap((v, i) => (v === undefined ? [] : [{ time: times[i], value: v }])))
      seriesRef.current.push(s)
    }
    if (options.sma20) addSma(prepared.sma20, theme.sma20)
    if (options.sma50) addSma(prepared.sma50, theme.sma50)

    if (showVolume) {
      const vol = chart.addSeries(HistogramSeries, {
        priceScaleId: 'volume',
        priceFormat: { type: 'volume' },
        priceLineVisible: false,
        lastValueVisible: false,
      })
      vol.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } })
      vol.setData(
        bars.map((b, i) => ({
          time: times[i],
          value: b.volume,
          color: b.close >= b.open ? `${theme.up}55` : `${theme.down}55`,
        })),
      )
      seriesRef.current.push(vol)
    }

    chart.timeScale().fitContent()
    setHoverIndex(null)
  }, [history, prepared, options, mode])

  // Crosshair legend.
  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    const onMove = (param: MouseEventParams<Time>) => {
      const i = param.time === undefined ? undefined : prepared.indexByTime.get(param.time as number)
      setHoverIndex(i ?? null)
    }
    chart.subscribeCrosshairMove(onMove)
    return () => chart.unsubscribeCrosshairMove(onMove)
  }, [prepared])

  const bars = history.bars
  const idx = hoverIndex ?? bars.length - 1
  const bar = bars[idx]
  const prevClose = idx > 0 ? bars[idx - 1].close : history.previousClose
  const barChange = bar && fmt.isNum(prevClose) && prevClose !== 0 ? ((bar.close - prevClose) / prevClose) * 100 : null
  const digits = precisionFor(bars)

  return (
    <div className="chart-wrap">
      <div ref={hostRef} className="chart-host" />
      {bar && (
        <div className="legend num">
          <span>{legendTime(prepared.times[idx], history.intraday)}</span>
          {options.type === 'candle' && (
            <>
              <span><b>O</b>{fmt.price(bar.open, digits)}</span>
              <span><b>H</b>{fmt.price(bar.high, digits)}</span>
              <span><b>L</b>{fmt.price(bar.low, digits)}</span>
            </>
          )}
          <span><b>C</b>{fmt.price(bar.close, digits)}</span>
          <span className={fmt.direction(barChange)}>{fmt.signedPct(barChange)}</span>
          {prepared.hasVolume && bar.volume > 0 && <span><b>Vol</b>{fmt.big(bar.volume)}</span>}
          {options.sma20 && prepared.sma20[idx] !== undefined && (
            <span className="sma20"><b>SMA20</b>{fmt.price(prepared.sma20[idx], digits)}</span>
          )}
          {options.sma50 && prepared.sma50[idx] !== undefined && (
            <span className="sma50"><b>SMA50</b>{fmt.price(prepared.sma50[idx], digits)}</span>
          )}
        </div>
      )}
      {bars.length === 0 && (
        <div className="chart-overlay state">
          <strong>No price data for this range</strong>
          <span>Try a longer range.</span>
        </div>
      )}
    </div>
  )
}
