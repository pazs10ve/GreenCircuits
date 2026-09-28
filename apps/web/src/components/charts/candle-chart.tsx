"use client"

import { useEffect, useRef, useState } from "react"
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  LineStyle,
  createChart,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts"
import { formatCompact, formatPct, formatPrice } from "@greencircuits/market/format"
import type { Candle } from "@greencircuits/market/types"
import { cn } from "@/lib/utils"
import { bollinger, ema, macd, rsi, sma, type Indicator } from "./indicators"
import { useChartPalette } from "./theme"
import { istTickFormatter } from "./time"

/** Line colours for the studies: distinct from each other and from green and red, readable on paper and on the dark theme. */
const STUDY = {
  sma20: "#3a78d4",
  sma50: "#d08a1c",
  sma200: "#8a55d0",
  ema20: "#138f7c",
  signal: "#d08a1c",
} as const

/** Height of a study with a pane of its own (RSI, MACD). */
const PANE = 120

const istLabel = (seconds: number, intraday: boolean) =>
  new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    ...(intraday ? { hour: "2-digit", minute: "2-digit", hour12: false } : { year: "numeric" }),
  }).format(seconds * 1000)

interface Reading {
  bar: Candle
  prev?: Candle
  studies: { label: string; value: string; color: string }[]
}

/**
 * Candles, with volume under them and the studies a reader picks: moving
 * averages and Bollinger bands over the price, RSI and MACD in panes of their
 * own. The first bars are there only so the averages have history behind
 * them; the chart opens on the latest `visible` bars and scrolls back. The
 * legend reads the bar under the crosshair, or the latest.
 */
export function CandleChart({
  candles,
  visible,
  indicators,
  height = 380,
  intraday = false,
  tick,
  onHover,
  ariaLabel,
  className,
}: {
  candles: Candle[]
  visible?: number
  indicators: Indicator[]
  height?: number
  intraday?: boolean
  tick: number
  onHover?: (bar: Candle | null) => void
  ariaLabel: string
  className?: string
}) {
  const container = useRef<HTMLDivElement>(null)
  const palette = useChartPalette()
  const [reading, setReading] = useState<Reading | null>(null)
  const hover = useRef(onHover)
  useEffect(() => {
    hover.current = onHover
  })

  const has = (id: Indicator) => indicators.includes(id)
  const panes = (has("rsi") ? 1 : 0) + (has("macd") ? 1 : 0)
  const total = height + panes * (PANE + 1)

  useEffect(() => {
    const el = container.current
    if (!el || !palette || candles.length === 0) return
    const decimals = tick >= 1 ? 0 : tick >= 0.05 ? 2 : 4
    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: palette.muted,
        fontFamily: palette.font,
        fontSize: 11,
        attributionLogo: false,
        panes: { separatorColor: palette.border, separatorHoverColor: palette.border, enableResize: false },
      },
      grid: { vertLines: { color: palette.grid }, horzLines: { color: palette.grid } },
      rightPriceScale: { borderColor: palette.border },
      timeScale: { borderColor: palette.border, tickMarkFormatter: istTickFormatter, timeVisible: intraday, secondsVisible: false, rightOffset: 4 },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: palette.muted, labelBackgroundColor: palette.text, style: LineStyle.Dashed },
        horzLine: { color: palette.muted, labelBackgroundColor: palette.text, style: LineStyle.Dashed },
      },
      localization: { timeFormatter: (t: Time) => istLabel(t as number, intraday), priceFormatter: (p: number) => formatPrice(p, tick) },
    })

    const times = candles.map((c) => c.time as UTCTimestamp)
    const closes = candles.map((c) => c.close)
    const line = (values: number[]) => values.flatMap((v, i) => (Number.isFinite(v) ? [{ time: times[i]!, value: v }] : []))

    const price = chart.addSeries(CandlestickSeries, {
      upColor: palette.up,
      downColor: palette.down,
      borderUpColor: palette.up,
      borderDownColor: palette.down,
      wickUpColor: palette.up,
      wickDownColor: palette.down,
      priceFormat: { type: "price", precision: decimals, minMove: tick },
    })
    price.setData(candles.map((c, i) => ({ time: times[i]!, open: c.open, high: c.high, low: c.low, close: c.close })))

    // Studies read by the legend, in the order they're drawn.
    const studies: { label: string; color: string; values: number[] }[] = []

    // Volume sits under the candles, on its own scale, taking the bottom fifth. Intraday bars carry none.
    const showVolume = has("volume") && candles.some((c) => c.volume > 0)
    if (showVolume) {
      const volume = chart.addSeries(HistogramSeries, { priceFormat: { type: "volume" }, priceScaleId: "volume", lastValueVisible: false, priceLineVisible: false })
      volume.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } })
      volume.setData(candles.map((c, i) => ({ time: times[i]!, value: c.volume, color: c.close >= c.open ? palette.upFill : palette.downFill })))
      price.priceScale().applyOptions({ scaleMargins: { top: 0.08, bottom: 0.22 } })
    }

    const overlay = (values: number[], color: string, label: string, dashed = false) => {
      const s = chart.addSeries(LineSeries, {
        color,
        lineWidth: 1,
        lineStyle: dashed ? LineStyle.Dashed : LineStyle.Solid,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      })
      s.setData(line(values))
      studies.push({ label, color, values })
    }
    if (has("sma20")) overlay(sma(closes, 20), STUDY.sma20, "SMA 20")
    if (has("sma50")) overlay(sma(closes, 50), STUDY.sma50, "SMA 50")
    if (has("sma200")) overlay(sma(closes, 200), STUDY.sma200, "SMA 200")
    if (has("ema20")) overlay(ema(closes, 20), STUDY.ema20, "EMA 20")
    if (has("bollinger")) {
      const b = bollinger(closes)
      overlay(b.upper, palette.muted, "BB upper", true)
      overlay(b.mid, palette.muted, "BB mid")
      overlay(b.lower, palette.muted, "BB lower", true)
    }

    let pane = 0
    if (has("rsi")) {
      pane += 1
      const values = rsi(closes, 14)
      const s = chart.addSeries(LineSeries, { color: STUDY.sma200, lineWidth: 1, priceLineVisible: false, lastValueVisible: true, priceFormat: { type: "price", precision: 1, minMove: 0.1 } }, pane)
      s.setData(line(values))
      for (const level of [70, 30]) s.createPriceLine({ price: level, color: palette.muted, lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: false, title: "" })
      studies.push({ label: "RSI", color: STUDY.sma200, values })
    }
    if (has("macd")) {
      pane += 1
      const m = macd(closes)
      const histogram = chart.addSeries(HistogramSeries, { priceLineVisible: false, lastValueVisible: false, priceFormat: { type: "price", precision: 2, minMove: 0.01 } }, pane)
      histogram.setData(m.histogram.flatMap((v, i) => (Number.isFinite(v) ? [{ time: times[i]!, value: v, color: v >= 0 ? palette.upFill : palette.downFill }] : [])))
      const macdLine = chart.addSeries(LineSeries, { color: STUDY.sma20, lineWidth: 1, priceLineVisible: false, lastValueVisible: false }, pane)
      macdLine.setData(line(m.line))
      const signalLine = chart.addSeries(LineSeries, { color: STUDY.signal, lineWidth: 1, priceLineVisible: false, lastValueVisible: false }, pane)
      signalLine.setData(line(m.signal))
      studies.push({ label: "MACD", color: STUDY.sma20, values: m.line }, { label: "Signal", color: STUDY.signal, values: m.signal })
    }
    // Relative sizes rather than heights: the chart sizes itself to its box after this, and shares the room out by these.
    chart.panes().forEach((p, i) => p.setStretchFactor(i === 0 ? height / PANE : 1))

    // Open on the latest bars; the warm-up history stays within scrolling reach.
    if (visible && candles.length > visible) chart.timeScale().setVisibleLogicalRange({ from: candles.length - visible - 0.5, to: candles.length + 3 })
    else chart.timeScale().fitContent()

    const readAt = (i: number): Reading => ({
      bar: candles[i]!,
      prev: candles[i - 1],
      studies: studies.flatMap((s) => (Number.isFinite(s.values[i]) ? [{ label: s.label, color: s.color, value: s.label === "RSI" ? s.values[i]!.toFixed(1) : formatPrice(s.values[i]!, tick) }] : [])),
    })
    setReading(readAt(candles.length - 1))
    const index = new Map(times.map((t, i) => [t as number, i]))
    chart.subscribeCrosshairMove((param) => {
      const i = param.time == null ? undefined : index.get(param.time as number)
      if (i == null) {
        setReading(readAt(candles.length - 1))
        hover.current?.(null)
        return
      }
      setReading(readAt(i))
      hover.current?.(candles[i]!)
    })

    return () => chart.remove()
    // `has` reads `indicators`, which is in the list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candles, indicators, palette, height, intraday, tick, visible])

  const bar = reading?.bar
  const change = bar && reading?.prev ? (bar.close / reading.prev.close - 1) * 100 : null

  return (
    <div className={cn("relative", className)}>
      {bar && (
        <div className="pointer-events-none absolute top-1 left-1 z-10 flex max-w-[calc(100%-5rem)] flex-wrap items-baseline gap-x-3 gap-y-0.5 rounded bg-paper/85 px-1.5 py-0.5 text-xs backdrop-blur-[2px]">
          <span className="text-ink-3">{istLabel(bar.time, intraday)}</span>
          {(["open", "high", "low", "close"] as const).map((k) => (
            <span key={k} className="num">
              <span className="text-ink-3">{k[0]!.toUpperCase()}</span> {formatPrice(bar[k], tick)}
            </span>
          ))}
          {change != null && <span className={cn("num", change > 0 ? "text-up" : change < 0 ? "text-down" : "text-ink-2")}>{formatPct(change)}</span>}
          {has("volume") && bar.volume > 0 && (
            <span className="num">
              <span className="text-ink-3">Vol</span> {formatCompact(bar.volume)}
            </span>
          )}
          {reading.studies.map((s) => (
            <span key={s.label} className="num" style={{ color: s.color }}>
              {s.label} {s.value}
            </span>
          ))}
        </div>
      )}
      <div ref={container} role="img" aria-label={ariaLabel} style={{ height: total }} />
    </div>
  )
}
